import type { Task, TaskStatus, TaskPriority, AuditLogEntry, AuditLogSearchOptions, Device, User, UserRole } from "../shared/types.js";
import type { TaskComment, TaskNote, TaskTemplate, ScheduledTask, ScheduleFrequency } from "../shared/types.js";
import type { SlaPolicy, SlaBreachLog, SlaSummary } from "../shared/types.js";
import type { WebhookSubscription, WebhookDelivery } from "../shared/types.js";
import type { TaskWatcher } from "../shared/types.js";

export interface TaskApiClient {
  listTasks(status?: TaskStatus, limit?: number, deviceId?: string, priority?: string): Promise<Task[]>;
  searchTasks(options: {
    q?: string;
    status?: TaskStatus;
    priority?: string;
    from?: string;
    to?: string;
    limit?: number;
    deviceId?: string;
    tags?: string[];
  }): Promise<Task[]>;
  getTask(taskId: string): Promise<Task>;
  markTaskRunning(taskId: string): Promise<Task>;
  reportTaskResult(
    taskId: string,
    success: boolean,
    summary: string,
    details?: string,
  ): Promise<Task>;
  replyFeishu(taskId: string, message: string): Promise<void>;
  registerDevice(name: string, capabilities?: string): Promise<{ id: string; token: string }>;
  queryAuditLog(options: AuditLogSearchOptions): Promise<AuditLogEntry[]>;
  addTags(taskId: string, tags: string[]): Promise<Task>;
  removeTag(taskId: string, tag: string): Promise<Task>;
  listAllTags(): Promise<string[]>;
  setDueDate(taskId: string, dueDate: string | null): Promise<Task>;
  setReminder(taskId: string, reminderAt: string | null): Promise<Task>;
  setTaskDescription(taskId: string, description: string | null): Promise<Task>;
  setPriority(taskId: string, priority: TaskPriority): Promise<Task>;
  setEstimatedMinutes(taskId: string, minutes: number | null): Promise<Task>;
  listOverdueTasks(): Promise<Task[]>;
  listComments(taskId: string): Promise<TaskComment[]>;
  addComment(taskId: string, author: string, body: string): Promise<TaskComment>;
  deleteTaskComment(taskId: string, commentId: number): Promise<void>;
  bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }>;
  bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }>;
  assignTask(taskId: string, deviceId: string): Promise<Task>;
  unassignTask(taskId: string): Promise<Task>;
  bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }>;
  bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }>;
  bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }>;
  bulkUpdatePriority(ids: string[], priority: string): Promise<{ updated: number; errors: string[] }>;
  // Template methods
  listTemplates(): Promise<TaskTemplate[]>;
  getTemplate(templateId: string): Promise<TaskTemplate>;
  createTemplate(template: { name: string; description?: string; commandText: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDateOffsetMs?: number; reminderOffsetMs?: number }): Promise<TaskTemplate>;
  updateTemplate(templateId: string, updates: Record<string, unknown>): Promise<TaskTemplate>;
  deleteTemplate(templateId: string): Promise<void>;
  createTaskFromTemplate(templateId: string, overrides?: { commandText?: string; description?: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDate?: string; reminderAt?: string }): Promise<Task>;
  getTemplateUsageStats(): Promise<{ stats: { templateId: string; name: string; usageCount: number }[]; totalUsage: number; templateCount: number }>;
  // Scheduled task methods
  listScheduledTasks(): Promise<ScheduledTask[]>;
  getScheduledTask(scheduledId: string): Promise<ScheduledTask>;
  createScheduledTask(data: { commandText: string; frequency: ScheduleFrequency; priority?: string; tags?: string[]; assignedDeviceId?: string; nextRunAt?: string; enabled?: boolean; templateId?: string }): Promise<ScheduledTask>;
  updateScheduledTask(scheduledId: string, updates: Record<string, unknown>): Promise<ScheduledTask>;
  deleteScheduledTask(scheduledId: string): Promise<void>;
  runScheduledTask(scheduledId: string): Promise<{ task: Task; scheduledTask: ScheduledTask }>;
  // Task dependency methods
  setDependencies(taskId: string, dependsOnIds: string[]): Promise<Task>;
  getDependencies(taskId: string): Promise<{ dependencies: Array<{ id: string; status: string; commandText: string }>; dependentIds: string[]; blocked: boolean }>;
  removeDependency(taskId: string, depId: string): Promise<Task>;
  listReadyTasks(limit?: number, deviceId?: string): Promise<Task[]>;
  getDependencyGraph(taskId: string): Promise<import("../shared/types.js").DependencyGraph>;
  // Task relationship methods (Phase 58)
  addRelationship(taskId: string, relatedTaskId: string, relationshipType: import("../shared/types.js").TaskRelationshipType): Promise<void>;
  removeRelationship(taskId: string, relatedTaskId: string, relationshipType?: import("../shared/types.js").TaskRelationshipType): Promise<void>;
  listRelationships(taskId: string): Promise<import("../shared/types.js").TaskRelationship[]>;
  // Task lock methods
  lockTask(taskId: string, deviceId?: string, ttlMs?: number): Promise<import("../shared/types.js").TaskLock>;
  unlockTask(taskId: string, deviceId?: string): Promise<void>;
  getTaskLock(taskId: string): Promise<{ locked: boolean; lock: import("../shared/types.js").TaskLock | null }>;
  // Export/Import methods
  exportTasks(): Promise<Record<string, unknown>>;
  importTasks(data: Record<string, unknown>, mode?: string): Promise<{ imported: number; skipped: number; errors: string[] }>;
  importTasksFromCsv(csv: string, options?: { columnMap?: Record<string, string>; defaultPriority?: string; defaultTags?: string[]; delimiter?: string }): Promise<{ imported: number; errors: string[]; taskIds: string[] }>;
  // SLA methods
  listSlaPolicies(): Promise<SlaPolicy[]>;
  getSlaPolicy(policyId: string): Promise<SlaPolicy>;
  createSlaPolicy(policy: { name: string; description?: string; targetMinutes: number; warningThresholdPercent?: number; matchPriorities?: string[]; matchTags?: string[]; enabled?: boolean }): Promise<SlaPolicy>;
  updateSlaPolicy(policyId: string, updates: Record<string, unknown>): Promise<SlaPolicy>;
  deleteSlaPolicy(policyId: string): Promise<void>;
  getSlaSummary(): Promise<SlaSummary>;
  listSlaBreaches(): Promise<SlaBreachLog[]>;
  checkSlaBreaches(): Promise<{ warnings: number; breaches: number; details: import("../shared/types.js").SlaBreachNotification[] }>;
  getTaskSlaStatus(taskId: string): Promise<{ status: string; policy?: SlaPolicy; elapsedMinutes: number; targetMinutes?: number }>;
  // Task retry
  retryTask(taskId: string): Promise<Task>;
  // Task clone
  cloneTask(taskId: string): Promise<Task>;
  // Task pinning
  pinTask(taskId: string): Promise<Task>;
  unpinTask(taskId: string): Promise<Task>;
  // Task forwarding
  forwardTask(taskId: string, targetDeviceId: string, message?: string): Promise<Task>;
  // Task notes (internal annotations)
  listNotes(taskId: string): Promise<TaskNote[]>;
  addNote(taskId: string, body: string): Promise<TaskNote>;
  deleteTaskNote(taskId: string, noteId: number): Promise<void>;
  // Task user search
  listTasksByUser(userId: string, limit?: number): Promise<Task[]>;
  // Task subtask methods
  listSubtasks(taskId: string): Promise<import("../shared/types.js").Subtask[]>;
  getSubtask(taskId: string, subtaskId: string): Promise<import("../shared/types.js").Subtask>;
  createSubtask(taskId: string, title: string, commandText: string): Promise<import("../shared/types.js").Subtask>;
  updateSubtaskStatus(taskId: string, subtaskId: string, status: TaskStatus): Promise<import("../shared/types.js").Subtask>;
  reportSubtaskResult(taskId: string, subtaskId: string, success: boolean, summary: string, details?: string): Promise<import("../shared/types.js").Subtask>;
  deleteSubtask(taskId: string, subtaskId: string): Promise<void>;
  // Task attachment download
  downloadAttachment(taskId: string, attachmentIndex: number): Promise<{ fileName: string; contentType: string; base64Data: string }>;
  // Task archive (soft-delete)
  archiveTask(taskId: string): Promise<Task>;
  unarchiveTask(taskId: string): Promise<Task>;
  listArchivedTasks(limit?: number): Promise<Task[]>;
  bulkArchiveTasks(ids: string[]): Promise<{ archived: number; errors: string[] }>;
  bulkUnarchiveTasks(ids: string[]): Promise<{ restored: number; errors: string[] }>;
  // Priority auto-escalation
  escalateOverduePriorities(): Promise<{ escalated: number; tasks: Task[] }>;
  // Kanban board
  getKanbanBoard(limit?: number, deviceId?: string): Promise<import("../shared/types.js").KanbanBoard>;
  // API usage analytics
  getApiUsageStats(from?: string, to?: string): Promise<Record<string, unknown>>;
  // Webhook methods
  listWebhooks(): Promise<WebhookSubscription[]>;
  getWebhook(webhookId: string): Promise<WebhookSubscription>;
  createWebhook(data: { url: string; events: string[]; enabled?: boolean; description?: string }): Promise<WebhookSubscription>;
  updateWebhook(webhookId: string, updates: { url?: string; events?: string[]; enabled?: boolean; description?: string }): Promise<WebhookSubscription>;
  deleteWebhook(webhookId: string): Promise<void>;
  listWebhookDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]>;
  // Device management methods
  listDevices(): Promise<Device[]>;
  getDevice(deviceId: string): Promise<Device>;
  deleteDevice(deviceId: string): Promise<void>;
  // Stats & analytics methods
  getProcessingStats(): Promise<Record<string, unknown>>;
  getTaskStatsSummary(): Promise<Record<string, unknown>>;
  getUserStats(): Promise<Record<string, unknown>>;
  getTaskTimeSeries(from?: string, to?: string, interval?: string, metric?: string): Promise<Record<string, unknown>>;
  // User management methods
  listUsers(): Promise<User[]>;
  getUser(userId: string): Promise<User>;
  createUser(username: string, role?: UserRole, feishuUserId?: string): Promise<User>;
  updateUserRole(userId: string, role: UserRole): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  regenerateUserToken(userId: string): Promise<User>;
  // API key management methods
  listApiKeys(userId?: string): Promise<Array<Record<string, unknown>>>;
  getApiKey(keyId: string): Promise<Record<string, unknown>>;
  createApiKey(name: string, userId: string, role?: string): Promise<Record<string, unknown>>;
  rotateApiKey(keyId: string, gracePeriodMs?: number): Promise<Record<string, unknown>>;
  revokeApiKey(keyId: string): Promise<void>;
  enableApiKey(keyId: string): Promise<Record<string, unknown>>;
  disableApiKey(keyId: string): Promise<Record<string, unknown>>;
  cleanupExpiredApiKeys(): Promise<{ cleaned: number }>;
  // Saved views methods
  listSavedViews(createdBy?: string): Promise<import("../shared/types.js").SavedView[]>;
  getSavedView(viewId: string): Promise<import("../shared/types.js").SavedView>;
  createSavedView(name: string, filters: Record<string, unknown>): Promise<import("../shared/types.js").SavedView>;
  updateSavedView(viewId: string, updates: { name?: string; filters?: Record<string, unknown> }): Promise<import("../shared/types.js").SavedView>;
  deleteSavedView(viewId: string): Promise<void>;
  applySavedView(viewId: string): Promise<Task[]>;
  // Maintenance methods
  resetStaleTasks(timeoutMs?: number): Promise<{ resetCount: number }>;
  cleanupProcessedEvents(retentionDays?: number): Promise<{ deletedCount: number }>;
  // Task watcher methods
  watchTask(taskId: string): Promise<TaskWatcher>;
  unwatchTask(taskId: string): Promise<{ removed: boolean }>;
  listTaskWatchers(taskId: string): Promise<TaskWatcher[]>;
  // Time entry methods
  listTimeEntries(taskId: string): Promise<import("../shared/types.js").TimeEntry[]>;
  createTimeEntry(taskId: string, opts: { startedAt?: string; endedAt?: string; durationMinutes?: number; description?: string; loggedBy?: string }): Promise<import("../shared/types.js").TimeEntry>;
  startTimeEntry(taskId: string, description?: string): Promise<import("../shared/types.js").TimeEntry>;
  stopTimeEntry(taskId: string, entryId: string): Promise<import("../shared/types.js").TimeEntry>;
  deleteTimeEntry(taskId: string, entryId: string): Promise<void>;
  getTimeTrackingStats(): Promise<import("../shared/types.js").TimeTrackingSummary>;
  // Task activity feed
  getActivityFeed(taskId: string, limit?: number): Promise<import("../shared/types.js").ActivityFeedItem[]>;
  // Cycle (sprint) methods
  listCycles(status?: import("../shared/types.js").CycleStatus): Promise<import("../shared/types.js").CycleSummary[]>;
  getCycle(cycleId: string): Promise<import("../shared/types.js").CycleSummary>;
  createCycle(data: { name: string; description?: string; startDate: string; endDate: string }): Promise<import("../shared/types.js").Cycle>;
  updateCycle(cycleId: string, updates: Record<string, unknown>): Promise<import("../shared/types.js").Cycle>;
  deleteCycle(cycleId: string): Promise<void>;
  addTaskToCycle(taskId: string, cycleId: string): Promise<import("../shared/types.js").Task>;
  removeTaskFromCycle(taskId: string): Promise<import("../shared/types.js").Task>;
  listCycleTasks(cycleId: string): Promise<import("../shared/types.js").Task[]>;
  // Audit management methods
  getAuditCount(): Promise<number>;
  cleanupAuditLog(retentionDays?: number): Promise<{ deletedCount: number }>;
  // Feishu card update
  updateTaskCard(taskId: string, markdown: string, title?: string, color?: string): Promise<{ success: boolean; messageId: string }>;
}

