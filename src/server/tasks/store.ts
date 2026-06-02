import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Task, TaskStatus, TaskPriority, Attachment } from "../../shared/types.js";

export interface SearchOptions {
  q?: string;
  status?: TaskStatus;
  from?: string;
  to?: string;
  limit?: number;
  deviceId?: string;
  tags?: string[];
}

export interface TaskCounts {
  total: number;
  pending: number;
  picked: number;
  running: number;
  done: number;
  failed: number;
}

export interface TaskStore {
  createTask(task: Task): Promise<Task>;
  listTasks(status?: TaskStatus, limit?: number, deviceId?: string): Promise<Task[]>;
  searchTasks(options: SearchOptions): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<Task>;
  saveTaskResult(
    id: string,
    success: boolean,
    summary: string,
    details?: string,
  ): Promise<Task>;
  getTaskMessageId(id: string): Promise<string | undefined>;
  assignTask(taskId: string, deviceId: string): Promise<Task>;
  unassignTask(taskId: string): Promise<Task>;
  resetStaleTasks(timeoutMs?: number): Promise<number>;
  cleanupProcessedEvents(retentionDays?: number): Promise<number>;
  isEventProcessed(eventId: string): Promise<boolean>;
  markEventProcessed(eventId: string): Promise<void>;
  healthCheck(): Promise<boolean>;
  countTasksByStatus(): Promise<TaskCounts>;
  addTags(taskId: string, tags: string[]): Promise<Task>;
  removeTag(taskId: string, tag: string): Promise<Task>;
  listAllTags(): Promise<string[]>;
}

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["picked", "running"],
  picked: ["running"],
  running: ["done", "failed"],
  done: [],
  failed: [],
};

function isValidTransition(current: TaskStatus, next: TaskStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

function parseAttachments(raw: unknown): Attachment[] | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed as Attachment[];
  } catch {
    return undefined;
  }
}

function parseTags(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed as string[];
  } catch {
    return undefined;
  }
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row["id"] as string,
    source: "feishu",
    feishuMessageId: row["feishu_message_id"] as string,
    feishuChatId: row["feishu_chat_id"] as string,
    feishuUserId: row["feishu_user_id"] as string,
    commandText: row["command_text"] as string,
    status: row["status"] as TaskStatus,
    priority: (row["priority"] as TaskPriority) ?? "normal",
    tags: parseTags(row["tags"]),
    attachments: parseAttachments(row["attachments"]),
    assignedDeviceId: (row["assigned_device_id"] as string) ?? undefined,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
    resultSummary: (row["result_summary"] as string) ?? undefined,
    resultDetails: (row["result_details"] as string) ?? undefined,
  };
}

