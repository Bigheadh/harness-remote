import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Task, TaskStatus, TaskPriority, Attachment } from "../../shared/types.js";
import type { TaskComment, AuditLogEntry, TaskTemplate, ScheduledTask } from "../../shared/types.js";

/** Full export payload for backup/restore across instances */
export interface TaskExportPayload {
  exportedAt: string;
  version: 1;
  tasks: Task[];
  comments: Array<{ taskId: string; author: string; authorType: AuditLogEntry["actorType"]; body: string; createdAt: string }>;
  dependencies: Array<{ taskId: string; dependsOnIds: string[] }>;
  templates: TaskTemplate[];
  scheduledTasks: ScheduledTask[];
}

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
  setTaskDueDate(taskId: string, dueDate: string | null): Promise<Task>;
  setTaskReminder(taskId: string, reminderAt: string | null): Promise<Task>;
  listOverdueTasks(): Promise<Task[]>;
  addComment(taskId: string, author: string, authorType: AuditLogEntry["actorType"], body: string): Promise<TaskComment>;
  listComments(taskId: string): Promise<TaskComment[]>;
  deleteComment(commentId: number, taskId: string): Promise<boolean>;
  bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }>;
  bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }>;
  bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }>;
  // Task template methods
  createTemplate(template: Omit<TaskTemplate, "id" | "createdAt" | "updatedAt">): Promise<TaskTemplate>;
  listTemplates(): Promise<TaskTemplate[]>;
  getTemplate(id: string): Promise<TaskTemplate | undefined>;
  updateTemplate(id: string, updates: Partial<Pick<TaskTemplate, "name" | "description" | "commandText" | "priority" | "tags" | "assignedDeviceId" | "dueDateOffsetMs" | "reminderOffsetMs">>): Promise<TaskTemplate>;
  deleteTemplate(id: string): Promise<boolean>;
  // Scheduled task methods
  createScheduledTask(data: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt">): Promise<ScheduledTask>;
  listScheduledTasks(): Promise<ScheduledTask[]>;
  getScheduledTask(id: string): Promise<ScheduledTask | undefined>;
  updateScheduledTask(id: string, updates: Partial<Pick<ScheduledTask, "commandText" | "frequency" | "priority" | "tags" | "assignedDeviceId" | "nextRunAt" | "enabled" | "templateId">>): Promise<ScheduledTask>;
  deleteScheduledTask(id: string): Promise<boolean>;
  getDueScheduledTasks(now: string): Promise<ScheduledTask[]>;
  markScheduledTaskRun(id: string, nextRunAt: string, taskId: string): Promise<void>;
  // Task dependency methods
  setDependencies(taskId: string, dependsOnIds: string[]): Promise<Task>;
  getDependencies(taskId: string): Promise<string[]>;
  getDependents(taskId: string): Promise<string[]>;
  isTaskBlocked(taskId: string): Promise<boolean>;
  listReadyTasks(limit?: number, deviceId?: string): Promise<Task[]>;
  // Export/Import methods
  exportAll(): Promise<TaskExportPayload>;
  importAll(data: TaskExportPayload, mode: "skip" | "overwrite"): Promise<{ imported: number; skipped: number; errors: string[] }>;
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
    dueDate: (row["due_date"] as string) ?? undefined,
    reminderAt: (row["reminder_at"] as string) ?? undefined,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
    resultSummary: (row["result_summary"] as string) ?? undefined,
    resultDetails: (row["result_details"] as string) ?? undefined,
  };
}