export function createTaskApiClient(
  serverBaseUrl: string,
  personalToken: string,
  deviceId?: string,
): TaskApiClient {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${personalToken}`,
  };

  return {
    async listTasks(status?: TaskStatus, limit?: number, filterDeviceId?: string, priority?: string): Promise<Task[]> {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (limit) params.set("limit", String(limit));
      if (priority) params.set("priority", priority);
      // Use the explicitly passed deviceId, or fall back to the configured one
      const effectiveDeviceId = filterDeviceId ?? deviceId;
      if (effectiveDeviceId) params.set("deviceId", effectiveDeviceId);

      const url = `${serverBaseUrl}/api/tasks${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to list tasks: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { tasks: Task[] };
      return data.tasks;
    },

    async searchTasks(options: {
      q?: string;
      status?: TaskStatus;
      priority?: string;
      from?: string;
      to?: string;
      limit?: number;
      deviceId?: string;
      tags?: string[];
    }): Promise<Task[]> {
      const params = new URLSearchParams();
      if (options.q) params.set("q", options.q);
      if (options.status) params.set("status", options.status);
      if (options.priority) params.set("priority", options.priority);
      if (options.from) params.set("from", options.from);
      if (options.to) params.set("to", options.to);
      if (options.limit) params.set("limit", String(options.limit));
      const effectiveDeviceId = options.deviceId ?? deviceId;
      if (effectiveDeviceId) params.set("deviceId", effectiveDeviceId);
      if (options.tags && options.tags.length > 0) {
        params.set("tags", options.tags.join(","));
      }

      const qs = params.toString();
      const url = `${serverBaseUrl}/api/tasks/search${qs ? `?${qs}` : ""}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to search tasks: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { tasks: Task[] };
      return data.tasks;
    },

    async getTask(taskId: string): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}`,
        { headers },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get task: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async markTaskRunning(taskId: string): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/status`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ status: "running" }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to mark task running: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async reportTaskResult(
      taskId: string,
      success: boolean,
      summary: string,
      details?: string,
    ): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/result`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ success, summary, details }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to report task result: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async replyFeishu(taskId: string, message: string): Promise<void> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/reply`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ message }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to reply to Feishu: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
    },

    async registerDevice(name: string, capabilities?: string): Promise<{ id: string; token: string }> {
      const response = await fetch(
        `${serverBaseUrl}/api/devices`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ name, capabilities }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to register device: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { device: { id: string; token: string } };
      return { id: data.device.id, token: data.device.token };
    },

    async listDevices(): Promise<Device[]> {
      const response = await fetch(
        `${serverBaseUrl}/api/devices`,
        { method: "GET", headers },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to list devices: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { devices: Device[] };
      return data.devices;
    },

    async getDevice(deviceId: string): Promise<Device> {
      const response = await fetch(
        `${serverBaseUrl}/api/devices/${encodeURIComponent(deviceId)}`,
        { method: "GET", headers },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get device: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { device: Device };
      return data.device;
    },

    async deleteDevice(deviceId: string): Promise<void> {
      const response = await fetch(
        `${serverBaseUrl}/api/devices/${encodeURIComponent(deviceId)}`,
        { method: "DELETE", headers },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to delete device: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
    },

    async queryAuditLog(options: AuditLogSearchOptions): Promise<AuditLogEntry[]> {
      const params = new URLSearchParams();
      if (options.action) params.set("action", options.action);
      if (options.taskId) params.set("taskId", options.taskId);
      if (options.actor) params.set("actor", options.actor);
      if (options.actorType) params.set("actorType", options.actorType);
      if (options.from) params.set("from", options.from);
      if (options.to) params.set("to", options.to);
      if (options.limit) params.set("limit", String(options.limit));

      const qs = params.toString();
      const url = `${serverBaseUrl}/api/audit${qs ? `?${qs}` : ""}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to query audit log: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { entries: AuditLogEntry[] };
      return data.entries;
    },

    async addTags(taskId: string, tags: string[]): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/tags`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ tags }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to add tags: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async removeTag(taskId: string, tag: string): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/tags/${encodeURIComponent(tag)}`,
        {
          method: "DELETE",
          headers,
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to remove tag: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async listAllTags(): Promise<string[]> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/tags`,
        { headers },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to list tags: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { tags: string[] };
      return data.tags;
    },

    async setDueDate(taskId: string, dueDate: string | null): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/due`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ dueDate }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to set due date: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async setReminder(taskId: string, reminderAt: string | null): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/reminder`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ reminderAt }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to set reminder: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async setTaskDescription(taskId: string, description: string | null): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/description`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ description }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to set description: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async setPriority(taskId: string, priority: TaskPriority): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/priority`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ priority }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to set priority: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async setEstimatedMinutes(taskId: string, minutes: number | null): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/estimated-minutes`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ estimatedMinutes: minutes }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to set estimated minutes: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async listOverdueTasks(): Promise<Task[]> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/overdue`,
        { headers },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to list overdue tasks: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { tasks: Task[] };
      return data.tasks;
    },

    async listComments(taskId: string): Promise<TaskComment[]> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/comments`,
        { headers },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to list comments: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { comments: TaskComment[] };
      return data.comments;
    },

    async addComment(taskId: string, _author: string, commentBody: string): Promise<TaskComment> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/comments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ body: commentBody }),
        },
      );

      if (!response.ok) {
        const errBody = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to add comment: ${response.status} ${errBody.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { comment: TaskComment };
      return data.comment;
    },

    async deleteTaskComment(taskId: string, commentId: number): Promise<void> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/comments/${commentId}`,
        {
          method: "DELETE",
          headers,
        },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to delete comment: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/bulk/status`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ids, status }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to bulk update status: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { updated: number; errors: string[] };
      return { updated: data.updated, errors: data.errors };
    },

    async bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/bulk/assign`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ids, deviceId }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to bulk assign: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { updated: number; errors: string[] };
      return { updated: data.updated, errors: data.errors };
    },

    async assignTask(taskId: string, deviceId: string): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/assign`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ deviceId }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to assign task: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async unassignTask(taskId: string): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/unassign`,
        {
          method: "POST",
          headers,
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to unassign task: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/bulk/delete`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ids }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to bulk delete: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { deleted: number; errors: string[] };
      return { deleted: data.deleted, errors: data.errors };
    },

    async bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/bulk/tags/add`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ids, tags }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to bulk add tags: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { updated: number; errors: string[] };
      return { updated: data.updated, errors: data.errors };
    },

    async bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/bulk/tags/remove`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ids, tag }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to bulk remove tag: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { updated: number; errors: string[] };
      return { updated: data.updated, errors: data.errors };
    },

    async bulkUpdatePriority(ids: string[], priority: string): Promise<{ updated: number; errors: string[] }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/bulk/priority`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ids, priority }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to bulk update priority: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as { updated: number; errors: string[] };
      return { updated: data.updated, errors: data.errors };
    },

    // ── Task Templates ──────────────────────────────────────────────

    async listTemplates(): Promise<TaskTemplate[]> {
      const response = await fetch(`${serverBaseUrl}/api/templates`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list templates: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { templates: TaskTemplate[] };
      return data.templates;
    },

    async getTemplate(templateId: string): Promise<TaskTemplate> {
      const response = await fetch(`${serverBaseUrl}/api/templates/${templateId}`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get template: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { template: TaskTemplate };
      return data.template;
    },

    async createTemplate(template: { name: string; description?: string; commandText: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDateOffsetMs?: number; reminderOffsetMs?: number }): Promise<TaskTemplate> {
      const response = await fetch(`${serverBaseUrl}/api/templates`, {
        method: "POST",
        headers,
        body: JSON.stringify(template),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to create template: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { template: TaskTemplate };
      return data.template;
    },

    async updateTemplate(templateId: string, updates: Record<string, unknown>): Promise<TaskTemplate> {
      const response = await fetch(`${serverBaseUrl}/api/templates/${templateId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to update template: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { template: TaskTemplate };
      return data.template;
    },

    async deleteTemplate(templateId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/templates/${templateId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to delete template: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async createTaskFromTemplate(templateId: string, overrides?: { commandText?: string; description?: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDate?: string; reminderAt?: string }): Promise<Task> {
      const response = await fetch(`${serverBaseUrl}/api/templates/${templateId}/create-task`, {
        method: "POST",
        headers,
        body: JSON.stringify(overrides ?? {}),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to create task from template: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async getTemplateUsageStats(): Promise<{ stats: { templateId: string; name: string; usageCount: number }[]; totalUsage: number; templateCount: number }> {
      const response = await fetch(`${serverBaseUrl}/api/templates/usage-stats`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get template usage stats: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as { stats: { templateId: string; name: string; usageCount: number }[]; totalUsage: number; templateCount: number };
    },

    // ── Scheduled Tasks ──────────────────────────────────────────────

    async listScheduledTasks(): Promise<ScheduledTask[]> {
      const response = await fetch(`${serverBaseUrl}/api/scheduled-tasks`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list scheduled tasks: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { scheduledTasks: ScheduledTask[] };
      return data.scheduledTasks;
    },

    async getScheduledTask(scheduledId: string): Promise<ScheduledTask> {
      const response = await fetch(`${serverBaseUrl}/api/scheduled-tasks/${scheduledId}`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get scheduled task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { scheduledTask: ScheduledTask };
      return data.scheduledTask;
    },

    async createScheduledTask(data: { commandText: string; frequency: ScheduleFrequency; priority?: string; tags?: string[]; assignedDeviceId?: string; nextRunAt?: string; enabled?: boolean; templateId?: string }): Promise<ScheduledTask> {
      const response = await fetch(`${serverBaseUrl}/api/scheduled-tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to create scheduled task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const result = (await response.json()) as { scheduledTask: ScheduledTask };
      return result.scheduledTask;
    },

    async updateScheduledTask(scheduledId: string, updates: Record<string, unknown>): Promise<ScheduledTask> {
      const response = await fetch(`${serverBaseUrl}/api/scheduled-tasks/${scheduledId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to update scheduled task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const result = (await response.json()) as { scheduledTask: ScheduledTask };
      return result.scheduledTask;
    },

    async deleteScheduledTask(scheduledId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/scheduled-tasks/${scheduledId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to delete scheduled task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async runScheduledTask(scheduledId: string): Promise<{ task: Task; scheduledTask: ScheduledTask }> {
      const response = await fetch(`${serverBaseUrl}/api/scheduled-tasks/${scheduledId}/run`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to run scheduled task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: Task; scheduledTask: ScheduledTask };
      return { task: data.task, scheduledTask: data.scheduledTask };
    },

    // ── Task Dependencies ──────────────────────────────────────────────

    async setDependencies(taskId: string, dependsOnIds: string[]): Promise<Task> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/dependencies`, {
        method: "POST",
        headers,
        body: JSON.stringify({ dependsOn: dependsOnIds }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to set dependencies: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async getDependencies(taskId: string): Promise<{ dependencies: Array<{ id: string; status: string; commandText: string }>; dependentIds: string[]; blocked: boolean }> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/dependencies`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get dependencies: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { dependencies: Array<{ id: string; status: string; commandText: string }>; dependentIds: string[]; blocked: boolean };
      return data;
    },

    async removeDependency(taskId: string, depId: string): Promise<Task> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/dependencies/${depId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to remove dependency: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async listReadyTasks(limit?: number, filterDeviceId?: string): Promise<Task[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const effectiveDeviceId = filterDeviceId ?? deviceId;
      if (effectiveDeviceId) params.set("deviceId", effectiveDeviceId);

      const url = `${serverBaseUrl}/api/tasks/ready${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list ready tasks: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { tasks: Task[] };
      return data.tasks;
    },

    async getDependencyGraph(taskId: string): Promise<import("../shared/types.js").DependencyGraph> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/dependency-graph`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get dependency graph: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { graph: import("../shared/types.js").DependencyGraph };
      return data.graph;
    },

    // ── Task Relationships (Phase 58) ─────────────────────────

    async addRelationship(taskId: string, relatedTaskId: string, relationshipType: import("../shared/types.js").TaskRelationshipType): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/relationships`, {
        method: "POST",
        headers,
        body: JSON.stringify({ relatedTaskId, relationshipType }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to add relationship: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async removeRelationship(taskId: string, relatedTaskId: string, relationshipType?: import("../shared/types.js").TaskRelationshipType): Promise<void> {
      const params = relationshipType ? `?type=${relationshipType}` : "";
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/relationships/${relatedTaskId}${params}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to remove relationship: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async listRelationships(taskId: string): Promise<import("../shared/types.js").TaskRelationship[]> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/relationships`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list relationships: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { relationships: import("../shared/types.js").TaskRelationship[] };
      return data.relationships;
    },

    // ── Task Locks ──────────────────────────────────────────────

    async lockTask(taskId: string, deviceId?: string, ttlMs?: number): Promise<import("../shared/types.js").TaskLock> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/lock`, {
        method: "POST",
        headers,
        body: JSON.stringify({ deviceId, ttlMs }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to lock task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { lock: import("../shared/types.js").TaskLock };
      return data.lock;
    },

    async unlockTask(taskId: string, deviceId?: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/lock`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ deviceId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to unlock task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async getTaskLock(taskId: string): Promise<{ locked: boolean; lock: import("../shared/types.js").TaskLock | null }> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/lock`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get task lock: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { locked: boolean; lock: import("../shared/types.js").TaskLock | null };
      return data;
    },

    // ── Export/Import ──────────────────────────────────────────────

    async exportTasks(): Promise<Record<string, unknown>> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/export`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to export tasks: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as Record<string, unknown>;
    },

    async importTasks(data: Record<string, unknown>, mode?: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
      const payload = { ...data };
      if (mode) payload.mode = mode;
      const response = await fetch(`${serverBaseUrl}/api/tasks/import`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to import tasks: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const result = (await response.json()) as { imported: number; skipped: number; errors: string[] };
      return { imported: result.imported, skipped: result.skipped, errors: result.errors };
    },

    async importTasksFromCsv(csv: string, options?: { columnMap?: Record<string, string>; defaultPriority?: string; defaultTags?: string[]; delimiter?: string }): Promise<{ imported: number; errors: string[]; taskIds: string[] }> {
      const payload: Record<string, unknown> = { csv };
      if (options?.columnMap) payload.columnMap = options.columnMap;
      if (options?.defaultPriority) payload.defaultPriority = options.defaultPriority;
      if (options?.defaultTags) payload.defaultTags = options.defaultTags;
      if (options?.delimiter) payload.delimiter = options.delimiter;
      const response = await fetch(`${serverBaseUrl}/api/tasks/import-csv`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to import CSV: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const result = (await response.json()) as { imported: number; errors: string[]; taskIds: string[] };
      return { imported: result.imported, errors: result.errors, taskIds: result.taskIds };
    },

    // ── SLA Methods ──────────────────────────────────────────────

    async listSlaPolicies(): Promise<SlaPolicy[]> {
      const response = await fetch(`${serverBaseUrl}/api/sla/policies`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list SLA policies: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { policies: SlaPolicy[] };
      return data.policies;
    },

    async getSlaPolicy(policyId: string): Promise<SlaPolicy> {
      const response = await fetch(`${serverBaseUrl}/api/sla/policies/${policyId}`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get SLA policy: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { policy: SlaPolicy };
      return data.policy;
    },

    async createSlaPolicy(policy: { name: string; description?: string; targetMinutes: number; warningThresholdPercent?: number; matchPriorities?: string[]; matchTags?: string[]; enabled?: boolean }): Promise<SlaPolicy> {
      const response = await fetch(`${serverBaseUrl}/api/sla/policies`, {
        method: "POST",
        headers,
        body: JSON.stringify(policy),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to create SLA policy: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { policy: SlaPolicy };
      return data.policy;
    },

    async updateSlaPolicy(policyId: string, updates: Record<string, unknown>): Promise<SlaPolicy> {
      const response = await fetch(`${serverBaseUrl}/api/sla/policies/${policyId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to update SLA policy: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { policy: SlaPolicy };
      return data.policy;
    },

    async deleteSlaPolicy(policyId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/sla/policies/${policyId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to delete SLA policy: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async getSlaSummary(): Promise<SlaSummary> {
      const response = await fetch(`${serverBaseUrl}/api/sla/summary`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get SLA summary: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as SlaSummary;
    },

    async listSlaBreaches(): Promise<SlaBreachLog[]> {
      const response = await fetch(`${serverBaseUrl}/api/sla/breaches`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list SLA breaches: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { breaches: SlaBreachLog[] };
      return data.breaches;
    },

    async checkSlaBreaches(): Promise<{ warnings: number; breaches: number; details: import("../shared/types.js").SlaBreachNotification[] }> {
      const response = await fetch(`${serverBaseUrl}/api/sla/check`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to check SLA breaches: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { warnings: number; breaches: number; details?: import("../shared/types.js").SlaBreachNotification[] };
      return { warnings: data.warnings, breaches: data.breaches, details: data.details ?? [] };
    },

    async getTaskSlaStatus(taskId: string): Promise<{ status: string; policy?: SlaPolicy; elapsedMinutes: number; targetMinutes?: number }> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/sla`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get task SLA status: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as { status: string; policy?: SlaPolicy; elapsedMinutes: number; targetMinutes?: number };
    },

    async retryTask(taskId: string): Promise<Task> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/retry`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to retry task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async cloneTask(taskId: string): Promise<Task> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/clone`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to clone task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async pinTask(taskId: string): Promise<Task> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/pin`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to pin task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async unpinTask(taskId: string): Promise<Task> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/unpin`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to unpin task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async forwardTask(taskId: string, targetDeviceId: string, message?: string): Promise<Task> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/forward`, {
        method: "POST",
        headers,
        body: JSON.stringify({ deviceId: targetDeviceId, message }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to forward task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    // ── Task Notes (internal annotations) ──────────────────────────

    async listNotes(taskId: string): Promise<TaskNote[]> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/notes`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list notes: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { notes: TaskNote[] };
      return data.notes;
    },

    async addNote(taskId: string, noteBody: string): Promise<TaskNote> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ body: noteBody }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to add note: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { note: TaskNote };
      return data.note;
    },

    async deleteTaskNote(taskId: string, noteId: number): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/notes/${noteId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to delete note: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    // ── Task User Search ──────────────────────────────────────────

    async listTasksByUser(userId: string, limit?: number): Promise<Task[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const url = `${serverBaseUrl}/api/tasks/user/${encodeURIComponent(userId)}${qs ? `?${qs}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list tasks by user: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { tasks: Task[] };
      return data.tasks;
    },

    // ── Task Subtasks ──────────────────────────────────────────

    async listSubtasks(taskId: string): Promise<import("../shared/types.js").Subtask[]> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/subtasks`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list subtasks: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { subtasks: import("../shared/types.js").Subtask[] };
      return data.subtasks;
    },

    async getSubtask(taskId: string, subtaskId: string): Promise<import("../shared/types.js").Subtask> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/subtasks/${subtaskId}`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get subtask: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { subtask: import("../shared/types.js").Subtask };
      return data.subtask;
    },

    async createSubtask(taskId: string, title: string, commandText: string): Promise<import("../shared/types.js").Subtask> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/subtasks`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title, commandText }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to create subtask: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { subtask: import("../shared/types.js").Subtask };
      return data.subtask;
    },

    async updateSubtaskStatus(taskId: string, subtaskId: string, status: TaskStatus): Promise<import("../shared/types.js").Subtask> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/subtasks/${subtaskId}/status`, {
        method: "POST",
        headers,
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to update subtask status: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { subtask: import("../shared/types.js").Subtask };
      return data.subtask;
    },

    async reportSubtaskResult(taskId: string, subtaskId: string, success: boolean, summary: string, details?: string): Promise<import("../shared/types.js").Subtask> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/subtasks/${subtaskId}/result`, {
        method: "POST",
        headers,
        body: JSON.stringify({ success, summary, details }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to report subtask result: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { subtask: import("../shared/types.js").Subtask };
      return data.subtask;
    },

    async deleteSubtask(taskId: string, subtaskId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to delete subtask: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async downloadAttachment(taskId: string, attachmentIndex: number): Promise<{ fileName: string; contentType: string; base64Data: string }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/attachments/${attachmentIndex}`,
        { headers },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to download attachment: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }

      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const arrayBuffer = await response.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");

      // Extract filename from Content-Disposition header
      let fileName = `attachment_${attachmentIndex}`;
      const match = contentDisposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
      if (match) {
        fileName = decodeURIComponent(match[1].replace(/"/g, ""));
      }

      return { fileName, contentType, base64Data };
    },

    async archiveTask(taskId: string): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/archive`,
        { method: "POST", headers },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to archive task: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async unarchiveTask(taskId: string): Promise<Task> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/${taskId}/unarchive`,
        { method: "POST", headers },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to unarchive task: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { task: Task };
      return data.task;
    },

    async listArchivedTasks(limit?: number): Promise<Task[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const url = `${serverBaseUrl}/api/tasks/archived${qs ? `?${qs}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to list archived tasks: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { tasks: Task[] };
      return data.tasks;
    },

    async bulkArchiveTasks(ids: string[]): Promise<{ archived: number; errors: string[] }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/bulk/archive`,
        { method: "POST", headers, body: JSON.stringify({ ids }) },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to bulk archive: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { archived: number; errors: string[] };
      return data;
    },

    async bulkUnarchiveTasks(ids: string[]): Promise<{ restored: number; errors: string[] }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/bulk/unarchive`,
        { method: "POST", headers, body: JSON.stringify({ ids }) },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to bulk unarchive: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { restored: number; errors: string[] };
      return data;
    },

    async escalateOverduePriorities(): Promise<{ escalated: number; tasks: Task[] }> {
      const response = await fetch(
        `${serverBaseUrl}/api/tasks/escalate-priorities`,
        { method: "POST", headers },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to escalate priorities: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { escalated: number; tasks: Task[] };
      return { escalated: data.escalated, tasks: data.tasks };
    },

    // ── Kanban Board ──────────────────────────────────────────────

    async getKanbanBoard(limit?: number, deviceId?: string): Promise<import("../shared/types.js").KanbanBoard> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (deviceId) params.set("deviceId", deviceId);
      const qs = params.toString();
      const url = `${serverBaseUrl}/api/tasks/kanban${qs ? `?${qs}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get kanban board: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      return (await response.json()) as import("../shared/types.js").KanbanBoard;
    },

    async getApiUsageStats(from?: string, to?: string): Promise<Record<string, unknown>> {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const url = `${serverBaseUrl}/api/usage/stats${qs ? `?${qs}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get API usage stats: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      return (await response.json()) as Record<string, unknown>;
    },

    async listWebhooks(): Promise<WebhookSubscription[]> {
      const response = await fetch(`${serverBaseUrl}/api/webhooks`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to list webhooks: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { webhooks: WebhookSubscription[] };
      return data.webhooks;
    },

    async getWebhook(webhookId: string): Promise<WebhookSubscription> {
      const response = await fetch(`${serverBaseUrl}/api/webhooks/${webhookId}`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get webhook: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { webhook: WebhookSubscription };
      return data.webhook;
    },

    async createWebhook(data: { url: string; events: string[]; enabled?: boolean; description?: string }): Promise<WebhookSubscription> {
      const response = await fetch(`${serverBaseUrl}/api/webhooks`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to create webhook: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const result = (await response.json()) as { webhook: WebhookSubscription };
      return result.webhook;
    },

    async updateWebhook(webhookId: string, updates: { url?: string; events?: string[]; enabled?: boolean; description?: string }): Promise<WebhookSubscription> {
      const response = await fetch(`${serverBaseUrl}/api/webhooks/${webhookId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to update webhook: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const result = (await response.json()) as { webhook: WebhookSubscription };
      return result.webhook;
    },

    async deleteWebhook(webhookId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/webhooks/${webhookId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to delete webhook: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
    },

    async listWebhookDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const url = `${serverBaseUrl}/api/webhooks/${webhookId}/deliveries${qs ? `?${qs}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to list webhook deliveries: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { deliveries: WebhookDelivery[] };
      return data.deliveries;
    },

    // ── Stats & Analytics ────────────────────────────────────────

    async getProcessingStats(): Promise<Record<string, unknown>> {
      const response = await fetch(`${serverBaseUrl}/api/stats/processing`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get processing stats: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      return (await response.json()) as Record<string, unknown>;
    },

    async getTaskStatsSummary(): Promise<Record<string, unknown>> {
      const response = await fetch(`${serverBaseUrl}/api/stats/summary`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get task stats summary: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      return (await response.json()) as Record<string, unknown>;
    },

    async getUserStats(): Promise<Record<string, unknown>> {
      const response = await fetch(`${serverBaseUrl}/api/stats/users`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get user stats: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      return (await response.json()) as Record<string, unknown>;
    },

    async getTaskTimeSeries(from?: string, to?: string, interval?: string, metric?: string): Promise<Record<string, unknown>> {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (interval) params.set("interval", interval);
      if (metric) params.set("metric", metric);
      const qs = params.toString();
      const url = `${serverBaseUrl}/api/stats/timeseries${qs ? `?${qs}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get task timeseries: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      return (await response.json()) as Record<string, unknown>;
    },

    // ── User Management ────────────────────────────────────────

    async listUsers(): Promise<User[]> {
      const response = await fetch(`${serverBaseUrl}/api/users`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to list users: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { users: User[] };
      return data.users;
    },

    async getUser(userId: string): Promise<User> {
      const response = await fetch(`${serverBaseUrl}/api/users/${encodeURIComponent(userId)}`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to get user: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { user: User };
      return data.user;
    },

    async createUser(username: string, role?: UserRole, feishuUserId?: string): Promise<User> {
      const response = await fetch(`${serverBaseUrl}/api/users`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ username, role, feishuUserId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to create user: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { user: User };
      return data.user;
    },

    async updateUserRole(userId: string, role: UserRole): Promise<User> {
      const response = await fetch(`${serverBaseUrl}/api/users/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to update user role: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { user: User };
      return data.user;
    },

    async deleteUser(userId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to delete user: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
    },

    async regenerateUserToken(userId: string): Promise<User> {
      const response = await fetch(`${serverBaseUrl}/api/users/${encodeURIComponent(userId)}/token/regenerate`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `Failed to regenerate user token: ${response.status} ${body.error?.message ?? response.statusText}`,
        );
      }
      const data = (await response.json()) as { user: User };
      return data.user;
    },

    async listApiKeys(userId?: string): Promise<Array<Record<string, unknown>>> {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      const url = `${serverBaseUrl}/api/keys${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list API keys: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { apiKeys: Array<Record<string, unknown>> };
      return data.apiKeys;
    },

    async getApiKey(keyId: string): Promise<Record<string, unknown>> {
      const response = await fetch(`${serverBaseUrl}/api/keys/${encodeURIComponent(keyId)}`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get API key: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { apiKey: Record<string, unknown> };
      return data.apiKey;
    },

    async createApiKey(name: string, userId: string, role?: string): Promise<Record<string, unknown>> {
      const response = await fetch(`${serverBaseUrl}/api/keys`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name, userId, role }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to create API key: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { apiKey: Record<string, unknown> };
      return data.apiKey;
    },

    async rotateApiKey(keyId: string, gracePeriodMs?: number): Promise<Record<string, unknown>> {
      const response = await fetch(`${serverBaseUrl}/api/keys/${encodeURIComponent(keyId)}/rotate`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ gracePeriodMs }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to rotate API key: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { apiKey: Record<string, unknown> };
      return data.apiKey;
    },

    async revokeApiKey(keyId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/keys/${encodeURIComponent(keyId)}/revoke`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to revoke API key: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async enableApiKey(keyId: string): Promise<Record<string, unknown>> {
      const response = await fetch(`${serverBaseUrl}/api/keys/${encodeURIComponent(keyId)}/enable`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to enable API key: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { apiKey: Record<string, unknown> };
      return data.apiKey;
    },

    async disableApiKey(keyId: string): Promise<Record<string, unknown>> {
      const response = await fetch(`${serverBaseUrl}/api/keys/${encodeURIComponent(keyId)}/disable`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to disable API key: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { apiKey: Record<string, unknown> };
      return data.apiKey;
    },

    async cleanupExpiredApiKeys(): Promise<{ cleaned: number }> {
      const response = await fetch(`${serverBaseUrl}/api/keys/cleanup-expired`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to cleanup expired API keys: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { cleaned: number };
      return { cleaned: data.cleaned };
    },

    // ─── Saved Views ─────────────────────────────────────────────────────

    async listSavedViews(createdBy?: string): Promise<import("../shared/types.js").SavedView[]> {
      const params = new URLSearchParams();
      if (createdBy) params.set("createdBy", createdBy);
      const url = `${serverBaseUrl}/api/saved-views${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list saved views: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { views: import("../shared/types.js").SavedView[] };
      return data.views;
    },

    async getSavedView(viewId: string): Promise<import("../shared/types.js").SavedView> {
      const response = await fetch(`${serverBaseUrl}/api/saved-views/${viewId}`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get saved view: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as import("../shared/types.js").SavedView;
    },

    async createSavedView(name: string, filters: Record<string, unknown>): Promise<import("../shared/types.js").SavedView> {
      const response = await fetch(`${serverBaseUrl}/api/saved-views`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name, filters }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to create saved view: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as import("../shared/types.js").SavedView;
    },

    async updateSavedView(viewId: string, updates: { name?: string; filters?: Record<string, unknown> }): Promise<import("../shared/types.js").SavedView> {
      const response = await fetch(`${serverBaseUrl}/api/saved-views/${viewId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to update saved view: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as import("../shared/types.js").SavedView;
    },

    async deleteSavedView(viewId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/saved-views/${viewId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to delete saved view: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async applySavedView(viewId: string): Promise<Task[]> {
      // Step 1: Get the saved view and its filters
      const viewResponse = await fetch(`${serverBaseUrl}/api/saved-views/${viewId}`, { headers });
      if (!viewResponse.ok) {
        const body = (await viewResponse.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get saved view: ${viewResponse.status} ${body.error?.message ?? viewResponse.statusText}`);
      }
      const view = (await viewResponse.json()) as import("../shared/types.js").SavedView;
      const filters = view.filters;
      // Step 2: Search tasks using the saved view's filters
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.deviceId) params.set("deviceId", filters.deviceId);
      if (filters.tags && filters.tags.length > 0) params.set("tags", filters.tags.join(","));
      if (filters.fromDate) params.set("from", filters.fromDate);
      if (filters.toDate) params.set("to", filters.toDate);
      if (filters.query) params.set("q", filters.query);
      const qs = params.toString();
      const searchUrl = `${serverBaseUrl}/api/tasks/search${qs ? `?${qs}` : ""}`;
      const searchResponse = await fetch(searchUrl, { headers });
      if (!searchResponse.ok) {
        const body = (await searchResponse.json()) as { error?: { message?: string } };
        throw new Error(`Failed to search tasks: ${searchResponse.status} ${body.error?.message ?? searchResponse.statusText}`);
      }
      const data = (await searchResponse.json()) as { tasks: Task[] };
      return data.tasks;
    },

    async resetStaleTasks(timeoutMs?: number): Promise<{ resetCount: number }> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/reset-stale`, {
        method: "POST",
        headers,
        body: JSON.stringify({ timeoutMs }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to reset stale tasks: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as { resetCount: number };
    },

    async cleanupProcessedEvents(retentionDays?: number): Promise<{ deletedCount: number }> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/cleanup-events`, {
        method: "POST",
        headers,
        body: JSON.stringify({ retentionDays }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to cleanup processed events: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as { deletedCount: number };
    },

    async watchTask(taskId: string): Promise<TaskWatcher> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/watchers`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to watch task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { watcher: TaskWatcher };
      return data.watcher;
    },

    async unwatchTask(taskId: string): Promise<{ removed: boolean }> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/watchers`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to unwatch task: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as { removed: boolean };
    },

    async listTaskWatchers(taskId: string): Promise<TaskWatcher[]> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/watchers`, {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list task watchers: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { watchers: TaskWatcher[] };
      return data.watchers;
    },

    // Time entry methods
    async listTimeEntries(taskId: string): Promise<import("../shared/types.js").TimeEntry[]> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/time-entries`, {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list time entries: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { entries: import("../shared/types.js").TimeEntry[] };
      return data.entries;
    },

    async createTimeEntry(taskId: string, opts: { startedAt?: string; endedAt?: string; durationMinutes?: number; description?: string; loggedBy?: string }): Promise<import("../shared/types.js").TimeEntry> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/time-entries`, {
        method: "POST",
        headers,
        body: JSON.stringify(opts),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to create time entry: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { entry: import("../shared/types.js").TimeEntry };
      return data.entry;
    },

    async startTimeEntry(taskId: string, description?: string): Promise<import("../shared/types.js").TimeEntry> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/time-entries/start`, {
        method: "POST",
        headers,
        body: JSON.stringify({ description }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to start time tracking: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { entry: import("../shared/types.js").TimeEntry };
      return data.entry;
    },

    async stopTimeEntry(taskId: string, entryId: string): Promise<import("../shared/types.js").TimeEntry> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/time-entries/stop`, {
        method: "POST",
        headers,
        body: JSON.stringify({ entryId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to stop time tracking: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { entry: import("../shared/types.js").TimeEntry };
      return data.entry;
    },

    async deleteTimeEntry(taskId: string, entryId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/time-entries/${entryId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to delete time entry: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async getTimeTrackingStats(): Promise<import("../shared/types.js").TimeTrackingSummary> {
      const response = await fetch(`${serverBaseUrl}/api/stats/time-tracking`, {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get time tracking stats: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      return (await response.json()) as import("../shared/types.js").TimeTrackingSummary;
    },

    async getActivityFeed(taskId: string, limit?: number): Promise<import("../shared/types.js").ActivityFeedItem[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const url = `${serverBaseUrl}/api/tasks/${taskId}/activity${qs ? "?" + qs : ""}`;
      const response = await fetch(url, {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get activity feed: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { items: import("../shared/types.js").ActivityFeedItem[] };
      return data.items;
    },

    // Cycle (sprint) methods
    async listCycles(status?: import("../shared/types.js").CycleStatus): Promise<import("../shared/types.js").CycleSummary[]> {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const qs = params.toString();
      const url = `${serverBaseUrl}/api/cycles${qs ? "?" + qs : ""}`;
      const response = await fetch(url, { method: "GET", headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list cycles: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { cycles: import("../shared/types.js").CycleSummary[] };
      return data.cycles;
    },

    async getCycle(cycleId: string): Promise<import("../shared/types.js").CycleSummary> {
      const response = await fetch(`${serverBaseUrl}/api/cycles/${cycleId}`, { method: "GET", headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get cycle: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { cycle: import("../shared/types.js").CycleSummary };
      return data.cycle;
    },

    async createCycle(data: { name: string; description?: string; startDate: string; endDate: string }): Promise<import("../shared/types.js").Cycle> {
      const response = await fetch(`${serverBaseUrl}/api/cycles`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to create cycle: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const result = (await response.json()) as { cycle: import("../shared/types.js").Cycle };
      return result.cycle;
    },

    async updateCycle(cycleId: string, updates: Record<string, unknown>): Promise<import("../shared/types.js").Cycle> {
      const response = await fetch(`${serverBaseUrl}/api/cycles/${cycleId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to update cycle: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const result = (await response.json()) as { cycle: import("../shared/types.js").Cycle };
      return result.cycle;
    },

    async deleteCycle(cycleId: string): Promise<void> {
      const response = await fetch(`${serverBaseUrl}/api/cycles/${cycleId}`, { method: "DELETE", headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to delete cycle: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
    },

    async addTaskToCycle(taskId: string, cycleId: string): Promise<import("../shared/types.js").Task> {
      const response = await fetch(`${serverBaseUrl}/api/cycles/${cycleId}/tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify({ taskId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to add task to cycle: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: import("../shared/types.js").Task };
      return data.task;
    },

    async removeTaskFromCycle(taskId: string): Promise<import("../shared/types.js").Task> {
      const response = await fetch(`${serverBaseUrl}/api/cycles/tasks/${taskId}`, { method: "DELETE", headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to remove task from cycle: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { task: import("../shared/types.js").Task };
      return data.task;
    },

    async listCycleTasks(cycleId: string): Promise<import("../shared/types.js").Task[]> {
      const response = await fetch(`${serverBaseUrl}/api/cycles/${cycleId}/tasks`, { method: "GET", headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to list cycle tasks: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { tasks: import("../shared/types.js").Task[] };
      return data.tasks;
    },

    async getAuditCount(): Promise<number> {
      const response = await fetch(`${serverBaseUrl}/api/audit/count`, { headers });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to get audit count: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { count: number };
      return data.count;
    },

    async cleanupAuditLog(retentionDays?: number): Promise<{ deletedCount: number }> {
      const response = await fetch(`${serverBaseUrl}/api/audit/cleanup`, {
        method: "POST",
        headers,
        body: JSON.stringify({ retentionDays }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to cleanup audit log: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { ok: boolean; deletedCount: number };
      return { deletedCount: data.deletedCount };
    },

    async updateTaskCard(taskId: string, markdown: string, title?: string, color?: string): Promise<{ success: boolean; messageId: string }> {
      const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/card`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ markdown, title, color }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to update task card: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { success: boolean; messageId: string };
      return { success: data.success, messageId: data.messageId };
    },
  };
}
