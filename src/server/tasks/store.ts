import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Task, TaskStatus } from "../../shared/types.js";

export interface TaskStore {
  createTask(task: Task): Promise<Task>;
  listTasks(status?: TaskStatus, limit?: number): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<Task>;
  saveTaskResult(
    id: string,
    success: boolean,
    summary: string,
    details?: string,
  ): Promise<Task>;
  isEventProcessed(eventId: string): Promise<boolean>;
  markEventProcessed(eventId: string): Promise<void>;
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

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row["id"] as string,
    source: row["source"] as "feishu",
    feishuMessageId: row["feishu_message_id"] as string,
    feishuChatId: row["feishu_chat_id"] as string,
    feishuUserId: row["feishu_user_id"] as string,
    commandText: row["command_text"] as string,
    status: row["status"] as TaskStatus,
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
      result_summary TEXT,
      result_details TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

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
    INSERT INTO tasks (id, source, feishu_message_id, feishu_chat_id, feishu_user_id, command_text, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const selectTaskById = db.prepare(`SELECT * FROM tasks WHERE id = ?`);

  const selectTaskByMessageId = db.prepare(
    `SELECT * FROM tasks WHERE feishu_message_id = ?`,
  );

  const selectTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status = COALESCE(?, status)
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const updateTaskStatusStmt = db.prepare(`
    UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?
  `);

  const updateTaskResult = db.prepare(`
    UPDATE tasks SET status = ?, result_summary = ?, result_details = ?, updated_at = ? WHERE id = ?
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

      // Check for duplicate feishu_message_id
      const existing = selectTaskByMessageId.get(task.feishuMessageId) as
        | Record<string, unknown>
        | undefined;
      if (existing) {
        return rowToTask(existing);
      }

      const id = task.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      insertTask.run(
        id,
        task.source,
        task.feishuMessageId,
        task.feishuChatId,
        task.feishuUserId,
        task.commandText,
        status,
        task.createdAt ?? now,
        task.updatedAt ?? now,
      );

      const row = selectTaskById.get(id) as Record<string, unknown>;
      return rowToTask(row);
    },

    async listTasks(status?: TaskStatus, limit?: number): Promise<Task[]> {
      const effectiveLimit = limit ?? 20;
      const rows = selectTasks.all(status ?? null, effectiveLimit) as Array<
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

    async isEventProcessed(eventId: string): Promise<boolean> {
      const row = selectEvent.get(eventId) as unknown;
      return row !== undefined;
    },

    async markEventProcessed(eventId: string): Promise<void> {
      const now = new Date().toISOString();
      insertEvent.run(eventId, now);
    },
  };
}
