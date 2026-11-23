import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Task, TaskStatus, TaskPriority, Attachment } from "../../shared/types.js";
import type { TaskComment, TaskNote, AuditLogEntry, TaskTemplate, ScheduledTask } from "../../shared/types.js";
import type { SlaPolicy, SlaBreachLog, SlaBreachType, SlaStatus, SlaSummary } from "../../shared/types.js";
import type { SavedView, SavedViewFilters } from "../../shared/types.js";

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
  cycleId?: string;
  moduleId?: string;
  source?: string;
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
  setTaskPriority(taskId: string, priority: TaskPriority): Promise<Task>;
  setTaskEstimatedMinutes(taskId: string, minutes: number | null): Promise<Task>;
  setTaskCommandText(taskId: string, commandText: string): Promise<Task>;
  listOverdueTasks(): Promise<Task[]>;
  addComment(taskId: string, author: string, authorType: AuditLogEntry["actorType"], body: string): Promise<TaskComment>;
  listComments(taskId: string): Promise<TaskComment[]>;
  deleteComment(commentId: number, taskId: string): Promise<boolean>;
  bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }>;
  bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }>;
  bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }>;
  bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }>;
  bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }>;
  bulkUpdatePriority(ids: string[], priority: TaskPriority): Promise<{ updated: number; errors: string[] }>;
  bulkCloneTasks(ids: string[]): Promise<{ cloned: number; errors: string[]; taskIds: string[] }>;
  bulkUpdateDueDate(ids: string[], dueDate: string | null): Promise<{ updated: number; errors: string[] }>;
  // Task template methods
  createTemplate(template: Omit<TaskTemplate, "id" | "createdAt" | "updatedAt">): Promise<TaskTemplate>;
  listTemplates(): Promise<TaskTemplate[]>;
  getTemplate(id: string): Promise<TaskTemplate | undefined>;
  updateTemplate(id: string, updates: Partial<Pick<TaskTemplate, "name" | "description" | "commandText" | "priority" | "tags" | "assignedDeviceId" | "dueDateOffsetMs" | "reminderOffsetMs" | "variables">>): Promise<TaskTemplate>;
  deleteTemplate(id: string): Promise<boolean>;
  incrementTemplateUsage(id: string): Promise<void>;
  getTemplateUsageStats(): Promise<{ templateId: string; name: string; usageCount: number }[]>;
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
  checkAndRecordSlaBreaches(): Promise<{ warnings: number; breaches: number; details: import("../../shared/types.js").SlaBreachNotification[] }>;

  // Analytics methods
  getTaskStats(): Promise<import("../../shared/types.js").TaskStats>;
  getTaskTimeSeries(
    from: string,
    to: string,
    interval: import("../../shared/types.js").TimeSeriesInterval,
    metric: import("../../shared/types.js").TimeSeriesMetric,
  ): Promise<import("../../shared/types.js").TimeSeriesResult>;
  // Return all tasks without limit (for CSV export, archive, etc.)
  searchAllTasksForExport(options: SearchOptions): Promise<Task[]>;
  getAllTasks(): Promise<Task[]>;
  /** Lightweight projection of completed task timestamps for processing stats */
  getCompletedTaskTimings?(): Promise<Array<{
    status: TaskStatus;
    createdAt: string;
    pickedAt?: string;
    startedAt?: string;
    completedAt: string;
  }>>;
  // Task retry/requeue methods
  retryTask(taskId: string): Promise<Task>;
  // Task cloning methods
  cloneTask(taskId: string): Promise<Task>;
  // Task reopening — reopen a done/failed task back to pending
  reopenTask(taskId: string): Promise<Task>;
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
  // Task relationship methods (blocks, relates_to, duplicates, etc.)
  addRelationship(taskId: string, relatedTaskId: string, relationshipType: import("../../shared/types.js").TaskRelationshipType): Promise<void>;
  removeRelationship(taskId: string, relatedTaskId: string, relationshipType?: import("../../shared/types.js").TaskRelationshipType): Promise<void>;
  listRelationships(taskId: string): Promise<import("../../shared/types.js").TaskRelationship[]>;
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
  // Saved views (custom filter presets)
  createSavedView(name: string, createdBy: string, filters: SavedViewFilters): Promise<SavedView>;
  listSavedViews(createdBy?: string): Promise<SavedView[]>;
  getSavedView(id: string): Promise<SavedView | undefined>;
  updateSavedView(id: string, updates: Partial<Pick<SavedView, "name" | "filters">>): Promise<SavedView>;
  deleteSavedView(id: string): Promise<boolean>;
  // Task watchers (subscribe to task updates)
  addWatcher(taskId: string, userId: string): Promise<import("../../shared/types.js").TaskWatcher>;
  removeWatcher(taskId: string, userId: string): Promise<boolean>;
  listWatchers(taskId: string): Promise<import("../../shared/types.js").TaskWatcher[]>;
  isWatching(taskId: string, userId: string): Promise<boolean>;
  // Time entry methods
  createTimeEntry(taskId: string, startedAt: string, endedAt: string | undefined, durationMinutes: number, description: string | null, loggedBy: string): Promise<import("../../shared/types.js").TimeEntry>;
  listTimeEntries(taskId: string): Promise<import("../../shared/types.js").TimeEntry[]>;
  getTimeEntry(taskId: string, entryId: string): Promise<import("../../shared/types.js").TimeEntry | undefined>;
  deleteTimeEntry(taskId: string, entryId: string): Promise<boolean>;
  stopTimeEntry(taskId: string, entryId: string, endedAt: string): Promise<import("../../shared/types.js").TimeEntry>;
  /** Get aggregated time tracking statistics across all tasks */
  getTimeTrackingSummary(): Promise<import("../../shared/types.js").TimeTrackingSummary>;
  // Phase 63: Cycle (sprint) methods
  createCycle(data: { name: string; description?: string; startDate: string; endDate: string; createdBy: string }): Promise<import("../../shared/types.js").Cycle>;
  listCycles(status?: import("../../shared/types.js").CycleStatus): Promise<import("../../shared/types.js").CycleSummary[]>;
  getCycle(id: string): Promise<import("../../shared/types.js").CycleSummary | undefined>;
  updateCycle(id: string, updates: Partial<Pick<import("../../shared/types.js").Cycle, "name" | "description" | "startDate" | "endDate" | "status">>): Promise<import("../../shared/types.js").Cycle>;
  deleteCycle(id: string): Promise<boolean>;
  addTaskToCycle(taskId: string, cycleId: string): Promise<import("../../shared/types.js").Task>;
  removeTaskFromCycle(taskId: string): Promise<import("../../shared/types.js").Task>;
  listCycleTasks(cycleId: string): Promise<import("../../shared/types.js").Task[]>;
  getCycleProgress(cycleId: string): Promise<import("../../shared/types.js").CycleProgress>;
  // Global activity feed — combined chronological timeline across all tasks
  getGlobalActivity(limit?: number): Promise<import("../../shared/types.js").ActivityFeedItem[]>;
  // Phase 70: Module (epic) methods
  createModule(data: { name: string; description?: string; startDate?: string; endDate?: string; createdBy: string }): Promise<import("../../shared/types.js").Module>;
  listModules(status?: import("../../shared/types.js").ModuleStatus): Promise<import("../../shared/types.js").ModuleWithProgress[]>;
  getModule(id: string): Promise<import("../../shared/types.js").ModuleWithProgress | undefined>;
  updateModule(id: string, updates: Partial<Pick<import("../../shared/types.js").Module, "name" | "description" | "status" | "startDate" | "endDate" | "targetCompletionPercent">>): Promise<import("../../shared/types.js").Module>;
  deleteModule(id: string): Promise<boolean>;
  addTaskToModule(taskId: string, moduleId: string): Promise<import("../../shared/types.js").Task>;
  removeTaskFromModule(taskId: string): Promise<import("../../shared/types.js").Task>;
  listModuleTasks(moduleId: string): Promise<import("../../shared/types.js").Task[]>;
  // Task links methods (external URLs attached to tasks)
  addTaskLink(taskId: string, title: string, url: string, addedBy: string): Promise<import("../../shared/types.js").TaskLink>;
  listTaskLinks(taskId: string): Promise<import("../../shared/types.js").TaskLink[]>;
  deleteTaskLink(taskId: string, linkId: number): Promise<boolean>;
  close?(): void;
}
import {
  isValidTransition,
  buildFtsTrigramQuery,
  parseTags,
  rowToTask,
  rowToTemplate,
  rowToScheduledTask,
} from "./repos/db-helpers.js";
import { initializeTaskSchema } from "./repos/schema.js";
import { createPlanningRepo } from "./repos/planning-repo.js";
import { createSlaAnalyticsRepo } from "./repos/sla-analytics-repo.js";
import { createRelationsRepo } from "./repos/relations-repo.js";

