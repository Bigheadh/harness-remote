import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Task, TaskStatus, TaskPriority, Attachment } from "../../shared/types.js";
import type { TaskComment, TaskNote, AuditLogEntry, TaskTemplate, ScheduledTask } from "../../shared/types.js";
import type { SlaPolicy, SlaBreachLog, SlaBreachType, SlaStatus, SlaSummary } from "../../shared/types.js";

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
  priority?: TaskPriority;
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
  listTasks(status?: TaskStatus, limit?: number, deviceId?: string, from?: string, to?: string, priority?: TaskPriority): Promise<Task[]>;
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
  setTaskDescription(taskId: string, description: string | null): Promise<Task>;
  listOverdueTasks(): Promise<Task[]>;
  addComment(taskId: string, author: string, authorType: AuditLogEntry["actorType"], body: string): Promise<TaskComment>;
  listComments(taskId: string): Promise<TaskComment[]>;
  deleteComment(commentId: number, taskId: string): Promise<boolean>;
  bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }>;
  bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }>;
  bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }>;
  bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }>;
  bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }>;
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
  // SLA methods
  createSlaPolicy(policy: Omit<SlaPolicy, "id" | "createdAt" | "updatedAt">): Promise<SlaPolicy>;
  listSlaPolicies(): Promise<SlaPolicy[]>;
  getSlaPolicy(id: string): Promise<SlaPolicy | undefined>;
  updateSlaPolicy(id: string, updates: Partial<Pick<SlaPolicy, "name" | "description" | "targetMinutes" | "warningThresholdPercent" | "matchPriorities" | "matchTags" | "enabled">>): Promise<SlaPolicy>;
  deleteSlaPolicy(id: string): Promise<boolean>;
  getSlaStatusForTask(taskId: string): Promise<{ status: SlaStatus; policy?: SlaPolicy; elapsedMinutes: number; targetMinutes?: number }>;
  listSlaBreaches(): Promise<SlaBreachLog[]>;
  getSlaSummary(): Promise<SlaSummary>;
  checkAndRecordSlaBreaches(): Promise<{ warnings: number; breaches: number }>;

  // Analytics methods
  getTaskStats(): Promise<import("../../shared/types.js").TaskStats>;
  getTaskTimeSeries(
    from: string,
    to: string,
    interval: import("../../shared/types.js").TimeSeriesInterval,
    metric: import("../../shared/types.js").TimeSeriesMetric,
  ): Promise<import("../../shared/types.js").TimeSeriesResult>;
  // Return all tasks without limit (for CSV export, archive, etc.)
  getAllTasks(): Promise<Task[]>;
  // Task retry/requeue methods
  retryTask(taskId: string): Promise<Task>;
  // Task cloning methods
  cloneTask(taskId: string): Promise<Task>;
  // Task pinning methods
  pinTask(taskId: string): Promise<Task>;
  unpinTask(taskId: string): Promise<Task>;
  // Task forwarding methods
  forwardTask(taskId: string, targetDeviceId: string, message?: string): Promise<Task>;
  // Task notes methods (internal annotations, not shared to requester)
  addNote(taskId: string, author: string, body: string): Promise<TaskNote>;
  listNotes(taskId: string): Promise<TaskNote[]>;
  deleteNote(noteId: number, taskId: string): Promise<boolean>;
  // Task user search — find tasks by Feishu user ID
  listTasksByUser(userId: string, limit?: number): Promise<Task[]>;
  // Task dependency graph — full recursive tree traversal
  getDependencyGraph(taskId: string): Promise<import("../../shared/types.js").DependencyGraph>;
  // Task lock methods (TTL-based locks to prevent concurrent processing)
  lockTask(taskId: string, deviceId: string, ttlMs?: number): Promise<import("../../shared/types.js").TaskLock>;
  unlockTask(taskId: string, deviceId: string): Promise<boolean>;
  getTaskLock(taskId: string): Promise<import("../../shared/types.js").TaskLock | undefined>;
  cleanupExpiredLocks(): Promise<number>;
  // Task subtask methods (break tasks into independently trackable child tasks)
  createSubtask(parentTaskId: string, title: string, commandText: string): Promise<import("../../shared/types.js").Subtask>;
  listSubtasks(parentTaskId: string): Promise<import("../../shared/types.js").Subtask[]>;
  getSubtask(parentTaskId: string, subtaskId: string): Promise<import("../../shared/types.js").Subtask | undefined>;
  updateSubtaskStatus(parentTaskId: string, subtaskId: string, status: TaskStatus): Promise<import("../../shared/types.js").Subtask>;
  saveSubtaskResult(parentTaskId: string, subtaskId: string, success: boolean, summary: string, details?: string): Promise<import("../../shared/types.js").Subtask>;
  deleteSubtask(parentTaskId: string, subtaskId: string): Promise<boolean>;
  // Task activity feed — combined chronological timeline of all task events
  getActivityFeed(taskId: string, limit?: number): Promise<import("../../shared/types.js").ActivityFeedItem[]>;
  // Task archive (soft-delete)
  archiveTask(taskId: string): Promise<import("../../shared/types.js").Task>;
  unarchiveTask(taskId: string): Promise<import("../../shared/types.js").Task>;
  listArchivedTasks(limit?: number): Promise<import("../../shared/types.js").Task[]>;
  // Task priority auto-escalation
  escalateOverduePriorities(): Promise<{ escalated: number; tasks: Task[] }>;
  // Kanban board view
  getKanbanBoard(limit?: number, deviceId?: string): Promise<import("../../shared/types.js").KanbanBoard>;
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
    pinned: Number(row["pinned"]) === 1,
    archivedAt: (row["archived_at"] as string) ?? undefined,
    resultSummary: (row["result_summary"] as string) ?? undefined,
    resultDetails: (row["result_details"] as string) ?? undefined,
    description: (row["description"] as string) ?? undefined,
    pickedAt: (row["picked_at"] as string) ?? undefined,
    startedAt: (row["started_at"] as string) ?? undefined,
    completedAt: (row["completed_at"] as string) ?? undefined,
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

function parsePriorities(raw: unknown): TaskPriority[] | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed as TaskPriority[];
  } catch {
    return undefined;
  }
}