export function createTaskStore(storagePath: string): TaskStore {
  // Ensure the directory exists
  mkdirSync(dirname(storagePath), { recursive: true });

  const db = new DatabaseSync(storagePath);

  // Enable WAL mode for better concurrent read performance
  db.exec(`PRAGMA journal_mode=WAL;`);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      feishu_message_id TEXT NOT NULL,
      feishu_chat_id TEXT NOT NULL,
      feishu_user_id TEXT NOT NULL,
      command_text TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      tags TEXT,
      result_summary TEXT,
      result_details TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Add priority column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'`);
  } catch {
    // Column already exists, ignore
  }

  // Add attachments column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN attachments TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add assigned_device_id column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN assigned_device_id TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add tags column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN tags TEXT`);
  } catch {
    // Column already exists, ignore
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_feishu_message_id
      ON tasks(feishu_message_id)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL
    )
  `);

  // Prepare statements
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, source, feishu_message_id, feishu_chat_id, feishu_user_id, command_text, status, priority, tags, attachments, assigned_device_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const selectTaskById = db.prepare(`SELECT * FROM tasks WHERE id = ?`);

  const selectTaskByMessageId = db.prepare(
    `SELECT * FROM tasks WHERE feishu_message_id = ?`,
  );

  const selectTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status = COALESCE(?, status)
    AND (assigned_device_id IS NULL OR assigned_device_id = COALESCE(?, assigned_device_id))
    ORDER BY
      CASE priority
        WHEN 'urgent' THEN 0
        WHEN 'high' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'low' THEN 3
      END,
      created_at DESC
    LIMIT ?
  `);

  const updateTaskStatusStmt = db.prepare(`
    UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?
  `);

  const updateTaskResult = db.prepare(`
    UPDATE tasks SET status = ?, result_summary = ?, result_details = ?, updated_at = ? WHERE id = ?
  `);

  const assignTaskStmt = db.prepare(`
    UPDATE tasks SET assigned_device_id = ?, updated_at = ? WHERE id = ?
  `);

  const unassignTaskStmt = db.prepare(`
    UPDATE tasks SET assigned_device_id = NULL, updated_at = ? WHERE id = ?
  `);

  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO processed_events (event_id, processed_at) VALUES (?, ?)
  `);

  const selectEvent = db.prepare(
    `SELECT 1 FROM processed_events WHERE event_id = ?`,
  );

  return {
    async createTask(task: Task): Promise<Task> {
      const now = new Date().toISOString();
      const status = task.status ?? "pending";
      const priority = task.priority ?? "normal";

      // Check for duplicate feishu_message_id
      const existing = selectTaskByMessageId.get(task.feishuMessageId) as
        | Record<string, unknown>
        | undefined;
      if (existing) {
        return rowToTask(existing);
      }

      const id = task.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tagsJson = task.tags && task.tags.length > 0
        ? JSON.stringify(task.tags)
        : null;
      const attachmentsJson = task.attachments && task.attachments.length > 0
        ? JSON.stringify(task.attachments)
        : null;

      insertTask.run(
        id,
        task.source,
        task.feishuMessageId,
        task.feishuChatId,
        task.feishuUserId,
        task.commandText,
        status,
        priority,
        tagsJson,
        attachmentsJson,
        task.assignedDeviceId ?? null,
        task.createdAt ?? now,
        task.updatedAt ?? now,
      );

      const row = selectTaskById.get(id) as Record<string, unknown>;
      return rowToTask(row);
    },

    async listTasks(status?: TaskStatus, limit?: number, deviceId?: string): Promise<Task[]> {
      const effectiveLimit = limit ?? 20;
      const rows = selectTasks.all(status ?? null, deviceId ?? null, effectiveLimit) as Array<
        Record<string, unknown>
      >;
      return rows.map(rowToTask);
    },

    async searchTasks(options: SearchOptions): Promise<Task[]> {
      const conditions: string[] = [];
      const params: (string | number | null)[] = [];

      if (options.status) {
        conditions.push("status = ?");
        params.push(options.status);
      }

      if (options.from) {
        conditions.push("created_at >= ?");
        params.push(options.from);
      }

      if (options.to) {
        conditions.push("created_at <= ?");
        params.push(options.to);
      }

      if (options.q) {
        conditions.push("(command_text LIKE ? OR result_summary LIKE ?)");
        const pattern = `%${options.q}%`;
        params.push(pattern, pattern);
      }

      if (options.deviceId) {
        conditions.push("assigned_device_id = ?");
        params.push(options.deviceId);
      }

      if (options.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          conditions.push("tags LIKE ?");
          params.push(`%"${tag}"%`);
        }
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const effectiveLimit = Math.min(options.limit ?? 20, 100);

      const sql = `
        SELECT * FROM tasks ${where}
        ORDER BY created_at DESC
        LIMIT ?
      `;

      const rows = db.prepare(sql).all(...params, effectiveLimit) as Array<
        Record<string, unknown>
      >;
      return rows.map(rowToTask);
    },

    async getTask(id: string): Promise<Task | undefined> {
      const row = selectTaskById.get(id) as
        | Record<string, unknown>
        | undefined;
      return row ? rowToTask(row) : undefined;
    },

    async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
      const row = selectTaskById.get(id) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${id}`);
      }

      const currentStatus = row["status"] as TaskStatus;
      if (!isValidTransition(currentStatus, status)) {
        throw new Error(
          `Invalid status transition: ${currentStatus} -> ${status}`,
        );
      }

      const now = new Date().toISOString();
      Number(updateTaskStatusStmt.run(status, now, id));

      const updated = selectTaskById.get(id) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async saveTaskResult(
      id: string,
      success: boolean,
      summary: string,
      details?: string,
    ): Promise<Task> {
      const row = selectTaskById.get(id) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${id}`);
      }

      const newStatus: TaskStatus = success ? "done" : "failed";
      const now = new Date().toISOString();

      Number(
        updateTaskResult.run(newStatus, summary, details ?? null, now, id),
      );

      const updated = selectTaskById.get(id) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async getTaskMessageId(id: string): Promise<string | undefined> {
      const row = selectTaskById.get(id) as
        | Record<string, unknown>
        | undefined;
      return row ? (row["feishu_message_id"] as string) : undefined;
    },

    async assignTask(taskId: string, deviceId: string): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      Number(assignTaskStmt.run(deviceId, now, taskId));

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async unassignTask(taskId: string): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      Number(unassignTaskStmt.run(now, taskId));

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async resetStaleTasks(timeoutMs: number = 30 * 60 * 1000): Promise<number> {
      // Reset tasks that have been in 'running' or 'picked' status for too long
      const cutoff = new Date(Date.now() - timeoutMs).toISOString();
      const result = db.prepare(`
        UPDATE tasks
        SET status = 'pending', updated_at = ?
        WHERE status IN ('running', 'picked')
        AND updated_at < ?
      `).run(new Date().toISOString(), cutoff);
      return Number(result.changes);
    },

    async cleanupProcessedEvents(retentionDays: number = 7): Promise<number> {
      // Delete processed events older than retentionDays
      const cutoff = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const result = db
        .prepare(`DELETE FROM processed_events WHERE processed_at < ?`)
        .run(cutoff);
      return Number(result.changes);
    },

    async isEventProcessed(eventId: string): Promise<boolean> {
      const row = selectEvent.get(eventId) as unknown;
      return row !== undefined;
    },

    async markEventProcessed(eventId: string): Promise<void> {
      const now = new Date().toISOString();
      insertEvent.run(eventId, now);
    },

    async healthCheck(): Promise<boolean> {
      try {
        db.prepare(`SELECT 1`).get();
        return true;
      } catch {
        return false;
      }
    },

    async countTasksByStatus(): Promise<TaskCounts> {
      const rows = db.prepare(`
        SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status
      `).all() as Array<Record<string, unknown>>;
      const counts: TaskCounts = { total: 0, pending: 0, picked: 0, running: 0, done: 0, failed: 0 };
      for (const row of rows) {
        const status = row["status"] as TaskStatus;
        const cnt = Number(row["cnt"]);
        counts[status] = cnt;
        counts.total += cnt;
      }
      return counts;
    },

    async addTags(taskId: string, tags: string[]): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const existingTags = parseTags(row["tags"]) ?? [];
      const mergedTags = [...new Set([...existingTags, ...tags])].sort();
      const tagsJson = JSON.stringify(mergedTags);
      const now = new Date().toISOString();

      db.prepare(`UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?`).run(
        tagsJson,
        now,
        taskId,
      );

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async removeTag(taskId: string, tag: string): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const existingTags = parseTags(row["tags"]) ?? [];
      const filteredTags = existingTags.filter((t) => t !== tag);
      const tagsJson =
        filteredTags.length > 0 ? JSON.stringify(filteredTags) : null;
      const now = new Date().toISOString();

      db.prepare(`UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?`).run(
        tagsJson,
        now,
        taskId,
      );

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async listAllTags(): Promise<string[]> {
      const rows = db.prepare(`
        SELECT tags FROM tasks WHERE tags IS NOT NULL AND tags != '[]'
      `).all() as Array<Record<string, unknown>>;
      const tagSet = new Set<string>();
      for (const row of rows) {
        const tags = parseTags(row["tags"]);
        if (tags) {
          for (const tag of tags) {
            tagSet.add(tag);
          }
        }
      }
      return [...tagSet].sort();
    },
  };
}