function buildTaskSearchWhere(options: SearchOptions): { where: string; params: (string | number | null)[] } {
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
    const ftsQuery = buildFtsTrigramQuery(options.q);
    if (ftsQuery) {
      conditions.push("rowid IN (SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH ?)");
      params.push(ftsQuery);
    } else {
      conditions.push("(command_text LIKE ? OR result_summary LIKE ? OR description LIKE ?)");
      const pattern = `%${options.q}%`;
      params.push(pattern, pattern, pattern);
    }
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
  if (options.cycleId) {
    conditions.push("cycle_id = ?");
    params.push(options.cycleId);
  }
  if (options.moduleId) {
    conditions.push("module_id = ?");
    params.push(options.moduleId);
  }
  if (options.source) {
    conditions.push("source = ?");
    params.push(options.source);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export function createTaskStore(storagePath: string): TaskStore {
  // Ensure the directory exists
  mkdirSync(dirname(storagePath), { recursive: true });

  const db = new DatabaseSync(storagePath);

  // Initialize pragmas, versioned schema migrations, and FTS5 search index
  initializeTaskSchema(db);

  // Prepare statements
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, source, feishu_message_id, feishu_chat_id, feishu_user_id, command_text, status, priority, tags, attachments, assigned_device_id, due_date, reminder_at, description, created_at, updated_at, picked_at, started_at, completed_at, cycle_id, module_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  const planningRepo = createPlanningRepo(db);
  const slaAnalyticsRepo = createSlaAnalyticsRepo(db);
  const relationsRepo = createRelationsRepo(db);

  return {
    ...planningRepo,
    ...slaAnalyticsRepo,
    ...relationsRepo,

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
        task.cycleId ?? null,
        task.moduleId ?? null,
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
      const { where, params } = buildTaskSearchWhere(options);
      const effectiveLimit = Math.min(options.limit ?? 20, 100);
      const sql = `
        SELECT * FROM tasks ${where}
        ORDER BY created_at DESC
        LIMIT ?
      `;
      const rows = db.prepare(sql).all(...params, effectiveLimit) as Array<Record<string, unknown>>;
      return rows.map(rowToTask);
    },

    async searchAllTasksForExport(options: SearchOptions): Promise<Task[]> {
      const { where, params } = buildTaskSearchWhere(options);
      const sql = `SELECT * FROM tasks ${where} ORDER BY created_at DESC`;
      const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
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
        (row["cycle_id"] as string) ?? null, // cycle_id
        null, // module_id
      ));

      const cloned = selectTaskById.get(newId) as Record<string, unknown>;
      return rowToTask(cloned);
    },

    async reopenTask(taskId: string): Promise<Task> {
      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const currentStatus = row["status"] as TaskStatus;
      if (currentStatus !== "done" && currentStatus !== "failed") {
        throw new Error(
          `Can only reopen done or failed tasks, current status: ${currentStatus}`,
        );
      }

      const now = new Date().toISOString();
      const currentReopenCount = row["reopened_count"] as number ?? 0;

      // Reset to pending, clear processing timestamps and results, increment reopen count
      db.prepare(
        `UPDATE tasks SET status = 'pending', updated_at = ?, completed_at = NULL, picked_at = NULL, started_at = NULL, result_summary = NULL, result_details = NULL, reopened_count = ? WHERE id = ?`,
      ).run(now, currentReopenCount + 1, taskId);

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
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

    async setTaskPriority(taskId: string, priority: TaskPriority): Promise<Task> {
      const VALID_PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];
      if (!VALID_PRIORITIES.includes(priority)) {
        throw new Error(`Invalid priority: ${priority}. Must be one of: ${VALID_PRIORITIES.join(", ")}`);
      }

      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?`).run(
        priority,
        now,
        taskId,
      );

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async setTaskEstimatedMinutes(taskId: string, minutes: number | null): Promise<Task> {
      if (minutes !== null && (typeof minutes !== "number" || minutes < 0)) {
        throw new Error(`Invalid estimated minutes: ${minutes}. Must be a non-negative number or null`);
      }

      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE tasks SET estimated_minutes = ?, updated_at = ? WHERE id = ?`).run(
        minutes,
        now,
        taskId,
      );

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async setTaskCommandText(taskId: string, commandText: string): Promise<Task> {
      if (typeof commandText !== "string" || commandText.trim() === "") {
        throw new Error("commandText must be a non-empty string");
      }

      const row = selectTaskById.get(taskId) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE tasks SET command_text = ?, updated_at = ? WHERE id = ?`).run(
        commandText.trim(),
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

    async bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }> {
      const errors: string[] = [];
      let updated = 0;
      const now = new Date().toISOString();

      db.exec("BEGIN");
      try {
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
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { updated, errors };
    },

    async bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }> {
      const errors: string[] = [];
      let updated = 0;
      const now = new Date().toISOString();

      db.exec("BEGIN");
      try {
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
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { updated, errors };
    },

    async bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
      const errors: string[] = [];
      let deleted = 0;

      if (ids.length === 0) {
        return { deleted: 0, errors: [] };
      }

      // Process in batches of 50 to avoid SQL variable limit inside a transaction
      const batchSize = 50;
      db.exec("BEGIN");
      try {
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const placeholders = batch.map(() => "?").join(",");
          try {
            // First delete associated comments
            db.prepare(`DELETE FROM task_comments WHERE task_id IN (${placeholders})`).run(...batch);
            // Then delete the tasks (foreign_keys=ON cascades remaining child rows)
            const result = db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...batch);
            deleted += Number(result.changes);
          } catch (e) {
            errors.push(`Error deleting batch: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      return { deleted, errors };
    },

    async bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }> {
      const errors: string[] = [];
      let updated = 0;
      const now = new Date().toISOString();

      const updateTagsStmt = db.prepare(`UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?`);
      db.exec("BEGIN");
      try {
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
            updateTagsStmt.run(tagsJson, now, id);
            updated++;
          } catch (e) {
            errors.push(`Error adding tags to ${id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { updated, errors };
    },

    async bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }> {
      const errors: string[] = [];
      let updated = 0;
      const now = new Date().toISOString();

      const updateTagsStmt = db.prepare(`UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?`);
      db.exec("BEGIN");
      try {
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
            updateTagsStmt.run(tagsJson, now, id);
            updated++;
          } catch (e) {
            errors.push(`Error removing tag from ${id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { updated, errors };
    },

    async bulkUpdatePriority(ids: string[], priority: TaskPriority): Promise<{ updated: number; errors: string[] }> {
      const errors: string[] = [];
      let updated = 0;
      const now = new Date().toISOString();

      const updatePriorityStmt = db.prepare(`UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?`);
      db.exec("BEGIN");
      try {
        for (const id of ids) {
          try {
            const row = selectTaskById.get(id) as Record<string, unknown> | undefined;
            if (!row) {
              errors.push(`Task not found: ${id}`);
              continue;
            }
            updatePriorityStmt.run(priority, now, id);
            updated++;
          } catch (e) {
            errors.push(`Error updating priority for ${id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { updated, errors };
    },

    async bulkUpdateDueDate(ids: string[], dueDate: string | null): Promise<{ updated: number; errors: string[] }> {
      const errors: string[] = [];
      let updated = 0;
      const now = new Date().toISOString();

      // Validate date format if provided
      if (dueDate && isNaN(Date.parse(dueDate))) {
        throw new Error(`Invalid date format: ${dueDate}. Use ISO 8601.`);
      }

      const updateDueStmt = db.prepare(`UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?`);
      db.exec("BEGIN");
      try {
        for (const id of ids) {
          try {
            const row = selectTaskById.get(id) as Record<string, unknown> | undefined;
            if (!row) {
              errors.push(`Task not found: ${id}`);
              continue;
            }
            updateDueStmt.run(dueDate, now, id);
            updated++;
          } catch (e) {
            errors.push(`Error updating due date for ${id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { updated, errors };
    },

    async bulkCloneTasks(ids: string[]): Promise<{ cloned: number; errors: string[]; taskIds: string[] }> {
      const errors: string[] = [];
      let cloned = 0;
      const taskIds: string[] = [];
      const now = new Date().toISOString();

      db.exec("BEGIN");
      try {
        for (const id of ids) {
          try {
            const row = selectTaskById.get(id) as Record<string, unknown> | undefined;
            if (!row) {
              errors.push(`Task not found: ${id}`);
              continue;
            }

            const suffix = Math.random().toString(36).slice(2, 8);
            const newId = `task_${Date.now()}_${suffix}`;
            const originalMessageId = row["feishu_message_id"] as string;
            const clonedMessageId = `${originalMessageId}_clone_${Date.now()}_${suffix}`;

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
              (row["cycle_id"] as string) ?? null, // cycle_id
              null, // module_id
            ));

            taskIds.push(newId);
            cloned++;
          } catch (e) {
            errors.push(`Error cloning task ${id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { cloned, errors, taskIds };
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
            task.cycleId ?? null,
            task.moduleId ?? null,
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

    async getAllTasks(): Promise<Task[]> {
      const rows = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
      return rows.map(rowToTask);
    },


    // ── Task User Search ──────────────────────────────────────────

    async listTasksByUser(userId: string, limit?: number): Promise<Task[]> {
      const effectiveLimit = Math.min(limit ?? 20, 100);
      const rows = db.prepare(
        `SELECT * FROM tasks WHERE feishu_user_id = ? ORDER BY created_at DESC LIMIT ?`,
      ).all(userId, effectiveLimit) as Array<Record<string, unknown>>;
      return rows.map(rowToTask);
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

    close(): void {
      db.close();
    },
  };
}