function rowToSlaPolicy(row: Record<string, unknown>): SlaPolicy {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string) ?? undefined,
    targetMinutes: row["target_minutes"] as number,
    warningThresholdPercent: row["warning_threshold_percent"] as number,
    matchPriorities: parsePriorities(row["match_priorities"]),
    matchTags: parseTags(row["match_tags"]),
    enabled: Number(row["enabled"]) === 1,
    createdBy: row["created_by"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function rowToSlaBreachLog(row: Record<string, unknown>): SlaBreachLog {
  return {
    id: row["id"] as number,
    taskId: row["task_id"] as string,
    policyId: row["policy_id"] as string,
    policyName: row["policy_name"] as string,
    breachType: row["breach_type"] as SlaBreachType,
    targetMinutes: row["target_minutes"] as number,
    actualMinutes: row["actual_minutes"] as number,
    detectedAt: row["detected_at"] as string,
    resolvedAt: (row["resolved_at"] as string) ?? undefined,
  };
}

function rowToSubtask(row: Record<string, unknown>): import("../../shared/types.js").Subtask {
  return {
    id: row["id"] as string,
    parentTaskId: row["parent_task_id"] as string,
    title: row["title"] as string,
    commandText: row["command_text"] as string,
    status: row["status"] as TaskStatus,
    resultSummary: (row["result_summary"] as string) ?? undefined,
    resultDetails: (row["result_details"] as string) ?? undefined,
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

  // Add pinned column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists, ignore
  }

  // Add archived_at column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN archived_at TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add picked_at column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN picked_at TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add started_at column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN started_at TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add completed_at column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN completed_at TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add description column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN description TEXT`);
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

  db.exec(`\n    CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on\n      ON task_dependencies(depends_on_task_id)\n  `);

  // SLA policies table
  db.exec(`\n    CREATE TABLE IF NOT EXISTS sla_policies (\n      id TEXT PRIMARY KEY,\n      name TEXT NOT NULL,\n      description TEXT,\n      target_minutes INTEGER NOT NULL,\n      warning_threshold_percent INTEGER NOT NULL DEFAULT 80,\n      match_priorities TEXT,\n      match_tags TEXT,\n      enabled INTEGER NOT NULL DEFAULT 1,\n      created_by TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL\n    )\n  `);

  // SLA breach log table
  db.exec(`\n    CREATE TABLE IF NOT EXISTS sla_breach_log (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      task_id TEXT NOT NULL,\n      policy_id TEXT NOT NULL,\n      policy_name TEXT NOT NULL,\n      breach_type TEXT NOT NULL,\n      target_minutes INTEGER NOT NULL,\n      actual_minutes REAL NOT NULL,\n      detected_at TEXT NOT NULL,\n      resolved_at TEXT,\n      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,\n      FOREIGN KEY (policy_id) REFERENCES sla_policies(id) ON DELETE CASCADE\n    )\n  `);

  db.exec(`\n    CREATE INDEX IF NOT EXISTS idx_sla_breach_log_task_id\n      ON sla_breach_log(task_id)\n  `);

  db.exec(`\n    CREATE INDEX IF NOT EXISTS idx_sla_breach_log_policy_id\n      ON sla_breach_log(policy_id)\n  `);

  // Task notes table (internal annotations, not shared to requester)
  db.exec(`\n    CREATE TABLE IF NOT EXISTS task_notes (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      task_id TEXT NOT NULL,\n      author TEXT NOT NULL,\n      body TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE\n    )\n  `);

  db.exec(`\n    CREATE INDEX IF NOT EXISTS idx_task_notes_task_id\n      ON task_notes(task_id)\n  `);

  // Task locks table (TTL-based locks to prevent concurrent processing)
  db.exec(`\n    CREATE TABLE IF NOT EXISTS task_locks (\n      task_id TEXT PRIMARY KEY,\n      locked_by TEXT NOT NULL,\n      locked_at TEXT NOT NULL,\n      expires_at TEXT NOT NULL,\n      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE\n    )\n  `);

  // Task subtasks table (break tasks into independently trackable child tasks)
  db.exec(`\n    CREATE TABLE IF NOT EXISTS task_subtasks (\n      id TEXT PRIMARY KEY,\n      parent_task_id TEXT NOT NULL,\n      title TEXT NOT NULL,\n      command_text TEXT NOT NULL,\n      status TEXT NOT NULL DEFAULT 'pending',\n      result_summary TEXT,\n      result_details TEXT,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE\n    )\n  `);

  db.exec(`\n    CREATE INDEX IF NOT EXISTS idx_task_subtasks_parent\n      ON task_subtasks(parent_task_id)\n  `);
  // Prepare statements
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, source, feishu_message_id, feishu_chat_id, feishu_user_id, command_text, status, priority, tags, attachments, assigned_device_id, due_date, reminder_at, description, created_at, updated_at, picked_at, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const selectTaskById = db.prepare(`SELECT * FROM tasks WHERE id = ?`);

  const selectTaskByMessageId = db.prepare(
    `SELECT * FROM tasks WHERE feishu_message_id = ?`,
  );

  const selectTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status = COALESCE(?, status)
    AND (assigned_device_id IS NULL OR assigned_device_id = COALESCE(?, assigned_device_id))
    AND archived_at IS NULL
      ORDER BY
        pinned DESC,
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

  const retryTaskStmt = db.prepare(`
    UPDATE tasks
    SET status = 'pending', result_summary = NULL, result_details = NULL, picked_at = NULL, started_at = NULL, completed_at = NULL, updated_at = ?
    WHERE id = ?
  `);

  const pinTaskStmt = db.prepare(`
    UPDATE tasks SET pinned = 1, updated_at = ? WHERE id = ?
  `);

  const unpinTaskStmt = db.prepare(`
    UPDATE tasks SET pinned = 0, updated_at = ? WHERE id = ?
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
        task.description ?? null,
        task.createdAt ?? now,
        task.updatedAt ?? now,
        task.pickedAt ?? null,
        task.startedAt ?? null,
        task.completedAt ?? null,
      );

      const row = selectTaskById.get(id) as Record<string, unknown>;
      return rowToTask(row);
    },

    async listTasks(status?: TaskStatus, limit?: number, deviceId?: string, from?: string, to?: string, priority?: TaskPriority): Promise<Task[]> {
      // Use dynamic SQL when date range or priority filtering is requested
      if (from || to || priority) {
        const conditions: string[] = ["archived_at IS NULL"];
        const params: (string | number | null)[] = [];

        if (status) {
          conditions.push("status = ?");
          params.push(status);
        }
        if (deviceId) {
          conditions.push("(assigned_device_id IS NULL OR assigned_device_id = ?)");
          params.push(deviceId);
        }
        if (from) {
          conditions.push("created_at >= ?");
          params.push(from);
        }
        if (to) {
          conditions.push("created_at <= ?");
          params.push(to);
        }
        if (priority) {
          conditions.push("priority = ?");
          params.push(priority);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const effectiveLimit = limit ?? 100;
        const sql = `
          SELECT * FROM tasks ${where}
          ORDER BY
            pinned DESC,
            CASE priority
              WHEN 'urgent' THEN 0
              WHEN 'high' THEN 1
              WHEN 'normal' THEN 2
              WHEN 'low' THEN 3
            END,
            created_at DESC
          LIMIT ?
        `;
        const rows = db.prepare(sql).all(...params, effectiveLimit) as Array<
          Record<string, unknown>
        >;
        return rows.map(rowToTask);
      }

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

      if (options.priority) {
        conditions.push("priority = ?");
        params.push(options.priority);
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
        conditions.push("(command_text LIKE ? OR result_summary LIKE ? OR description LIKE ?)");
        const pattern = `%${options.q}%`;
        params.push(pattern, pattern, pattern);
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

      // Set processing timestamps based on status transition
      if (status === "picked" && !row["picked_at"]) {
        db.prepare(`UPDATE tasks SET status = ?, updated_at = ?, picked_at = ? WHERE id = ?`).run(status, now, now, id);
      } else if (status === "running") {
        if (!row["picked_at"]) {
          // Pending -> running (skipping picked)
          db.prepare(`UPDATE tasks SET status = ?, updated_at = ?, picked_at = ?, started_at = ? WHERE id = ?`).run(status, now, now, now, id);
        } else if (!row["started_at"]) {
          // Picked -> running
          db.prepare(`UPDATE tasks SET status = ?, updated_at = ?, started_at = ? WHERE id = ?`).run(status, now, now, id);
        } else {
          Number(updateTaskStatusStmt.run(status, now, id));
        }
      } else if (status === "done" || status === "failed") {
        Number(updateTaskStatusStmt.run(status, now, id));
        if (!row["completed_at"]) {
          db.prepare(`UPDATE tasks SET completed_at = ? WHERE id = ?`).run(now, id);
        }
      } else {
        Number(updateTaskStatusStmt.run(status, now, id));
      }

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
      // Set completed_at if not already set
      if (!row["completed_at"]) {
        db.prepare(`UPDATE tasks SET completed_at = ? WHERE id = ?`).run(now, id);
      }

      const updated = selectTaskById.get(id) as Record<string, unknown>;
      return rowToTask(updated);
    },
    async retryTask(taskId: string): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const currentStatus = row["status"] as TaskStatus;
      if (currentStatus !== "done" && currentStatus !== "failed") {
        throw new Error(
          `Cannot retry task in status '${currentStatus}'. Only 'done' or 'failed' tasks can be retried.`,
        );
      }

      const now = new Date().toISOString();
      Number(retryTaskStmt.run(now, taskId));

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async cloneTask(taskId: string): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      const newId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const originalMessageId = row["feishu_message_id"] as string;
      const clonedMessageId = `${originalMessageId}_clone_${Date.now()}`;

      const tagsJson = row["tags"] as string | null;
      const attachmentsJson = row["attachments"] as string | null;

      Number(insertTask.run(
        newId,
        row["source"] as string,
        clonedMessageId,
        row["feishu_chat_id"] as string,
        row["feishu_user_id"] as string,
        row["command_text"] as string,
        "pending",
        (row["priority"] as string) ?? "normal",
        tagsJson,
        attachmentsJson,
        null, // cloned task starts unassigned
        (row["due_date"] as string) ?? null,
        (row["reminder_at"] as string) ?? null,
        (row["description"] as string) ?? null,
        now,
        now,
        null, // picked_at
        null, // started_at
        null, // completed_at
      ));

      const cloned = selectTaskById.get(newId) as Record<string, unknown>;
      return rowToTask(cloned);
    },

    async pinTask(taskId: string): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }
      const now = new Date().toISOString();
      Number(pinTaskStmt.run(now, taskId));
      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async unpinTask(taskId: string): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }
      const now = new Date().toISOString();
      Number(unpinTaskStmt.run(now, taskId));
      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async forwardTask(taskId: string, targetDeviceId: string, message?: string): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      // Assign to target device and reset to pending
      Number(assignTaskStmt.run(targetDeviceId, now, taskId));
      Number(retryTaskStmt.run(now, taskId));

      // Add forwarding comment if message provided
      if (message && message.trim()) {
        db.prepare(`
          INSERT INTO task_comments (task_id, author, author_type, body, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(taskId, "system", "system", `[Forwarded] ${message.trim()}`, now);
      }

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
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

    async setTaskDescription(taskId: string, description: string | null): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?`).run(
        description,
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

    async bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }> {
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
          const existingTags = parseTags(row["tags"]) ?? [];
          const mergedTags = [...new Set([...existingTags, ...tags])].sort();
          const tagsJson = JSON.stringify(mergedTags);
          db.prepare(`UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?`).run(tagsJson, now, id);
          updated++;
        } catch (e) {
          errors.push(`Error adding tags to ${id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { updated, errors };
    },

    async bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }> {
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
          const existingTags = parseTags(row["tags"]) ?? [];
          const filteredTags = existingTags.filter((t) => t !== tag);
          const tagsJson = filteredTags.length > 0 ? JSON.stringify(filteredTags) : null;
          db.prepare(`UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?`).run(tagsJson, now, id);
          updated++;
        } catch (e) {
          errors.push(`Error removing tag from ${id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { updated, errors };
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

    async getDependencyGraph(taskId: string): Promise<import("../../shared/types.js").DependencyGraph> {
      // Verify root task exists
      const rootRow = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!rootRow) {
        throw new Error(`Task not found: ${taskId}`);
      }
      const rootTask = rowToTask(rootRow);

      const edges: Array<{ from: string; to: string }> = [];
      const visited = new Set<string>();
      let maxUpstreamDepth = 0;
      let maxDownstreamDepth = 0;

      // Recursively build upstream tree (prerequisites)
      function buildUpstream(id: string, depth: number): import("../../shared/types.js").DependencyTreeNode[] {
        if (depth > maxUpstreamDepth) maxUpstreamDepth = depth;
        const depIds = db.prepare(
          `SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?`
        ).all(id) as Array<Record<string, unknown>>;

        return depIds.map((row) => {
          const depId = row["depends_on_task_id"] as string;
          edges.push({ from: id, to: depId });
          visited.add(depId);

          const depRow = selectTaskById.get(depId) as Record<string, unknown> | undefined;
          if (!depRow) {
            return { taskId: depId, status: "pending" as const, commandText: "(deleted)", children: [] };
          }
          const depTask = rowToTask(depRow);
          return {
            taskId: depId,
            status: depTask.status,
            commandText: depTask.commandText,
            children: buildUpstream(depId, depth + 1),
          };
        });
      }

      // Recursively build downstream tree (dependents)
      function buildDownstream(id: string, depth: number): import("../../shared/types.js").DependencyTreeNode[] {
        if (depth > maxDownstreamDepth) maxDownstreamDepth = depth;
        const dependentIds = db.prepare(
          `SELECT task_id FROM task_dependencies WHERE depends_on_task_id = ?`
        ).all(id) as Array<Record<string, unknown>>;

        return dependentIds.map((row) => {
          const depId = row["task_id"] as string;
          edges.push({ from: depId, to: id });
          visited.add(depId);

          const depRow = selectTaskById.get(depId) as Record<string, unknown> | undefined;
          if (!depRow) {
            return { taskId: depId, status: "pending" as const, commandText: "(deleted)", children: [] };
          }
          const depTask = rowToTask(depRow);
          return {
            taskId: depId,
            status: depTask.status,
            commandText: depTask.commandText,
            children: buildDownstream(depId, depth + 1),
          };
        });
      }

      const upstream = buildUpstream(taskId, 1);
      const downstream = buildDownstream(taskId, 1);

      // Count total unique nodes (root + all visited)
      const totalNodes = visited.size + 1; // +1 for root

      return {
        taskId,
        status: rootTask.status,
        commandText: rootTask.commandText,
        upstream,
        downstream,
        maxUpstreamDepth,
        maxDownstreamDepth,
        totalNodes,
        edges,
      };
    },

    // ── Task Locks ───────────────────────────────────────────────

    async lockTask(taskId: string, deviceId: string, ttlMs: number = 300000): Promise<import("../../shared/types.js").TaskLock> {
      // Verify task exists
      const taskRow = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!taskRow) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();

      // Check if already locked by someone else
      const existing = db.prepare(
        `SELECT locked_by, expires_at FROM task_locks WHERE task_id = ?`
      ).get(taskId) as Record<string, unknown> | undefined;

      if (existing) {
        const expiresAtExisting = existing["expires_at"] as string;
        if (new Date(expiresAtExisting) > new Date(now)) {
          // Lock is still active
          if (existing["locked_by"] !== deviceId) {
            throw new Error(`Task ${taskId} is locked by device ${existing["locked_by"]}`);
          }
          // Same device — refresh the lock
          db.prepare(
            `UPDATE task_locks SET locked_at = ?, expires_at = ? WHERE task_id = ?`
          ).run(now, expiresAt, taskId);
        } else {
          // Lock expired — replace it
          db.prepare(
            `UPDATE task_locks SET locked_by = ?, locked_at = ?, expires_at = ? WHERE task_id = ?`
          ).run(deviceId, now, expiresAt, taskId);
        }
      } else {
        // No lock — create one
        db.prepare(
          `INSERT INTO task_locks (task_id, locked_by, locked_at, expires_at) VALUES (?, ?, ?, ?)`
        ).run(taskId, deviceId, now, expiresAt);
      }

      return { taskId, lockedBy: deviceId, lockedAt: now, expiresAt };
    },

    async unlockTask(taskId: string, deviceId: string): Promise<boolean> {
      const existing = db.prepare(
        `SELECT locked_by FROM task_locks WHERE task_id = ?`
      ).get(taskId) as Record<string, unknown> | undefined;

      if (!existing) return false;
      if (existing["locked_by"] !== deviceId) {
        throw new Error(`Task ${taskId} is locked by device ${existing["locked_by"]}, not ${deviceId}`);
      }

      const result = db.prepare(`DELETE FROM task_locks WHERE task_id = ? AND locked_by = ?`).run(taskId, deviceId);
      return Number(result.changes) > 0;
    },

    async getTaskLock(taskId: string): Promise<import("../../shared/types.js").TaskLock | undefined> {
      const row = db.prepare(
        `SELECT task_id, locked_by, locked_at, expires_at FROM task_locks WHERE task_id = ?`
      ).get(taskId) as Record<string, unknown> | undefined;

      if (!row) return undefined;

      // Check if expired
      if (new Date(row["expires_at"] as string) <= new Date()) {
        db.prepare(`DELETE FROM task_locks WHERE task_id = ?`).run(taskId);
        return undefined;
      }

      return {
        taskId: row["task_id"] as string,
        lockedBy: row["locked_by"] as string,
        lockedAt: row["locked_at"] as string,
        expiresAt: row["expires_at"] as string,
      };
    },

    async cleanupExpiredLocks(): Promise<number> {
      const now = new Date().toISOString();
      const result = db.prepare(
        `DELETE FROM task_locks WHERE expires_at <= ?`
      ).run(now);
      return Number(result.changes);
    },

    // ── Task Subtasks ──────────────────────────────────────────

    async createSubtask(parentTaskId: string, title: string, commandText: string): Promise<import("../../shared/types.js").Subtask> {
      // Verify parent task exists
      const parentRow = selectTaskById.get(parentTaskId) as Record<string, unknown> | undefined;
      if (!parentRow) {
        throw new Error(`Task not found: ${parentTaskId}`);
      }

      const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      db.prepare(`\n        INSERT INTO task_subtasks (id, parent_task_id, title, command_text, status, created_at, updated_at)\n        VALUES (?, ?, ?, ?, 'pending', ?, ?)\n      `).run(id, parentTaskId, title, commandText, now, now);

      const row = db.prepare(`SELECT * FROM task_subtasks WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToSubtask(row);
    },

    async listSubtasks(parentTaskId: string): Promise<import("../../shared/types.js").Subtask[]> {
      const rows = db.prepare(`\n        SELECT * FROM task_subtasks\n        WHERE parent_task_id = ?\n        ORDER BY created_at ASC\n      `).all(parentTaskId) as Array<Record<string, unknown>>;
      return rows.map(rowToSubtask);
    },

    async getSubtask(parentTaskId: string, subtaskId: string): Promise<import("../../shared/types.js").Subtask | undefined> {
      const row = db.prepare(`\n        SELECT * FROM task_subtasks\n        WHERE id = ? AND parent_task_id = ?\n      `).get(subtaskId, parentTaskId) as Record<string, unknown> | undefined;
      return row ? rowToSubtask(row) : undefined;
    },

    async updateSubtaskStatus(parentTaskId: string, subtaskId: string, status: TaskStatus): Promise<import("../../shared/types.js").Subtask> {
      const row = db.prepare(`\n        SELECT * FROM task_subtasks\n        WHERE id = ? AND parent_task_id = ?\n      `).get(subtaskId, parentTaskId) as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error(`Subtask not found: ${subtaskId}`);
      }

      const currentStatus = row["status"] as TaskStatus;
      if (!isValidTransition(currentStatus, status)) {
        throw new Error(`Invalid status transition: ${currentStatus} -> ${status}`);
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE task_subtasks SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, subtaskId);

      const updated = db.prepare(`SELECT * FROM task_subtasks WHERE id = ?`).get(subtaskId) as Record<string, unknown>;
      return rowToSubtask(updated);
    },

    async saveSubtaskResult(parentTaskId: string, subtaskId: string, success: boolean, summary: string, details?: string): Promise<import("../../shared/types.js").Subtask> {
      const row = db.prepare(`\n        SELECT * FROM task_subtasks\n        WHERE id = ? AND parent_task_id = ?\n      `).get(subtaskId, parentTaskId) as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error(`Subtask not found: ${subtaskId}`);
      }

      const newStatus: TaskStatus = success ? "done" : "failed";
      const now = new Date().toISOString();
      db.prepare(`\n        UPDATE task_subtasks SET status = ?, result_summary = ?, result_details = ?, updated_at = ?\n        WHERE id = ?\n      `).run(newStatus, summary, details ?? null, now, subtaskId);

      const updated = db.prepare(`SELECT * FROM task_subtasks WHERE id = ?`).get(subtaskId) as Record<string, unknown>;
      return rowToSubtask(updated);
    },

    async deleteSubtask(parentTaskId: string, subtaskId: string): Promise<boolean> {
      const result = db.prepare(`\n        DELETE FROM task_subtasks\n        WHERE id = ? AND parent_task_id = ?\n      `).run(subtaskId, parentTaskId);
      return Number(result.changes) > 0;
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
            task.description ?? null,
            task.createdAt,
            task.updatedAt,
            task.pickedAt ?? null,
            task.startedAt ?? null,
            task.completedAt ?? null,
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

    // ── SLA Methods ──────────────────────────────────────────────

    async createSlaPolicy(policy: Omit<SlaPolicy, "id" | "createdAt" | "updatedAt">): Promise<SlaPolicy> {
      const id = `sla_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const prioritiesJson = policy.matchPriorities && policy.matchPriorities.length > 0
        ? JSON.stringify(policy.matchPriorities)
        : null;
      const tagsJson = policy.matchTags && policy.matchTags.length > 0
        ? JSON.stringify(policy.matchTags)
        : null;

      db.prepare(`\n        INSERT INTO sla_policies (id, name, description, target_minutes, warning_threshold_percent, match_priorities, match_tags, enabled, created_by, created_at, updated_at)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      `).run(
        id,
        policy.name,
        policy.description ?? null,
        policy.targetMinutes,
        policy.warningThresholdPercent,
        prioritiesJson,
        tagsJson,
        policy.enabled ? 1 : 0,
        policy.createdBy,
        now,
        now,
      );

      const row = db.prepare(`SELECT * FROM sla_policies WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToSlaPolicy(row);
    },

    async listSlaPolicies(): Promise<SlaPolicy[]> {
      const rows = db.prepare(`SELECT * FROM sla_policies ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
      return rows.map(rowToSlaPolicy);
    },

    async getSlaPolicy(id: string): Promise<SlaPolicy | undefined> {
      const row = db.prepare(`SELECT * FROM sla_policies WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      return row ? rowToSlaPolicy(row) : undefined;
    },

    async updateSlaPolicy(
      id: string,
      updates: Partial<Pick<SlaPolicy, "name" | "description" | "targetMinutes" | "warningThresholdPercent" | "matchPriorities" | "matchTags" | "enabled">>,
    ): Promise<SlaPolicy> {
      const existing = db.prepare(`SELECT * FROM sla_policies WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        throw new Error(`SLA policy not found: ${id}`);
      }

      const now = new Date().toISOString();
      const setClauses: string[] = [];
      const params: (string | number | null)[] = [];

      if (updates.name !== undefined) { setClauses.push("name = ?"); params.push(updates.name); }
      if (updates.description !== undefined) { setClauses.push("description = ?"); params.push(updates.description ?? null); }
      if (updates.targetMinutes !== undefined) { setClauses.push("target_minutes = ?"); params.push(updates.targetMinutes); }
      if (updates.warningThresholdPercent !== undefined) { setClauses.push("warning_threshold_percent = ?"); params.push(updates.warningThresholdPercent); }
      if (updates.matchPriorities !== undefined) {
        setClauses.push("match_priorities = ?");
        params.push(updates.matchPriorities && updates.matchPriorities.length > 0 ? JSON.stringify(updates.matchPriorities) : null);
      }
      if (updates.matchTags !== undefined) {
        setClauses.push("match_tags = ?");
        params.push(updates.matchTags && updates.matchTags.length > 0 ? JSON.stringify(updates.matchTags) : null);
      }
      if (updates.enabled !== undefined) { setClauses.push("enabled = ?"); params.push(updates.enabled ? 1 : 0); }

      if (setClauses.length === 0) {
        return rowToSlaPolicy(existing);
      }

      setClauses.push("updated_at = ?");
      params.push(now);
      params.push(id);

      db.prepare(`UPDATE sla_policies SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

      const row = db.prepare(`SELECT * FROM sla_policies WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToSlaPolicy(row);
    },

    async deleteSlaPolicy(id: string): Promise<boolean> {
      // Delete associated breach logs first
      db.prepare(`DELETE FROM sla_breach_log WHERE policy_id = ?`).run(id);
      const result = db.prepare(`DELETE FROM sla_policies WHERE id = ?`).run(id);
      return Number(result.changes) > 0;
    },

    async getSlaStatusForTask(taskId: string): Promise<{ status: SlaStatus; policy?: SlaPolicy; elapsedMinutes: number; targetMinutes?: number }> {
      const task = await this.getTask(taskId);
      if (!task) {
        return { status: "no_sla", elapsedMinutes: 0 };
      }

      const elapsedMinutes = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60);

      // Find matching SLA policy
      const policies = await this.listSlaPolicies();
      const matchingPolicy = policies.find((p) => {
        if (!p.enabled) return false;
        // Check priority match
        if (p.matchPriorities && p.matchPriorities.length > 0) {
          if (!p.matchPriorities.includes(task.priority)) return false;
        }
        // Check tag match (all specified tags must be present)
        if (p.matchTags && p.matchTags.length > 0) {
          const taskTags = task.tags ?? [];
          if (!p.matchTags.every((t) => taskTags.includes(t))) return false;
        }
        return true;
      });

      if (!matchingPolicy) {
        return { status: "no_sla", elapsedMinutes };
      }

      // Calculate SLA status based on elapsed time vs target
      const warningMinutes = (matchingPolicy.targetMinutes * matchingPolicy.warningThresholdPercent) / 100;

      if (elapsedMinutes >= matchingPolicy.targetMinutes) {
        return { status: "breached", policy: matchingPolicy, elapsedMinutes, targetMinutes: matchingPolicy.targetMinutes };
      } else if (elapsedMinutes >= warningMinutes) {
        return { status: "warning", policy: matchingPolicy, elapsedMinutes, targetMinutes: matchingPolicy.targetMinutes };
      } else {
        return { status: "on_track", policy: matchingPolicy, elapsedMinutes, targetMinutes: matchingPolicy.targetMinutes };
      }
    },

    async listSlaBreaches(): Promise<SlaBreachLog[]> {
      const rows = db.prepare(`\n        SELECT * FROM sla_breach_log\n        WHERE resolved_at IS NULL\n        ORDER BY detected_at DESC\n      `).all() as Array<Record<string, unknown>>;
      return rows.map(rowToSlaBreachLog);
    },

    async getSlaSummary(): Promise<SlaSummary> {
      const policies = await this.listSlaPolicies();
      const policyStats: SlaSummary["policyStats"] = [];
      let totalTracked = 0;
      let totalOnTrack = 0;
      let totalWarning = 0;
      let totalBreached = 0;
      let totalResolutionMinutes = 0;
      let resolvedCount = 0;

      for (const policy of policies) {
        if (!policy.enabled) continue;

        // Find tasks matching this policy
        const conditions: string[] = ["status IN ('pending', 'picked', 'running')"];
        const params: (string | number | null)[] = [];

        if (policy.matchPriorities && policy.matchPriorities.length > 0) {
          const placeholders = policy.matchPriorities.map(() => "?").join(",");
          conditions.push(`priority IN (${placeholders})`);
          params.push(...policy.matchPriorities);
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;
        const taskRows = db.prepare(`SELECT * FROM tasks ${whereClause}`).all(...params) as Array<Record<string, unknown>>;

        let onTrack = 0;
        let warning = 0;
        let breached = 0;

        for (const taskRow of taskRows) {
          const task = rowToTask(taskRow);
          // Apply tag filter in JS
          if (policy.matchTags && policy.matchTags.length > 0) {
            const taskTags = task.tags ?? [];
            if (!policy.matchTags.every((t) => taskTags.includes(t))) continue;
          }

          const elapsedMinutes = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60);
          const warningMinutes = (policy.targetMinutes * policy.warningThresholdPercent) / 100;

          if (elapsedMinutes >= policy.targetMinutes) {
            breached++;
          } else if (elapsedMinutes >= warningMinutes) {
            warning++;
          } else {
            onTrack++;
          }
        }

        totalTracked += onTrack + warning + breached;
        totalOnTrack += onTrack;
        totalWarning += warning;
        totalBreached += breached;

        policyStats.push({
          policyId: policy.id,
          policyName: policy.name,
          targetMinutes: policy.targetMinutes,
          tasksTracked: onTrack + warning + breached,
          onTrack,
          warning,
          breached,
        });
      }

      // Calculate average resolution time for completed tasks
      const avgRow = db.prepare(`\n        SELECT AVG((julianday(updated_at) - julianday(created_at)) * 24 * 60) as avg_minutes\n        FROM tasks\n        WHERE status IN ('done', 'failed')\n      `).get() as Record<string, unknown> | undefined;
      if (avgRow && avgRow["avg_minutes"] != null) {
        totalResolutionMinutes = Number(avgRow["avg_minutes"]);
        resolvedCount = 1; // Flag that we have data
      }

      return {
        totalTasksTracked: totalTracked,
        onTrack: totalOnTrack,
        warning: totalWarning,
        breached: totalBreached,
        avgResolutionMinutes: resolvedCount > 0 ? totalResolutionMinutes : undefined,
        policyStats,
      };
    },

    async checkAndRecordSlaBreaches(): Promise<{ warnings: number; breaches: number }> {
      const policies = await this.listSlaPolicies();
      let warnings = 0;
      let breaches = 0;
      const now = new Date().toISOString();

      for (const policy of policies) {
        if (!policy.enabled) continue;

        // Find active tasks matching this policy
        const conditions: string[] = ["status IN ('pending', 'picked', 'running')"];
        const params: (string | number | null)[] = [];

        if (policy.matchPriorities && policy.matchPriorities.length > 0) {
          const placeholders = policy.matchPriorities.map(() => "?").join(",");
          conditions.push(`priority IN (${placeholders})`);
          params.push(...policy.matchPriorities);
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;
        const taskRows = db.prepare(`SELECT * FROM tasks ${whereClause}`).all(...params) as Array<Record<string, unknown>>;

        for (const taskRow of taskRows) {
          const task = rowToTask(taskRow);
          // Apply tag filter
          if (policy.matchTags && policy.matchTags.length > 0) {
            const taskTags = task.tags ?? [];
            if (!policy.matchTags.every((t) => taskTags.includes(t))) continue;
          }

          const elapsedMinutes = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60);
          const warningMinutes = (policy.targetMinutes * policy.warningThresholdPercent) / 100;

          // Check if we already have a log for this task+policy+type
          const existingWarning = db.prepare(`\n            SELECT 1 FROM sla_breach_log\n            WHERE task_id = ? AND policy_id = ? AND breach_type = 'warning' AND resolved_at IS NULL\n          `).get(task.id, policy.id) as unknown;

          const existingBreach = db.prepare(`\n            SELECT 1 FROM sla_breach_log\n            WHERE task_id = ? AND policy_id = ? AND breach_type = 'breach' AND resolved_at IS NULL\n          `).get(task.id, policy.id) as unknown;

          if (elapsedMinutes >= policy.targetMinutes && !existingBreach) {
            // Record breach
            db.prepare(`\n              INSERT INTO sla_breach_log (task_id, policy_id, policy_name, breach_type, target_minutes, actual_minutes, detected_at)\n              VALUES (?, ?, ?, 'breach', ?, ?, ?)\n            `).run(task.id, policy.id, policy.name, policy.targetMinutes, elapsedMinutes, now);

            // Auto-resolve warning if exists
            if (existingWarning) {
              db.prepare(`UPDATE sla_breach_log SET resolved_at = ? WHERE task_id = ? AND policy_id = ? AND breach_type = 'warning' AND resolved_at IS NULL`).run(now, task.id, policy.id);
            }
            breaches++;
          } else if (elapsedMinutes >= warningMinutes && !existingWarning && !existingBreach) {
            // Record warning
            db.prepare(`\n              INSERT INTO sla_breach_log (task_id, policy_id, policy_name, breach_type, target_minutes, actual_minutes, detected_at)\n              VALUES (?, ?, ?, 'warning', ?, ?, ?)\n            `).run(task.id, policy.id, policy.name, policy.targetMinutes, elapsedMinutes, now);
            warnings++;
          }
        }
      }

      // Auto-resolve breaches/warnings for completed tasks
      db.prepare(`\n        UPDATE sla_breach_log SET resolved_at = ?\n        WHERE resolved_at IS NULL\n        AND task_id IN (SELECT id FROM tasks WHERE status IN ('done', 'failed'))\n      `).run(now);

     return { warnings, breaches };
   },

    async getTaskStats(): Promise<import("../../shared/types.js").TaskStats> {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();

      // Total count
      const totalRow = db.prepare(`SELECT COUNT(*) as cnt FROM tasks`).get() as Record<string, unknown>;
      const total = Number(totalRow["cnt"]);

      // Count by status
      const statusRows = db.prepare(`SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status`).all() as Array<Record<string, unknown>>;
      const byStatus: Record<TaskStatus, number> = { pending: 0, picked: 0, running: 0, done: 0, failed: 0 };
      for (const row of statusRows) {
        byStatus[row["status"] as TaskStatus] = Number(row["cnt"]);
      }

      // Count by priority
      const priorityRows = db.prepare(`SELECT priority, COUNT(*) as cnt FROM tasks GROUP BY priority`).all() as Array<Record<string, unknown>>;
      const byPriority: Record<TaskPriority, number> = { low: 0, normal: 0, high: 0, urgent: 0 };
      for (const row of priorityRows) {
        const p = (row["priority"] as TaskPriority) ?? "normal";
        byPriority[p] = Number(row["cnt"]);
      }

      // Daily created (last 7 days)
      const dailyCreatedRows = db.prepare(`
        SELECT DATE(created_at) as day, COUNT(*) as cnt
        FROM tasks
        WHERE created_at >= ?
        GROUP BY day ORDER BY day
      `).all(sevenDaysAgoISO) as Array<Record<string, unknown>>;
      const dailyCreated = dailyCreatedRows.map(r => ({ date: r["day"] as string, count: Number(r["cnt"]) }));

      // Daily completed (last 7 days)
      const dailyCompletedRows = db.prepare(`
        SELECT DATE(updated_at) as day, COUNT(*) as cnt
        FROM tasks
        WHERE status IN ('done', 'failed') AND updated_at >= ?
        GROUP BY day ORDER BY day
      `).all(sevenDaysAgoISO) as Array<Record<string, unknown>>;
      const dailyCompleted = dailyCompletedRows.map(r => ({ date: r["day"] as string, count: Number(r["cnt"]) }));

      // Resolution times for completed tasks in last 7 days
      const resolutionRows = db.prepare(`
        SELECT (julianday(updated_at) - julianday(created_at)) * 24 * 60 as minutes
        FROM tasks
        WHERE status IN ('done', 'failed') AND updated_at >= ?
        ORDER BY minutes
      `).all(sevenDaysAgoISO) as Array<Record<string, unknown>>;

      let avgResolutionMinutes: number | null = null;
      let medianResolutionMinutes: number | null = null;
      if (resolutionRows.length > 0) {
        const values = resolutionRows.map(r => Number(r["minutes"]));
        avgResolutionMinutes = values.reduce((a, b) => a + b, 0) / values.length;
        const mid = Math.floor(values.length / 2);
        medianResolutionMinutes = values.length % 2 !== 0
          ? values[mid]
          : (values[mid - 1] + values[mid]) / 2;
      }

      // Success rate
      const doneCount = byStatus.done;
      const failedCount = byStatus.failed;
      const successRate = (doneCount + failedCount) > 0
        ? Math.round((doneCount / (doneCount + failedCount)) * 1000) / 10
        : null;

      // Top 10 tags
      const allTagRows = db.prepare(`SELECT tags FROM tasks WHERE tags IS NOT NULL AND tags != '[]'`).all() as Array<Record<string, unknown>>;
      const tagCounts = new Map<string, number>();
      for (const row of allTagRows) {
        const tags = parseTags(row["tags"]);
        if (tags) {
          for (const tag of tags) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        }
      }
      const topTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));

      // Overdue count
      const overdueRow = db.prepare(`
        SELECT COUNT(*) as cnt FROM tasks
        WHERE due_date IS NOT NULL AND due_date < ? AND status IN ('pending', 'picked', 'running')
      `).get(now.toISOString()) as Record<string, unknown>;
      const overdueCount = Number(overdueRow["cnt"]);

      return {
        total,
        byStatus,
        byPriority,
        dailyCreated,
        dailyCompleted,
        avgResolutionMinutes: avgResolutionMinutes !== null ? Math.round(avgResolutionMinutes * 10) / 10 : null,
        medianResolutionMinutes: medianResolutionMinutes !== null ? Math.round(medianResolutionMinutes * 10) / 10 : null,
        successRate,
        topTags,
        overdueCount,
        computedAt: now.toISOString(),
      };
    },

    async getTaskTimeSeries(
      from: string,
      to: string,
      interval: import("../../shared/types.js").TimeSeriesInterval,
      metric: import("../../shared/types.js").TimeSeriesMetric,
    ): Promise<import("../../shared/types.js").TimeSeriesResult> {
      // Build date truncation format based on interval
      const truncFmt = interval === "hour" ? "%Y-%m-%dT%H:00:00"
        : interval === "week" ? "%Y-W%W"
        : interval === "month" ? "%Y-%m"
        : "%Y-%m-%d"; // day

      // Generate all expected bucket timestamps for filling gaps
      function* generateBuckets(start: Date, end: Date, iv: import("../../shared/types.js").TimeSeriesInterval): Generator<string> {
        const d = new Date(start);
        while (d <= end) {
          if (iv === "hour") {
            yield d.toISOString().slice(0, 13) + ":00:00";
            d.setUTCHours(d.getUTCHours() + 1);
          } else if (iv === "week") {
            // Align to Monday
            const day = d.getUTCDay();
            const diff = day === 0 ? -6 : 1 - day;
            d.setUTCDate(d.getUTCDate() + diff);
            const y = d.getUTCFullYear();
            const weekNum = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
            yield `${y}-W${String(weekNum).padStart(2, "0")}`;
            d.setUTCDate(d.getUTCDate() + 7);
          } else if (iv === "month") {
            yield d.toISOString().slice(0, 7);
            d.setUTCMonth(d.getUTCMonth() + 1);
          } else {
            yield d.toISOString().slice(0, 10);
            d.setUTCDate(d.getUTCDate() + 1);
          }
        }
      }

      const buckets = new Map<string, number>();
      for (const b of generateBuckets(new Date(from), new Date(to), interval)) {
        buckets.set(b, 0);
      }

      if (metric === "created") {
        const rows = db.prepare(`
          SELECT strftime('${truncFmt}', created_at) as bucket, COUNT(*) as cnt
          FROM tasks
          WHERE created_at >= ? AND created_at < ?
          GROUP BY bucket ORDER BY bucket
        `).all(from, to) as Array<Record<string, unknown>>;
        for (const row of rows) {
          const key = row["bucket"] as string;
          if (buckets.has(key)) buckets.set(key, Number(row["cnt"]));
        }
      } else if (metric === "completed") {
        const rows = db.prepare(`
          SELECT strftime('${truncFmt}', updated_at) as bucket, COUNT(*) as cnt
          FROM tasks
          WHERE status IN ('done', 'failed')
            AND updated_at >= ? AND updated_at < ?
          GROUP BY bucket ORDER BY bucket
        `).all(from, to) as Array<Record<string, unknown>>;
        for (const row of rows) {
          const key = row["bucket"] as string;
          if (buckets.has(key)) buckets.set(key, Number(row["cnt"]));
        }
      } else if (metric === "resolution_time") {
        // Get resolution times grouped by bucket
        const rows = db.prepare(`
          SELECT
            strftime('${truncFmt}', created_at) as bucket,
            (julianday(updated_at) - julianday(created_at)) * 24 * 60 as minutes
          FROM tasks
          WHERE status IN ('done', 'failed')
            AND created_at >= ? AND created_at < ?
          ORDER BY bucket
        `).all(from, to) as Array<Record<string, unknown>>;

        // Group minutes by bucket
        const bucketTimes = new Map<string, number[]>();
        for (const row of rows) {
          const key = row["bucket"] as string;
          const mins = Number(row["minutes"]);
          if (!bucketTimes.has(key)) bucketTimes.set(key, []);
          bucketTimes.get(key)!.push(mins);
        }

        for (const [key] of buckets) {
          const times = bucketTimes.get(key);
          if (times && times.length > 0) {
            const sorted = [...times].sort((a, b) => a - b);
            const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 !== 0
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2;
            buckets.set(key, times.length);
            // Store avg/median as separate values — we'll set them on the data point below
          }
        }

        const data: import("../../shared/types.js").TimeSeriesDataPoint[] = [];
        for (const [key, count] of buckets) {
          const times = bucketTimes.get(key);
          const dp: import("../../shared/types.js").TimeSeriesDataPoint = { timestamp: key, count };
          if (times && times.length > 0) {
            const sorted = [...times].sort((a, b) => a - b);
            const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 !== 0
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2;
            dp.avgResolutionMinutes = Math.round(avg * 10) / 10;
            dp.medianResolutionMinutes = Math.round(median * 10) / 10;
          }
          data.push(dp);
        }

        return {
          interval,
          metric,
          from,
          to,
          data,
        };
      }

      const data: import("../../shared/types.js").TimeSeriesDataPoint[] = [];
      for (const [key, count] of buckets) {
        data.push({ timestamp: key, count });
      }

      return {
        interval,
        metric,
        from,
        to,
        data,
      };
    },

    async getAllTasks(): Promise<Task[]> {
      const rows = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
      return rows.map(rowToTask);
    },

    // ── Task Notes (internal annotations) ──────────────────────────

    async addNote(taskId: string, author: string, body: string): Promise<TaskNote> {
      // Verify task exists
      const task = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      const result = db.prepare(
        `INSERT INTO task_notes (task_id, author, body, created_at) VALUES (?, ?, ?, ?)`,
      ).run(taskId, author, body, now);

      const noteId = Number(result.lastInsertRowid);
      const row = db.prepare(`SELECT * FROM task_notes WHERE id = ?`).get(noteId) as Record<string, unknown>;
      return {
        id: row["id"] as number,
        taskId: row["task_id"] as string,
        author: row["author"] as string,
        body: row["body"] as string,
        createdAt: row["created_at"] as string,
      };
    },

    async listNotes(taskId: string): Promise<TaskNote[]> {
      const rows = db.prepare(
        `SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at ASC`,
      ).all(taskId) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: row["id"] as number,
        taskId: row["task_id"] as string,
        author: row["author"] as string,
        body: row["body"] as string,
        createdAt: row["created_at"] as string,
      }));
    },

    async deleteNote(noteId: number, taskId: string): Promise<boolean> {
      const result = db.prepare(
        `DELETE FROM task_notes WHERE id = ? AND task_id = ?`,
      ).run(noteId, taskId);
      return Number(result.changes) > 0;
    },

    // ── Task User Search ──────────────────────────────────────────

    async listTasksByUser(userId: string, limit?: number): Promise<Task[]> {
      const effectiveLimit = Math.min(limit ?? 20, 100);
      const rows = db.prepare(
        `SELECT * FROM tasks WHERE feishu_user_id = ? ORDER BY created_at DESC LIMIT ?`,
      ).all(userId, effectiveLimit) as Array<Record<string, unknown>>;
      return rows.map(rowToTask);
    },

    // ── Activity Feed ──────────────────────────────────────────────

    async getActivityFeed(taskId: string, limit?: number): Promise<import("../../shared/types.js").ActivityFeedItem[]> {
      // Verify task exists
      const task = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const effectiveLimit = Math.min(limit ?? 50, 200);
      const items: import("../../shared/types.js").ActivityFeedItem[] = [];

      // 1. Task creation event
      items.push({
        type: "task.created",
        timestamp: task["created_at"] as string,
        actor: task["feishu_user_id"] as string,
        actorType: "feishu",
        summary: `Task created: ${(task["command_text"] as string).slice(0, 100)}`,
        details: { commandText: task["command_text"] as string },
      });

      // 2. Comments
      const commentRows = db.prepare(
        `SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC`,
      ).all(taskId) as Array<Record<string, unknown>>;
      for (const row of commentRows) {
        items.push({
          type: "comment.added",
          timestamp: row["created_at"] as string,
          actor: row["author"] as string,
          actorType: row["author_type"] as string,
          summary: `Comment by ${row["author"]}: ${(row["body"] as string).slice(0, 100)}`,
          details: { commentId: row["id"], body: row["body"] as string },
        });
      }

      // 3. Notes (internal annotations)
      const noteRows = db.prepare(
        `SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at ASC`,
      ).all(taskId) as Array<Record<string, unknown>>;
      for (const row of noteRows) {
        items.push({
          type: "note.added",
          timestamp: row["created_at"] as string,
          actor: row["author"] as string,
          actorType: "api",
          summary: `Note by ${row["author"]}: ${(row["body"] as string).slice(0, 100)}`,
          details: { noteId: row["id"], body: row["body"] as string },
        });
      }

      // 4. Subtask events
      const subtaskRows = db.prepare(
        `SELECT * FROM task_subtasks WHERE parent_task_id = ? ORDER BY created_at ASC`,
      ).all(taskId) as Array<Record<string, unknown>>;
      for (const row of subtaskRows) {
        items.push({
          type: "subtask.created",
          timestamp: row["created_at"] as string,
          actor: "system",
          actorType: "system",
          summary: `Subtask created: ${row["title"]}`,
          details: { subtaskId: row["id"], title: row["title"] as string, status: row["status"] as string },
        });
        // If the subtask has a result, add that as a separate event
        if (row["result_summary"]) {
          items.push({
            type: "subtask.result_reported",
            timestamp: row["updated_at"] as string,
            actor: "system",
            actorType: "system",
            summary: `Subtask "${row["title"]}" completed: ${(row["result_summary"] as string).slice(0, 100)}`,
            details: { subtaskId: row["id"], title: row["title"] as string, status: row["status"] as string },
          });
        }
      }

      // Sort by timestamp ascending and apply limit
      items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      return items.slice(0, effectiveLimit);
    },

    // ── Task Archive (soft-delete) ────────────────────────────────

    async archiveTask(taskId: string): Promise<import("../../shared/types.js").Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }
      if (row["archived_at"]) {
        throw new Error(`Task already archived: ${taskId}`);
      }
      const now = new Date().toISOString();
      db.prepare(`UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id = ?`).run(now, now, taskId);
      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async unarchiveTask(taskId: string): Promise<import("../../shared/types.js").Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }
      if (!row["archived_at"]) {
        throw new Error(`Task is not archived: ${taskId}`);
      }
      const now = new Date().toISOString();
      db.prepare(`UPDATE tasks SET archived_at = NULL, updated_at = ? WHERE id = ?`).run(now, taskId);
      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async listArchivedTasks(limit?: number): Promise<import("../../shared/types.js").Task[]> {
      const effectiveLimit = limit ?? 20;
      const rows = db.prepare(`
        SELECT * FROM tasks
        WHERE archived_at IS NOT NULL
        ORDER BY archived_at DESC
        LIMIT ?
      `).all(effectiveLimit) as Array<Record<string, unknown>>;
      return rows.map(rowToTask);
    },

    // ── Task Priority Auto-Escalation ──────────────────────────────

    async escalateOverduePriorities(): Promise<{ escalated: number; tasks: Task[] }> {
      const now = new Date().toISOString();
      // Find overdue tasks with active status (pending, picked, running)
      const overdueRows = db.prepare(`
        SELECT * FROM tasks
        WHERE due_date IS NOT NULL
        AND due_date < ?
        AND status IN ('pending', 'picked', 'running')
        AND archived_at IS NULL
        ORDER BY due_date ASC
      `).all(now) as Array<Record<string, unknown>>;

      const PRIORITY_LADDER: TaskPriority[] = ["low", "normal", "high", "urgent"];
      const escalatedTasks: Task[] = [];

      for (const row of overdueRows) {
        const currentPriority = (row["priority"] as TaskPriority) ?? "normal";
        const currentIndex = PRIORITY_LADDER.indexOf(currentPriority);
        // Already at max priority, skip
        if (currentIndex < 0 || currentIndex >= PRIORITY_LADDER.length - 1) continue;
        const nextPriority = PRIORITY_LADDER[currentIndex + 1];
        if (nextPriority === currentPriority) continue;

        db.prepare(`
          UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?
        `).run(nextPriority, now, row["id"] as string);

        const updated = selectTaskById.get(row["id"] as string) as Record<string, unknown>;
        escalatedTasks.push(rowToTask(updated));
      }

      return { escalated: escalatedTasks.length, tasks: escalatedTasks };
    },

    // ── Kanban Board ──────────────────────────────────────────────

    async getKanbanBoard(limit?: number, deviceId?: string): Promise<import("../../shared/types.js").KanbanBoard> {
      const STATUS_LABELS: Record<TaskStatus, string> = {
        pending: "Pending",
        picked: "Picked",
        running: "Running",
        done: "Done",
        failed: "Failed",
      };
      const STATUSES: TaskStatus[] = ["pending", "picked", "running", "done", "failed"];
      const perColumnLimit = limit ?? 50;

      const columns: import("../../shared/types.js").KanbanColumn[] = [];
      let totalTasks = 0;

      for (const status of STATUSES) {
        const params: (string | number | null)[] = [status];
        let whereClause = "WHERE status = ? AND archived_at IS NULL";
        if (deviceId) {
          whereClause += " AND (assigned_device_id = ? OR assigned_device_id IS NULL)";
          params.push(deviceId);
        }
        whereClause += " ORDER BY pinned DESC, CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, created_at DESC";
        whereClause += ` LIMIT ${perColumnLimit}`;

        const rows = db.prepare(`SELECT * FROM tasks ${whereClause}`).all(...params) as Array<Record<string, unknown>>;
        const tasks = rows.map(rowToTask);
        totalTasks += tasks.length;
        columns.push({
          status,
          label: STATUS_LABELS[status],
          count: tasks.length,
          tasks,
        });
      }

      return { columns, totalTasks };
    },
  };
}