function rowToTemplate(row: Record<string, unknown>): TaskTemplate {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string) ?? undefined,
    commandText: row["command_text"] as string,
    priority: (row["priority"] as TaskPriority) ?? "normal",
    tags: parseTags(row["tags"]),
    assignedDeviceId: (row["assigned_device_id"] as string) ?? undefined,
    dueDateOffsetMs: row["due_date_offset_ms"] != null ? Number(row["due_date_offset_ms"]) : undefined,
    reminderOffsetMs: row["reminder_offset_ms"] != null ? Number(row["reminder_offset_ms"]) : undefined,
    createdBy: row["created_by"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function rowToScheduledTask(row: Record<string, unknown>): ScheduledTask {
  return {
    id: row["id"] as string,
    templateId: (row["template_id"] as string) ?? undefined,
    commandText: row["command_text"] as string,
    frequency: row["frequency"] as ScheduledTask["frequency"],
    priority: (row["priority"] as TaskPriority) ?? "normal",
    tags: parseTags(row["tags"]),
    assignedDeviceId: (row["assigned_device_id"] as string) ?? undefined,
    nextRunAt: row["next_run_at"] as string,
    lastRunAt: (row["last_run_at"] as string) ?? undefined,
    lastTaskId: (row["last_task_id"] as string) ?? undefined,
    enabled: Number(row["enabled"]) === 1,
    createdBy: row["created_by"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
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

  // Add due_date column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN due_date TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add reminder_at column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN reminder_at TEXT`);
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
  // Task comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      author TEXT NOT NULL,
      author_type TEXT NOT NULL DEFAULT 'api',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
      ON task_comments(task_id)
  `);
  // Task templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      command_text TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      tags TEXT,
      assigned_device_id TEXT,
      due_date_offset_ms INTEGER,
      reminder_offset_ms INTEGER,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_templates_name
      ON task_templates(name)
  `);

  // Scheduled tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      command_text TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      priority TEXT DEFAULT 'normal',
      tags TEXT,
      assigned_device_id TEXT,
      next_run_at TEXT NOT NULL,
      last_run_at TEXT,
      last_task_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run
      ON scheduled_tasks(next_run_at, enabled)
  `);

  // Task dependencies table (many-to-many prerequisite relationships)
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL,
      depends_on_task_id TEXT NOT NULL,
      PRIMARY KEY (task_id, depends_on_task_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on
      ON task_dependencies(depends_on_task_id)
  `);

  // Prepare statements
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, source, feishu_message_id, feishu_chat_id, feishu_user_id, command_text, status, priority, tags, attachments, assigned_device_id, due_date, reminder_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        task.dueDate ?? null,
        task.reminderAt ?? null,
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

    async setTaskDueDate(taskId: string, dueDate: string | null): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Validate date format if provided
      if (dueDate && isNaN(Date.parse(dueDate))) {
        throw new Error(`Invalid date format: ${dueDate}. Use ISO 8601.`);
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?`).run(
        dueDate,
        now,
        taskId,
      );

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async setTaskReminder(taskId: string, reminderAt: string | null): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Validate date format if provided
      if (reminderAt && isNaN(Date.parse(reminderAt))) {
        throw new Error(`Invalid date format: ${reminderAt}. Use ISO 8601.`);
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE tasks SET reminder_at = ?, updated_at = ? WHERE id = ?`).run(
        reminderAt,
        now,
        taskId,
      );

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async listOverdueTasks(): Promise<Task[]> {
      const now = new Date().toISOString();
      const rows = db.prepare(`
        SELECT * FROM tasks
        WHERE due_date IS NOT NULL
        AND due_date < ?
        AND status IN ('pending', 'picked', 'running')
        ORDER BY due_date ASC
      `).all(now) as Array<Record<string, unknown>>;
      return rows.map(rowToTask);
    },

    async addComment(taskId: string, author: string, authorType: AuditLogEntry["actorType"], body: string): Promise<TaskComment> {
      // Verify task exists
      const taskRow = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!taskRow) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO task_comments (task_id, author, author_type, body, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, author, authorType, body, now);

      const commentId = Number(result.lastInsertRowid);
      return {
        id: commentId,
        taskId,
        author,
        authorType,
        body,
        createdAt: now,
      };
    },

    async listComments(taskId: string): Promise<TaskComment[]> {
      const rows = db.prepare(`
        SELECT * FROM task_comments
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all(taskId) as Array<Record<string, unknown>>;

      return rows.map((row) => ({
        id: row["id"] as number,
        taskId: row["task_id"] as string,
        author: row["author"] as string,
        authorType: row["author_type"] as AuditLogEntry["actorType"],
        body: row["body"] as string,
        createdAt: row["created_at"] as string,
      }));
    },

    async deleteComment(commentId: number, taskId: string): Promise<boolean> {
      const result = db.prepare(`
        DELETE FROM task_comments WHERE id = ? AND task_id = ?
      `).run(commentId, taskId);
      return Number(result.changes) > 0;
    },

    async bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }> {
      const errors: string[] = [];
      let updated = 0;
      const now = new Date().toISOString();

      for (const id of ids) {
        try {
          const row = selectTaskById.get(id) as Record<string, unknown> | undefined;
          if (!row) {
            errors.push(`Task not found: ${id}`);
            continue;
          }
          const currentStatus = row["status"] as TaskStatus;
          if (!isValidTransition(currentStatus, status)) {
            errors.push(`Invalid transition for ${id}: ${currentStatus} -> ${status}`);
            continue;
          }
          Number(updateTaskStatusStmt.run(status, now, id));
          updated++;
        } catch (e) {
          errors.push(`Error updating ${id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { updated, errors };
    },

    async bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }> {
      const errors: string[] = [];
      let updated = 0;
      const now = new Date().toISOString();

      for (const id of ids) {
        try {
          const row = selectTaskById.get(id) as Record<string, unknown> | undefined;
          if (!row) {
            errors.push(`Task not found: ${id}`);
            continue;
          }
          Number(assignTaskStmt.run(deviceId, now, id));
          updated++;
        } catch (e) {
          errors.push(`Error assigning ${id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { updated, errors };
    },

    async bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
      const errors: string[] = [];
      let deleted = 0;

      if (ids.length === 0) {
        return { deleted: 0, errors: [] };
      }

      // Process in batches of 50 to avoid SQL variable limit
      const batchSize = 50;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const placeholders = batch.map(() => "?").join(",");
        try {
          // First delete associated comments
          db.prepare(`DELETE FROM task_comments WHERE task_id IN (${placeholders})`).run(...batch);
          // Then delete the tasks
          const result = db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...batch);
          deleted += Number(result.changes);
        } catch (e) {
          errors.push(`Error deleting batch: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return { deleted, errors };
    },

    // ── Task Templates ──────────────────────────────────────────────

    async createTemplate(
      template: Omit<TaskTemplate, "id" | "createdAt" | "updatedAt">,
    ): Promise<TaskTemplate> {
      const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const tagsJson =
        template.tags && template.tags.length > 0
          ? JSON.stringify(template.tags)
          : null;

      db.prepare(`
        INSERT INTO task_templates (id, name, description, command_text, priority, tags, assigned_device_id, due_date_offset_ms, reminder_offset_ms, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        template.name,
        template.description ?? null,
        template.commandText,
        template.priority ?? "normal",
        tagsJson,
        template.assignedDeviceId ?? null,
        template.dueDateOffsetMs ?? null,
        template.reminderOffsetMs ?? null,
        template.createdBy,
        now,
        now,
      );

      const row = db.prepare(`SELECT * FROM task_templates WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToTemplate(row);
    },

    async listTemplates(): Promise<TaskTemplate[]> {
      const rows = db.prepare(`SELECT * FROM task_templates ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
      return rows.map(rowToTemplate);
    },

    async getTemplate(id: string): Promise<TaskTemplate | undefined> {
      const row = db.prepare(`SELECT * FROM task_templates WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      return row ? rowToTemplate(row) : undefined;
    },

    async updateTemplate(
      id: string,
      updates: Partial<Pick<TaskTemplate, "name" | "description" | "commandText" | "priority" | "tags" | "assignedDeviceId" | "dueDateOffsetMs" | "reminderOffsetMs">>,
    ): Promise<TaskTemplate> {
      const existing = db.prepare(`SELECT * FROM task_templates WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        throw new Error(`Template not found: ${id}`);
      }

      const now = new Date().toISOString();
      const setClauses: string[] = [];
      const params: (string | number | null)[] = [];

      if (updates.name !== undefined) { setClauses.push("name = ?"); params.push(updates.name); }
      if (updates.description !== undefined) { setClauses.push("description = ?"); params.push(updates.description ?? null); }
      if (updates.commandText !== undefined) { setClauses.push("command_text = ?"); params.push(updates.commandText); }
      if (updates.priority !== undefined) { setClauses.push("priority = ?"); params.push(updates.priority); }
      if (updates.tags !== undefined) {
        setClauses.push("tags = ?");
        params.push(updates.tags && updates.tags.length > 0 ? JSON.stringify(updates.tags) : null);
      }
      if (updates.assignedDeviceId !== undefined) { setClauses.push("assigned_device_id = ?"); params.push(updates.assignedDeviceId ?? null); }
      if (updates.dueDateOffsetMs !== undefined) { setClauses.push("due_date_offset_ms = ?"); params.push(updates.dueDateOffsetMs ?? null); }
      if (updates.reminderOffsetMs !== undefined) { setClauses.push("reminder_offset_ms = ?"); params.push(updates.reminderOffsetMs ?? null); }

      if (setClauses.length === 0) {
        return rowToTemplate(existing);
      }

      setClauses.push("updated_at = ?");
      params.push(now);
      params.push(id);

      db.prepare(`UPDATE task_templates SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

      const row = db.prepare(`SELECT * FROM task_templates WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToTemplate(row);
    },

    async deleteTemplate(id: string): Promise<boolean> {
      const result = db.prepare(`DELETE FROM task_templates WHERE id = ?`).run(id);
      return Number(result.changes) > 0;
    },

    // ── Scheduled Tasks ─────────────────────────────────────────────

    async createScheduledTask(
      data: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt">,
    ): Promise<ScheduledTask> {
      const id = `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const tagsJson =
        data.tags && data.tags.length > 0
          ? JSON.stringify(data.tags)
          : null;

      db.prepare(`
        INSERT INTO scheduled_tasks (id, template_id, command_text, frequency, priority, tags, assigned_device_id, next_run_at, last_run_at, last_task_id, enabled, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.templateId ?? null,
        data.commandText,
        data.frequency,
        data.priority ?? "normal",
        tagsJson,
        data.assignedDeviceId ?? null,
        data.nextRunAt,
        data.lastRunAt ?? null,
        data.lastTaskId ?? null,
        data.enabled ? 1 : 0,
        data.createdBy,
        now,
        now,
      );

      const row = db.prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToScheduledTask(row);
    },

    async listScheduledTasks(): Promise<ScheduledTask[]> {
      const rows = db.prepare(
        `SELECT * FROM scheduled_tasks ORDER BY next_run_at ASC`,
      ).all() as Array<Record<string, unknown>>;
      return rows.map(rowToScheduledTask);
    },

    async getScheduledTask(id: string): Promise<ScheduledTask | undefined> {
      const row = db.prepare(
        `SELECT * FROM scheduled_tasks WHERE id = ?`,
      ).get(id) as Record<string, unknown> | undefined;
      return row ? rowToScheduledTask(row) : undefined;
    },

    async updateScheduledTask(
      id: string,
      updates: Partial<Pick<ScheduledTask, "commandText" | "frequency" | "priority" | "tags" | "assignedDeviceId" | "nextRunAt" | "enabled" | "templateId">>,
    ): Promise<ScheduledTask> {
      const existing = db.prepare(
        `SELECT * FROM scheduled_tasks WHERE id = ?`,
      ).get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        throw new Error(`Scheduled task not found: ${id}`);
      }

      const now = new Date().toISOString();
      const setClauses: string[] = [];
      const params: (string | number | null)[] = [];

      if (updates.commandText !== undefined) { setClauses.push("command_text = ?"); params.push(updates.commandText); }
      if (updates.frequency !== undefined) { setClauses.push("frequency = ?"); params.push(updates.frequency); }
      if (updates.priority !== undefined) { setClauses.push("priority = ?"); params.push(updates.priority); }
      if (updates.tags !== undefined) {
        setClauses.push("tags = ?");
        params.push(updates.tags && updates.tags.length > 0 ? JSON.stringify(updates.tags) : null);
      }
      if (updates.assignedDeviceId !== undefined) { setClauses.push("assigned_device_id = ?"); params.push(updates.assignedDeviceId ?? null); }
      if (updates.nextRunAt !== undefined) { setClauses.push("next_run_at = ?"); params.push(updates.nextRunAt); }
      if (updates.enabled !== undefined) { setClauses.push("enabled = ?"); params.push(updates.enabled ? 1 : 0); }
      if (updates.templateId !== undefined) { setClauses.push("template_id = ?"); params.push(updates.templateId ?? null); }

      if (setClauses.length === 0) {
        return rowToScheduledTask(existing);
      }

      setClauses.push("updated_at = ?");
      params.push(now);
      params.push(id);

      db.prepare(`UPDATE scheduled_tasks SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

      const row = db.prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToScheduledTask(row);
    },

    async deleteScheduledTask(id: string): Promise<boolean> {
      const result = db.prepare(`DELETE FROM scheduled_tasks WHERE id = ?`).run(id);
      return Number(result.changes) > 0;
    },

    async getDueScheduledTasks(now: string): Promise<ScheduledTask[]> {
      const rows = db.prepare(`
        SELECT * FROM scheduled_tasks
        WHERE enabled = 1 AND next_run_at <= ?
        ORDER BY next_run_at ASC
      `).all(now) as Array<Record<string, unknown>>;
      return rows.map(rowToScheduledTask);
    },

    async markScheduledTaskRun(id: string, nextRunAt: string, taskId: string): Promise<void> {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE scheduled_tasks
        SET last_run_at = ?, last_task_id = ?, next_run_at = ?, updated_at = ?
        WHERE id = ?
      `).run(now, taskId, nextRunAt, now, id);
    },

    // ── Task Dependencies ─────────────────────────────────────────

    async setDependencies(taskId: string, dependsOnIds: string[]): Promise<Task> {
      // Verify task exists
      const taskRow = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!taskRow) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Verify all dependency tasks exist
      for (const depId of dependsOnIds) {
        if (depId === taskId) {
          throw new Error(`Task cannot depend on itself: ${taskId}`);
        }
        const depRow = selectTaskById.get(depId) as Record<string, unknown> | undefined;
        if (!depRow) {
          throw new Error(`Dependency task not found: ${depId}`);
        }
      }

      // Check for circular dependencies
      if (dependsOnIds.length > 0) {
        const visited = new Set<string>();
        const stack = [...dependsOnIds];
        while (stack.length > 0) {
          const current = stack.pop()!;
          if (current === taskId) {
            throw new Error(`Circular dependency detected: task ${taskId} would create a cycle`);
          }
          if (visited.has(current)) continue;
          visited.add(current);
          // Get this task's dependencies and add to stack
          const deps = db.prepare(
            `SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?`
          ).all(current) as Array<Record<string, unknown>>;
          for (const dep of deps) {
            stack.push(dep["depends_on_task_id"] as string);
          }
        }
      }

      const now = new Date().toISOString();

      // Replace all existing dependencies
      db.prepare(`DELETE FROM task_dependencies WHERE task_id = ?`).run(taskId);

      for (const depId of dependsOnIds) {
        db.prepare(
          `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`
        ).run(taskId, depId);
      }

      db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, taskId);

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async getDependencies(taskId: string): Promise<string[]> {
      const rows = db.prepare(
        `SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?`
      ).all(taskId) as Array<Record<string, unknown>>;
      return rows.map((r) => r["depends_on_task_id"] as string);
    },

    async getDependents(taskId: string): Promise<string[]> {
      const rows = db.prepare(
        `SELECT task_id FROM task_dependencies WHERE depends_on_task_id = ?`
      ).all(taskId) as Array<Record<string, unknown>>;
      return rows.map((r) => r["task_id"] as string);
    },

    async isTaskBlocked(taskId: string): Promise<boolean> {
      const deps = db.prepare(
        `SELECT d.depends_on_task_id, t.status
         FROM task_dependencies d
         JOIN tasks t ON t.id = d.depends_on_task_id
         WHERE d.task_id = ?`
      ).all(taskId) as Array<Record<string, unknown>>;
      // Blocked if any dependency is not done/failed
      return deps.some((d) => d["status"] !== "done" && d["status"] !== "failed");
    },

    async listReadyTasks(limit?: number, deviceId?: string): Promise<Task[]> {
      const effectiveLimit = limit ?? 20;
      const rows = db.prepare(`
        SELECT t.* FROM tasks t
        WHERE t.status = 'pending'
        AND (t.assigned_device_id IS NULL OR t.assigned_device_id = COALESCE(?, t.assigned_device_id))
        AND NOT EXISTS (
          SELECT 1 FROM task_dependencies d
          JOIN tasks dep ON dep.id = d.depends_on_task_id
          WHERE d.task_id = t.id
          AND dep.status NOT IN ('done', 'failed')
        )
        ORDER BY
          CASE t.priority
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 3
          END,
          t.created_at DESC
        LIMIT ?
      `).all(deviceId ?? null, effectiveLimit) as Array<Record<string, unknown>>;

      // Enrich with dependency info
      return rows.map((row) => {
        const task = rowToTask(row);
        const deps = db.prepare(
          `SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?`
        ).all(task.id) as Array<Record<string, unknown>>;
        if (deps.length > 0) {
          task.dependsOn = deps.map((d) => d["depends_on_task_id"] as string);
        }
        return task;
      });
    },

    // ── Export/Import ────────────────────────────────────────────

    async exportAll(): Promise<TaskExportPayload> {
      // Export all tasks
      const taskRows = db.prepare(`SELECT * FROM tasks ORDER BY created_at ASC`).all() as Array<Record<string, unknown>>;
      const tasks = taskRows.map(rowToTask);

      // Export all comments
      const commentRows = db.prepare(`SELECT * FROM task_comments ORDER BY created_at ASC`).all() as Array<Record<string, unknown>>;
      const comments = commentRows.map((row) => ({
        taskId: row["task_id"] as string,
        author: row["author"] as string,
        authorType: row["author_type"] as AuditLogEntry["actorType"],
        body: row["body"] as string,
        createdAt: row["created_at"] as string,
      }));

      // Export all dependencies
      const depRows = db.prepare(`SELECT task_id, depends_on_task_id FROM task_dependencies ORDER BY task_id`).all() as Array<Record<string, unknown>>;
      const depMap = new Map<string, string[]>();
      for (const row of depRows) {
        const taskId = row["task_id"] as string;
        const depId = row["depends_on_task_id"] as string;
        const existing = depMap.get(taskId) ?? [];
        existing.push(depId);
        depMap.set(taskId, existing);
      }
      const dependencies = [...depMap.entries()].map(([taskId, dependsOnIds]) => ({ taskId, dependsOnIds }));

      // Export all templates
      const templateRows = db.prepare(`SELECT * FROM task_templates ORDER BY created_at ASC`).all() as Array<Record<string, unknown>>;
      const templates = templateRows.map(rowToTemplate);

      // Export all scheduled tasks
      const scheduledRows = db.prepare(`SELECT * FROM scheduled_tasks ORDER BY created_at ASC`).all() as Array<Record<string, unknown>>;
      const scheduledTasks = scheduledRows.map(rowToScheduledTask);

      return {
        exportedAt: new Date().toISOString(),
        version: 1,
        tasks,
        comments,
        dependencies,
        templates,
        scheduledTasks,
      };
    },

    async importAll(data: TaskExportPayload, mode: "skip" | "overwrite"): Promise<{ imported: number; skipped: number; errors: string[] }> {
      const errors: string[] = [];
      let imported = 0;
      let skipped = 0;

      if (!data || !Array.isArray(data.tasks)) {
        throw new Error("Invalid export data: missing tasks array");
      }

      // Import tasks
      for (const task of data.tasks) {
        try {
          const existing = selectTaskById.get(task.id) as Record<string, unknown> | undefined;
          if (existing) {
            if (mode === "skip") {
              skipped++;
              continue;
            }
            // overwrite mode: delete existing task and its children first
            db.prepare(`DELETE FROM task_comments WHERE task_id = ?`).run(task.id);
            db.prepare(`DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?`).run(task.id, task.id);
            db.prepare(`DELETE FROM tasks WHERE id = ?`).run(task.id);
          }

          const tagsJson = task.tags && task.tags.length > 0 ? JSON.stringify(task.tags) : null;
          const attachmentsJson = task.attachments && task.attachments.length > 0 ? JSON.stringify(task.attachments) : null;

          insertTask.run(
            task.id,
            task.source,
            task.feishuMessageId,
            task.feishuChatId,
            task.feishuUserId,
            task.commandText,
            task.status,
            task.priority,
            tagsJson,
            attachmentsJson,
            task.assignedDeviceId ?? null,
            task.dueDate ?? null,
            task.reminderAt ?? null,
            task.createdAt,
            task.updatedAt,
          );

          // Restore result fields if present
          if (task.resultSummary || task.resultDetails) {
            db.prepare(`UPDATE tasks SET result_summary = ?, result_details = ? WHERE id = ?`).run(
              task.resultSummary ?? null,
              task.resultDetails ?? null,
              task.id,
            );
          }

          imported++;
        } catch (e) {
          errors.push(`Task ${task.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Import dependencies (after tasks are imported)
      if (data.dependencies && data.dependencies.length > 0) {
        for (const dep of data.dependencies) {
          try {
            // Verify both tasks exist
            const taskExists = selectTaskById.get(dep.taskId) as Record<string, unknown> | undefined;
            if (!taskExists) {
              errors.push(`Dependency skip: task ${dep.taskId} not found`);
              continue;
            }
            // Clear existing deps for this task
            db.prepare(`DELETE FROM task_dependencies WHERE task_id = ?`).run(dep.taskId);
            for (const depId of dep.dependsOnIds) {
              const depExists = selectTaskById.get(depId) as Record<string, unknown> | undefined;
              if (!depExists) {
                errors.push(`Dependency skip: prerequisite ${depId} not found for task ${dep.taskId}`);
                continue;
              }
              db.prepare(`INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`).run(dep.taskId, depId);
            }
          } catch (e) {
            errors.push(`Dependency for ${dep.taskId}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // Import comments (after tasks are imported)
      if (data.comments && data.comments.length > 0) {
        for (const comment of data.comments) {
          try {
            const taskExists = selectTaskById.get(comment.taskId) as Record<string, unknown> | undefined;
            if (!taskExists) {
              errors.push(`Comment skip: task ${comment.taskId} not found`);
              continue;
            }
            db.prepare(`INSERT INTO task_comments (task_id, author, author_type, body, created_at) VALUES (?, ?, ?, ?, ?)`).run(
              comment.taskId,
              comment.author,
              comment.authorType,
              comment.body,
              comment.createdAt,
            );
          } catch (e) {
            errors.push(`Comment on ${comment.taskId}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // Import templates
      if (data.templates && data.templates.length > 0) {
        for (const template of data.templates) {
          try {
            const existing = db.prepare(`SELECT 1 FROM task_templates WHERE id = ?`).get(template.id) as unknown;
            if (existing) {
              if (mode === "skip") continue;
              db.prepare(`DELETE FROM task_templates WHERE id = ?`).run(template.id);
            }
            const tagsJson = template.tags && template.tags.length > 0 ? JSON.stringify(template.tags) : null;
            db.prepare(`INSERT INTO task_templates (id, name, description, command_text, priority, tags, assigned_device_id, due_date_offset_ms, reminder_offset_ms, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
              template.id, template.name, template.description ?? null, template.commandText,
              template.priority ?? "normal", tagsJson, template.assignedDeviceId ?? null,
              template.dueDateOffsetMs ?? null, template.reminderOffsetMs ?? null,
              template.createdBy, template.createdAt, template.updatedAt,
            );
          } catch (e) {
            errors.push(`Template ${template.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // Import scheduled tasks
      if (data.scheduledTasks && data.scheduledTasks.length > 0) {
        for (const sch of data.scheduledTasks) {
          try {
            const existing = db.prepare(`SELECT 1 FROM scheduled_tasks WHERE id = ?`).get(sch.id) as unknown;
            if (existing) {
              if (mode === "skip") continue;
              db.prepare(`DELETE FROM scheduled_tasks WHERE id = ?`).run(sch.id);
            }
            const tagsJson = sch.tags && sch.tags.length > 0 ? JSON.stringify(sch.tags) : null;
            db.prepare(`INSERT INTO scheduled_tasks (id, template_id, command_text, frequency, priority, tags, assigned_device_id, next_run_at, last_run_at, last_task_id, enabled, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
              sch.id, sch.templateId ?? null, sch.commandText, sch.frequency,
              sch.priority ?? "normal", tagsJson, sch.assignedDeviceId ?? null,
              sch.nextRunAt, sch.lastRunAt ?? null, sch.lastTaskId ?? null,
              sch.enabled ? 1 : 0, sch.createdBy, sch.createdAt, sch.updatedAt,
            );
          } catch (e) {
            errors.push(`Scheduled task ${sch.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      return { imported, skipped, errors };
    },
  };
}
