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
    cycleId?: string;
    moduleId?: string;
    source?: string;
  }): Promise<Task[]>;
  getTask(taskId: string): Promise<Task>;
  createTask(options: {
    commandText: string;
    description?: string;
    priority?: string;
    tags?: string[];
    assignedDeviceId?: string;
    dueDate?: string;
  }): Promise<Task>;
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
  setTaskCommandText(taskId: string, commandText: string): Promise<Task>;
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
  bulkUpdateDueDate(ids: string[], dueDate: string | null): Promise<{ updated: number; errors: string[] }>;
  bulkCloneTasks(ids: string[]): Promise<{ cloned: number; errors: string[]; taskIds: string[] }>;
  // Template methods
  listTemplates(): Promise<TaskTemplate[]>;
  getTemplate(templateId: string): Promise<TaskTemplate>;
  createTemplate(template: { name: string; description?: string; commandText: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDateOffsetMs?: number; reminderOffsetMs?: number; variables?: Record<string, string> }): Promise<TaskTemplate>;
  updateTemplate(templateId: string, updates: Record<string, unknown>): Promise<TaskTemplate>;
  deleteTemplate(templateId: string): Promise<void>;
  createTaskFromTemplate(templateId: string, overrides?: { commandText?: string; description?: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDate?: string; reminderAt?: string; variables?: Record<string, string> }): Promise<Task>;
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
  exportTasksCsv(filters?: { status?: string; priority?: string; tags?: string; from?: string; to?: string; q?: string; deviceId?: string; source?: string }): Promise<string>;
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
  // Task reopen
  reopenTask(taskId: string): Promise<Task>;
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
  getApiUsageEntries(callerId: string, limit?: number): Promise<Record<string, unknown>>;
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
  getCycleProgress(cycleId: string): Promise<import("../shared/types.js").CycleProgress>;
  // Global activity feed
  getGlobalActivity(limit?: number): Promise<import("../shared/types.js").ActivityFeedItem[]>;
  // Module (epic) methods
  listModules(status?: import("../shared/types.js").ModuleStatus): Promise<import("../shared/types.js").ModuleWithProgress[]>;
  getModule(moduleId: string): Promise<import("../shared/types.js").ModuleWithProgress>;
  createModule(data: { name: string; description?: string; startDate?: string; endDate?: string }): Promise<import("../shared/types.js").Module>;
  updateModule(moduleId: string, updates: Record<string, unknown>): Promise<import("../shared/types.js").Module>;
  deleteModule(moduleId: string): Promise<void>;
  addTaskToModule(taskId: string, moduleId: string): Promise<import("../shared/types.js").Task>;
  removeTaskFromModule(taskId: string): Promise<import("../shared/types.js").Task>;
  listModuleTasks(moduleId: string): Promise<import("../shared/types.js").Task[]>;
  // Audit management methods
  getAuditCount(): Promise<number>;
  cleanupAuditLog(retentionDays?: number): Promise<{ deletedCount: number }>;
  // Feishu card update
  updateTaskCard(taskId: string, markdown: string, title?: string, color?: string): Promise<{ success: boolean; messageId: string }>;
  // Task links (external URLs)
  listTaskLinks(taskId: string): Promise<import("../shared/types.js").TaskLink[]>;
  addTaskLink(taskId: string, title: string, url: string): Promise<import("../shared/types.js").TaskLink>;
  deleteTaskLink(taskId: string, linkId: number): Promise<void>;
}

export interface TaskApiClientOptions {
  /** HTTP request timeout in milliseconds. Default: 30000 */
  timeoutMs?: number;
  /** Maximum retries for idempotent GET requests on network errors or 429/502/503/504. Default: 2 */
  maxRetries?: number;
  /** Base backoff delay in ms for retries. Default: 200 */
  retryBaseDelayMs?: number;
  /** Optional custom fetch implementation (useful for testing) */
  fetchFn?: typeof globalThis.fetch;
}

const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

function createResilientFetch(options?: TaskApiClientOptions): typeof globalThis.fetch {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const maxRetries = options?.maxRetries ?? 2;
  const retryBaseDelayMs = options?.retryBaseDelayMs ?? 200;
  const baseFetch = options?.fetchFn ?? globalThis.fetch;

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const canRetry = method === "GET" || method === "HEAD";
    const attempts = canRetry ? maxRetries + 1 : 1;

    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const signal = init?.signal ?? AbortSignal.timeout(timeoutMs);
        const response = await baseFetch(input, { ...init, signal });

        if (!response.ok && canRetry && RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < attempts - 1) {
          const delay = retryBaseDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Guard callers that invoke `await response.json()` on non-OK responses when an upstream
        // proxy (e.g. Nginx/Cloudflare) returns an HTML 502/504 page instead of JSON.
        if (!response.ok) {
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.toLowerCase().includes("application/json")) {
            const text = await response.text().catch(() => "");
            try {
              JSON.parse(text);
              return new Response(text, {
                status: response.status,
                statusText: response.statusText,
                headers: { "content-type": "application/json" },
              });
            } catch {
              const snippet = text.replace(/\s+/g, " ").trim().slice(0, 200);
              return new Response(
                JSON.stringify({
                  error: {
                    code: "upstream_error",
                    message: snippet || response.statusText || `HTTP ${response.status}`,
                  },
                }),
                {
                  status: response.status,
                  statusText: response.statusText,
                  headers: { "content-type": "application/json" },
                },
              );
            }
          }
        }

        return response;
      } catch (err) {
        lastError = err;
        if (!canRetry || attempt >= attempts - 1) {
          throw err;
        }
        const delay = retryBaseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  };
}

export function createTaskApiClient(
  serverBaseUrl: string,
  personalToken: string,
  deviceId?: string,
  options?: TaskApiClientOptions,
): TaskApiClient {
  const fetch = createResilientFetch(options);
  const baseUrl = serverBaseUrl.replace(/\/+$/, "");
  const authHeaders = {
    Authorization: `Bearer ${personalToken}`,
  };
  const jsonHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${personalToken}`,
  };
  const enc = (segment: string | number): string => encodeURIComponent(String(segment));

  async function requestRaw(
    method: string,
    path: string,
    action: string,
    body?: unknown,
  ): Promise<Response> {
    const init: RequestInit = {
      method,
      headers: body !== undefined ? jsonHeaders : authHeaders,
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${path}`, init);
    if (!response.ok) {
      const errBody = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(
        `Failed to ${action}: ${response.status} ${errBody.error?.message ?? response.statusText}`,
      );
    }
    return response;
  }

  async function requestJson<T>(
    method: string,
    path: string,
    action: string,
    body?: unknown,
  ): Promise<T> {
    const response = await requestRaw(method, path, action, body);
    return (await response.json()) as T;
  }

  async function requestVoid(
    method: string,
    path: string,
    action: string,
    body?: unknown,
  ): Promise<void> {
    await requestRaw(method, path, action, body);
  }

  return {
    async listTasks(status?: TaskStatus, limit?: number, filterDeviceId?: string, priority?: string): Promise<Task[]> {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (limit) params.set("limit", String(limit));
      if (priority) params.set("priority", priority);
      // Use the explicitly passed deviceId, or fall back to the configured one
      const effectiveDeviceId = filterDeviceId ?? deviceId;
      if (effectiveDeviceId) params.set("deviceId", effectiveDeviceId);

      const data = await requestJson<{ tasks: Task[] }>("GET", `/api/tasks${params.toString() ? `?${params.toString()}` : ""}`, "list tasks");
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
      cycleId?: string;
      moduleId?: string;
      source?: string;
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
      if (options.cycleId) params.set("cycleId", options.cycleId);
      if (options.moduleId) params.set("moduleId", options.moduleId);
      if (options.source) params.set("source", options.source);

      const qs = params.toString();
      const data = await requestJson<{ tasks: Task[] }>("GET", `/api/tasks/search${qs ? `?${qs}` : ""}`, "search tasks");
      return data.tasks;
    },

    async getTask(taskId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("GET", `/api/tasks/${enc(taskId)}`, "get task");
      return data.task;
    },

    async createTask(options: {
      commandText: string;
      description?: string;
      priority?: string;
      tags?: string[];
      assignedDeviceId?: string;
      dueDate?: string;
    }): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks`, "create task", options);
      return data.task;
    },

    async markTaskRunning(taskId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/status`, "mark task running", { status: "running" });
      return data.task;
    },

    async reportTaskResult(
      taskId: string,
      success: boolean,
      summary: string,
      details?: string,
    ): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/result`, "report task result", { success, summary, details });
      return data.task;
    },

    async replyFeishu(taskId: string, message: string): Promise<void> {
      await requestVoid("POST", `/api/tasks/${enc(taskId)}/reply`, "reply to Feishu", { message });
    },

    async registerDevice(name: string, capabilities?: string): Promise<{ id: string; token: string }> {
      const data = await requestJson<{ device: { id: string; token: string } }>("POST", `/api/devices`, "register device", { name, capabilities });
      return { id: data.device.id, token: data.device.token };
    },

    async listDevices(): Promise<Device[]> {
      const data = await requestJson<{ devices: Device[] }>("GET", `/api/devices`, "list devices");
      return data.devices;
    },

    async getDevice(deviceId: string): Promise<Device> {
      const data = await requestJson<{ device: Device }>("GET", `/api/devices/${enc(deviceId)}`, "get device");
      return data.device;
    },

    async deleteDevice(deviceId: string): Promise<void> {
      await requestVoid("DELETE", `/api/devices/${enc(deviceId)}`, "delete device");
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
      const data = await requestJson<{ entries: AuditLogEntry[] }>("GET", `/api/audit${qs ? `?${qs}` : ""}`, "query audit log");
      return data.entries;
    },

    async addTags(taskId: string, tags: string[]): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/tags`, "add tags", { tags });
      return data.task;
    },

    async removeTag(taskId: string, tag: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("DELETE", `/api/tasks/${enc(taskId)}/tags/${enc(tag)}`, "remove tag");
      return data.task;
    },

    async listAllTags(): Promise<string[]> {
      const data = await requestJson<{ tags: string[] }>("GET", `/api/tasks/tags`, "list tags");
      return data.tags;
    },

    async setDueDate(taskId: string, dueDate: string | null): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/due`, "set due date", { dueDate });
      return data.task;
    },

    async setReminder(taskId: string, reminderAt: string | null): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/reminder`, "set reminder", { reminderAt });
      return data.task;
    },

    async setTaskDescription(taskId: string, description: string | null): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/description`, "set description", { description });
      return data.task;
    },

    async setPriority(taskId: string, priority: TaskPriority): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/priority`, "set priority", { priority });
      return data.task;
    },

    async setEstimatedMinutes(taskId: string, minutes: number | null): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/estimated-minutes`, "set estimated minutes", { estimatedMinutes: minutes });
      return data.task;
    },

    async setTaskCommandText(taskId: string, commandText: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/command-text`, "set command text", { commandText });
      return data.task;
    },

    async listOverdueTasks(): Promise<Task[]> {
      const data = await requestJson<{ tasks: Task[] }>("GET", `/api/tasks/overdue`, "list overdue tasks");
      return data.tasks;
    },

    async listComments(taskId: string): Promise<TaskComment[]> {
      const data = await requestJson<{ comments: TaskComment[] }>("GET", `/api/tasks/${enc(taskId)}/comments`, "list comments");
      return data.comments;
    },

    async addComment(taskId: string, _author: string, commentBody: string): Promise<TaskComment> {
      const data = await requestJson<{ comment: TaskComment }>("POST", `/api/tasks/${enc(taskId)}/comments`, "add comment", { body: commentBody });
      return data.comment;
    },

    async deleteTaskComment(taskId: string, commentId: number): Promise<void> {
      await requestVoid("DELETE", `/api/tasks/${enc(taskId)}/comments/${enc(commentId)}`, "delete comment");
    },

    async bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }> {
      const data = await requestJson<{ updated: number; errors: string[] }>("POST", `/api/tasks/bulk/status`, "bulk update status", { ids, status });
      return { updated: data.updated, errors: data.errors };
    },

    async bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }> {
      const data = await requestJson<{ updated: number; errors: string[] }>("POST", `/api/tasks/bulk/assign`, "bulk assign", { ids, deviceId });
      return { updated: data.updated, errors: data.errors };
    },

    async assignTask(taskId: string, deviceId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/assign`, "assign task", { deviceId });
      return data.task;
    },

    async unassignTask(taskId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/unassign`, "unassign task");
      return data.task;
    },

    async bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
      const data = await requestJson<{ deleted: number; errors: string[] }>("POST", `/api/tasks/bulk/delete`, "bulk delete", { ids });
      return { deleted: data.deleted, errors: data.errors };
    },

    async bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }> {
      const data = await requestJson<{ updated: number; errors: string[] }>("POST", `/api/tasks/bulk/tags/add`, "bulk add tags", { ids, tags });
      return { updated: data.updated, errors: data.errors };
    },

    async bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }> {
      const data = await requestJson<{ updated: number; errors: string[] }>("POST", `/api/tasks/bulk/tags/remove`, "bulk remove tag", { ids, tag });
      return { updated: data.updated, errors: data.errors };
    },

    async bulkUpdatePriority(ids: string[], priority: string): Promise<{ updated: number; errors: string[] }> {
      const data = await requestJson<{ updated: number; errors: string[] }>("POST", `/api/tasks/bulk/priority`, "bulk update priority", { ids, priority });
      return { updated: data.updated, errors: data.errors };
    },

    async bulkUpdateDueDate(ids: string[], dueDate: string | null): Promise<{ updated: number; errors: string[] }> {
      const data = await requestJson<{ updated: number; errors: string[] }>("POST", `/api/tasks/bulk/due-date`, "bulk update due date", { ids, dueDate });
      return { updated: data.updated, errors: data.errors };
    },

    async bulkCloneTasks(ids: string[]): Promise<{ cloned: number; errors: string[]; taskIds: string[] }> {
      const data = await requestJson<{ cloned: number; errors: string[]; taskIds: string[] }>("POST", `/api/tasks/bulk/clone`, "bulk clone tasks", { ids });
      return { cloned: data.cloned, errors: data.errors, taskIds: data.taskIds };
    },

    // ── Task Templates ──────────────────────────────────────────────

    async listTemplates(): Promise<TaskTemplate[]> {
      const data = await requestJson<{ templates: TaskTemplate[] }>("GET", `/api/templates`, "list templates");
      return data.templates;
    },

    async getTemplate(templateId: string): Promise<TaskTemplate> {
      const data = await requestJson<{ template: TaskTemplate }>("GET", `/api/templates/${enc(templateId)}`, "get template");
      return data.template;
    },

    async createTemplate(template: { name: string; description?: string; commandText: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDateOffsetMs?: number; reminderOffsetMs?: number; variables?: Record<string, string> }): Promise<TaskTemplate> {
      const data = await requestJson<{ template: TaskTemplate }>("POST", `/api/templates`, "create template", template);
      return data.template;
    },

    async updateTemplate(templateId: string, updates: Record<string, unknown>): Promise<TaskTemplate> {
      const data = await requestJson<{ template: TaskTemplate }>("PUT", `/api/templates/${enc(templateId)}`, "update template", updates);
      return data.template;
    },

    async deleteTemplate(templateId: string): Promise<void> {
      await requestVoid("DELETE", `/api/templates/${enc(templateId)}`, "delete template");
    },

    async createTaskFromTemplate(templateId: string, overrides?: { commandText?: string; description?: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDate?: string; reminderAt?: string; variables?: Record<string, string> }): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/templates/${enc(templateId)}/create-task`, "create task from template", overrides ?? {});
      return data.task;
    },

    async getTemplateUsageStats(): Promise<{ stats: { templateId: string; name: string; usageCount: number }[]; totalUsage: number; templateCount: number }> {
      return await requestJson<{ stats: { templateId: string; name: string; usageCount: number }[]; totalUsage: number; templateCount: number }>("GET", `/api/templates/usage-stats`, "get template usage stats");
    },

    // ── Scheduled Tasks ──────────────────────────────────────────────

    async listScheduledTasks(): Promise<ScheduledTask[]> {
      const data = await requestJson<{ scheduledTasks: ScheduledTask[] }>("GET", `/api/scheduled-tasks`, "list scheduled tasks");
      return data.scheduledTasks;
    },

    async getScheduledTask(scheduledId: string): Promise<ScheduledTask> {
      const data = await requestJson<{ scheduledTask: ScheduledTask }>("GET", `/api/scheduled-tasks/${enc(scheduledId)}`, "get scheduled task");
      return data.scheduledTask;
    },

    async createScheduledTask(data: { commandText: string; frequency: ScheduleFrequency; priority?: string; tags?: string[]; assignedDeviceId?: string; nextRunAt?: string; enabled?: boolean; templateId?: string }): Promise<ScheduledTask> {
      const result = await requestJson<{ scheduledTask: ScheduledTask }>("POST", `/api/scheduled-tasks`, "create scheduled task", data);
      return result.scheduledTask;
    },

    async updateScheduledTask(scheduledId: string, updates: Record<string, unknown>): Promise<ScheduledTask> {
      const result = await requestJson<{ scheduledTask: ScheduledTask }>("PUT", `/api/scheduled-tasks/${enc(scheduledId)}`, "update scheduled task", updates);
      return result.scheduledTask;
    },

    async deleteScheduledTask(scheduledId: string): Promise<void> {
      await requestVoid("DELETE", `/api/scheduled-tasks/${enc(scheduledId)}`, "delete scheduled task");
    },

    async runScheduledTask(scheduledId: string): Promise<{ task: Task; scheduledTask: ScheduledTask }> {
      const data = await requestJson<{ task: Task; scheduledTask: ScheduledTask }>("POST", `/api/scheduled-tasks/${enc(scheduledId)}/run`, "run scheduled task");
      return { task: data.task, scheduledTask: data.scheduledTask };
    },

    // ── Task Dependencies ──────────────────────────────────────────────

    async setDependencies(taskId: string, dependsOnIds: string[]): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/dependencies`, "set dependencies", { dependsOn: dependsOnIds });
      return data.task;
    },

    async getDependencies(taskId: string): Promise<{ dependencies: Array<{ id: string; status: string; commandText: string }>; dependentIds: string[]; blocked: boolean }> {
      const data = await requestJson<{ dependencies: Array<{ id: string; status: string; commandText: string }>; dependentIds: string[]; blocked: boolean }>("GET", `/api/tasks/${enc(taskId)}/dependencies`, "get dependencies");
      return data;
    },

    async removeDependency(taskId: string, depId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("DELETE", `/api/tasks/${enc(taskId)}/dependencies/${enc(depId)}`, "remove dependency");
      return data.task;
    },

    async listReadyTasks(limit?: number, filterDeviceId?: string): Promise<Task[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const effectiveDeviceId = filterDeviceId ?? deviceId;
      if (effectiveDeviceId) params.set("deviceId", effectiveDeviceId);

      const data = await requestJson<{ tasks: Task[] }>("GET", `/api/tasks/ready${params.toString() ? `?${params.toString()}` : ""}`, "list ready tasks");
      return data.tasks;
    },

    async getDependencyGraph(taskId: string): Promise<import("../shared/types.js").DependencyGraph> {
      const data = await requestJson<{ graph: import("../shared/types.js").DependencyGraph }>("GET", `/api/tasks/${enc(taskId)}/dependency-graph`, "get dependency graph");
      return data.graph;
    },

    // ── Task Relationships (Phase 58) ─────────────────────────

    async addRelationship(taskId: string, relatedTaskId: string, relationshipType: import("../shared/types.js").TaskRelationshipType): Promise<void> {
      await requestVoid("POST", `/api/tasks/${enc(taskId)}/relationships`, "add relationship", { relatedTaskId, relationshipType });
    },

    async removeRelationship(taskId: string, relatedTaskId: string, relationshipType?: import("../shared/types.js").TaskRelationshipType): Promise<void> {
      const params = relationshipType ? `?type=${relationshipType}` : "";
      await requestVoid("DELETE", `/api/tasks/${enc(taskId)}/relationships/${enc(relatedTaskId)}${params}`, "remove relationship");
    },

    async listRelationships(taskId: string): Promise<import("../shared/types.js").TaskRelationship[]> {
      const data = await requestJson<{ relationships: import("../shared/types.js").TaskRelationship[] }>("GET", `/api/tasks/${enc(taskId)}/relationships`, "list relationships");
      return data.relationships;
    },

    // ── Task Locks ──────────────────────────────────────────────

    async lockTask(taskId: string, deviceId?: string, ttlMs?: number): Promise<import("../shared/types.js").TaskLock> {
      const data = await requestJson<{ lock: import("../shared/types.js").TaskLock }>("POST", `/api/tasks/${enc(taskId)}/lock`, "lock task", { deviceId, ttlMs });
      return data.lock;
    },

    async unlockTask(taskId: string, deviceId?: string): Promise<void> {
      await requestVoid("DELETE", `/api/tasks/${enc(taskId)}/lock`, "unlock task", { deviceId });
    },

    async getTaskLock(taskId: string): Promise<{ locked: boolean; lock: import("../shared/types.js").TaskLock | null }> {
      const data = await requestJson<{ locked: boolean; lock: import("../shared/types.js").TaskLock | null }>("GET", `/api/tasks/${enc(taskId)}/lock`, "get task lock");
      return data;
    },

    // ── Export/Import ──────────────────────────────────────────────

    async exportTasks(): Promise<Record<string, unknown>> {
      return await requestJson<Record<string, unknown>>("GET", `/api/tasks/export`, "export tasks");
    },

    async exportTasksCsv(filters?: { status?: string; priority?: string; tags?: string; from?: string; to?: string; q?: string; deviceId?: string; source?: string }): Promise<string> {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.priority) params.set("priority", filters.priority);
      if (filters?.tags) params.set("tags", filters.tags);
      if (filters?.from) params.set("from", filters.from);
      if (filters?.to) params.set("to", filters.to);
      if (filters?.q) params.set("q", filters.q);
      if (filters?.deviceId) params.set("deviceId", filters.deviceId);
      if (filters?.source) params.set("source", filters.source);
      const qs = params.toString();
      const response = await requestRaw("GET", `/api/tasks/export.csv${qs ? `?${qs}` : ""}`, "export CSV");
      return await response.text();
    },

    async importTasks(data: Record<string, unknown>, mode?: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
      const payload = { ...data };
      if (mode) payload.mode = mode;
      const result = await requestJson<{ imported: number; skipped: number; errors: string[] }>("POST", `/api/tasks/import`, "import tasks", payload);
      return { imported: result.imported, skipped: result.skipped, errors: result.errors };
    },

    async importTasksFromCsv(csv: string, options?: { columnMap?: Record<string, string>; defaultPriority?: string; defaultTags?: string[]; delimiter?: string }): Promise<{ imported: number; errors: string[]; taskIds: string[] }> {
      const payload: Record<string, unknown> = { csv };
      if (options?.columnMap) payload.columnMap = options.columnMap;
      if (options?.defaultPriority) payload.defaultPriority = options.defaultPriority;
      if (options?.defaultTags) payload.defaultTags = options.defaultTags;
      if (options?.delimiter) payload.delimiter = options.delimiter;
      const result = await requestJson<{ imported: number; errors: string[]; taskIds: string[] }>("POST", `/api/tasks/import-csv`, "import CSV", payload);
      return { imported: result.imported, errors: result.errors, taskIds: result.taskIds };
    },

    // ── SLA Methods ──────────────────────────────────────────────

    async listSlaPolicies(): Promise<SlaPolicy[]> {
      const data = await requestJson<{ policies: SlaPolicy[] }>("GET", `/api/sla/policies`, "list SLA policies");
      return data.policies;
    },

    async getSlaPolicy(policyId: string): Promise<SlaPolicy> {
      const data = await requestJson<{ policy: SlaPolicy }>("GET", `/api/sla/policies/${enc(policyId)}`, "get SLA policy");
      return data.policy;
    },

    async createSlaPolicy(policy: { name: string; description?: string; targetMinutes: number; warningThresholdPercent?: number; matchPriorities?: string[]; matchTags?: string[]; enabled?: boolean }): Promise<SlaPolicy> {
      const data = await requestJson<{ policy: SlaPolicy }>("POST", `/api/sla/policies`, "create SLA policy", policy);
      return data.policy;
    },

    async updateSlaPolicy(policyId: string, updates: Record<string, unknown>): Promise<SlaPolicy> {
      const data = await requestJson<{ policy: SlaPolicy }>("PUT", `/api/sla/policies/${enc(policyId)}`, "update SLA policy", updates);
      return data.policy;
    },

    async deleteSlaPolicy(policyId: string): Promise<void> {
      await requestVoid("DELETE", `/api/sla/policies/${enc(policyId)}`, "delete SLA policy");
    },

    async getSlaSummary(): Promise<SlaSummary> {
      return await requestJson<SlaSummary>("GET", `/api/sla/summary`, "get SLA summary");
    },

    async listSlaBreaches(): Promise<SlaBreachLog[]> {
      const data = await requestJson<{ breaches: SlaBreachLog[] }>("GET", `/api/sla/breaches`, "list SLA breaches");
      return data.breaches;
    },

    async checkSlaBreaches(): Promise<{ warnings: number; breaches: number; details: import("../shared/types.js").SlaBreachNotification[] }> {
      const data = await requestJson<{ warnings: number; breaches: number; details?: import("../shared/types.js").SlaBreachNotification[] }>("POST", `/api/sla/check`, "check SLA breaches");
      return { warnings: data.warnings, breaches: data.breaches, details: data.details ?? [] };
    },

    async getTaskSlaStatus(taskId: string): Promise<{ status: string; policy?: SlaPolicy; elapsedMinutes: number; targetMinutes?: number }> {
      return await requestJson<{ status: string; policy?: SlaPolicy; elapsedMinutes: number; targetMinutes?: number }>("GET", `/api/tasks/${enc(taskId)}/sla`, "get task SLA status");
    },

    async retryTask(taskId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/retry`, "retry task");
      return data.task;
    },

    async cloneTask(taskId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/clone`, "clone task");
      return data.task;
    },

    async reopenTask(taskId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/reopen`, "reopen task");
      return data.task;
    },

    async pinTask(taskId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/pin`, "pin task");
      return data.task;
    },

    async unpinTask(taskId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/unpin`, "unpin task");
      return data.task;
    },

    async forwardTask(taskId: string, targetDeviceId: string, message?: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/forward`, "forward task", { deviceId: targetDeviceId, message });
      return data.task;
    },

    // ── Task Notes (internal annotations) ──────────────────────────

    async listNotes(taskId: string): Promise<TaskNote[]> {
      const data = await requestJson<{ notes: TaskNote[] }>("GET", `/api/tasks/${enc(taskId)}/notes`, "list notes");
      return data.notes;
    },

    async addNote(taskId: string, noteBody: string): Promise<TaskNote> {
      const data = await requestJson<{ note: TaskNote }>("POST", `/api/tasks/${enc(taskId)}/notes`, "add note", { body: noteBody });
      return data.note;
    },

    async deleteTaskNote(taskId: string, noteId: number): Promise<void> {
      await requestVoid("DELETE", `/api/tasks/${enc(taskId)}/notes/${enc(noteId)}`, "delete note");
    },

    // ── Task User Search ──────────────────────────────────────────

    async listTasksByUser(userId: string, limit?: number): Promise<Task[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const data = await requestJson<{ tasks: Task[] }>("GET", `/api/tasks/user/${enc(userId)}${qs ? `?${qs}` : ""}`, "list tasks by user");
      return data.tasks;
    },

    // ── Task Subtasks ──────────────────────────────────────────

    async listSubtasks(taskId: string): Promise<import("../shared/types.js").Subtask[]> {
      const data = await requestJson<{ subtasks: import("../shared/types.js").Subtask[] }>("GET", `/api/tasks/${enc(taskId)}/subtasks`, "list subtasks");
      return data.subtasks;
    },

    async getSubtask(taskId: string, subtaskId: string): Promise<import("../shared/types.js").Subtask> {
      const data = await requestJson<{ subtask: import("../shared/types.js").Subtask }>("GET", `/api/tasks/${enc(taskId)}/subtasks/${enc(subtaskId)}`, "get subtask");
      return data.subtask;
    },

    async createSubtask(taskId: string, title: string, commandText: string): Promise<import("../shared/types.js").Subtask> {
      const data = await requestJson<{ subtask: import("../shared/types.js").Subtask }>("POST", `/api/tasks/${enc(taskId)}/subtasks`, "create subtask", { title, commandText });
      return data.subtask;
    },

    async updateSubtaskStatus(taskId: string, subtaskId: string, status: TaskStatus): Promise<import("../shared/types.js").Subtask> {
      const data = await requestJson<{ subtask: import("../shared/types.js").Subtask }>("POST", `/api/tasks/${enc(taskId)}/subtasks/${enc(subtaskId)}/status`, "update subtask status", { status });
      return data.subtask;
    },

    async reportSubtaskResult(taskId: string, subtaskId: string, success: boolean, summary: string, details?: string): Promise<import("../shared/types.js").Subtask> {
      const data = await requestJson<{ subtask: import("../shared/types.js").Subtask }>("POST", `/api/tasks/${enc(taskId)}/subtasks/${enc(subtaskId)}/result`, "report subtask result", { success, summary, details });
      return data.subtask;
    },

    async deleteSubtask(taskId: string, subtaskId: string): Promise<void> {
      await requestVoid("DELETE", `/api/tasks/${enc(taskId)}/subtasks/${enc(subtaskId)}`, "delete subtask");
    },

    async downloadAttachment(taskId: string, attachmentIndex: number): Promise<{ fileName: string; contentType: string; base64Data: string }> {
      const response = await requestRaw(
        "GET",
        `/api/tasks/${enc(taskId)}/attachments/${enc(attachmentIndex)}`,
        "download attachment",
      );

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
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/archive`, "archive task");
      return data.task;
    },

    async unarchiveTask(taskId: string): Promise<Task> {
      const data = await requestJson<{ task: Task }>("POST", `/api/tasks/${enc(taskId)}/unarchive`, "unarchive task");
      return data.task;
    },

    async listArchivedTasks(limit?: number): Promise<Task[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const data = await requestJson<{ tasks: Task[] }>("GET", `/api/tasks/archived${qs ? `?${qs}` : ""}`, "list archived tasks");
      return data.tasks;
    },

    async bulkArchiveTasks(ids: string[]): Promise<{ archived: number; errors: string[] }> {
      const data = await requestJson<{ archived: number; errors: string[] }>("POST", `/api/tasks/bulk/archive`, "bulk archive", { ids });
      return data;
    },

    async bulkUnarchiveTasks(ids: string[]): Promise<{ restored: number; errors: string[] }> {
      const data = await requestJson<{ restored: number; errors: string[] }>("POST", `/api/tasks/bulk/unarchive`, "bulk unarchive", { ids });
      return data;
    },

    async escalateOverduePriorities(): Promise<{ escalated: number; tasks: Task[] }> {
      const data = await requestJson<{ escalated: number; tasks: Task[] }>("POST", `/api/tasks/escalate-priorities`, "escalate priorities");
      return { escalated: data.escalated, tasks: data.tasks };
    },

    // ── Kanban Board ──────────────────────────────────────────────

    async getKanbanBoard(limit?: number, deviceId?: string): Promise<import("../shared/types.js").KanbanBoard> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (deviceId) params.set("deviceId", deviceId);
      const qs = params.toString();
      return await requestJson<import("../shared/types.js").KanbanBoard>("GET", `/api/tasks/kanban${qs ? `?${qs}` : ""}`, "get kanban board");
    },

    async getApiUsageStats(from?: string, to?: string): Promise<Record<string, unknown>> {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      return await requestJson<Record<string, unknown>>("GET", `/api/usage/stats${qs ? `?${qs}` : ""}`, "get API usage stats");
    },

    async getApiUsageEntries(callerId: string, limit?: number): Promise<Record<string, unknown>> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      return await requestJson<Record<string, unknown>>("GET", `/api/usage/entries/${enc(callerId)}${qs ? `?${qs}` : ""}`, "get API usage entries");
    },

    async listWebhooks(): Promise<WebhookSubscription[]> {
      const data = await requestJson<{ webhooks: WebhookSubscription[] }>("GET", `/api/webhooks`, "list webhooks");
      return data.webhooks;
    },

    async getWebhook(webhookId: string): Promise<WebhookSubscription> {
      const data = await requestJson<{ webhook: WebhookSubscription }>("GET", `/api/webhooks/${enc(webhookId)}`, "get webhook");
      return data.webhook;
    },

    async createWebhook(data: { url: string; events: string[]; enabled?: boolean; description?: string }): Promise<WebhookSubscription> {
      const result = await requestJson<{ webhook: WebhookSubscription }>("POST", `/api/webhooks`, "create webhook", data);
      return result.webhook;
    },

    async updateWebhook(webhookId: string, updates: { url?: string; events?: string[]; enabled?: boolean; description?: string }): Promise<WebhookSubscription> {
      const result = await requestJson<{ webhook: WebhookSubscription }>("PATCH", `/api/webhooks/${enc(webhookId)}`, "update webhook", updates);
      return result.webhook;
    },

    async deleteWebhook(webhookId: string): Promise<void> {
      await requestVoid("DELETE", `/api/webhooks/${enc(webhookId)}`, "delete webhook");
    },

    async listWebhookDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const data = await requestJson<{ deliveries: WebhookDelivery[] }>("GET", `/api/webhooks/${enc(webhookId)}/deliveries${qs ? `?${qs}` : ""}`, "list webhook deliveries");
      return data.deliveries;
    },

    // ── Stats & Analytics ────────────────────────────────────────

    async getProcessingStats(): Promise<Record<string, unknown>> {
      return await requestJson<Record<string, unknown>>("GET", `/api/stats/processing`, "get processing stats");
    },

    async getTaskStatsSummary(): Promise<Record<string, unknown>> {
      return await requestJson<Record<string, unknown>>("GET", `/api/stats/summary`, "get task stats summary");
    },

    async getUserStats(): Promise<Record<string, unknown>> {
      return await requestJson<Record<string, unknown>>("GET", `/api/stats/users`, "get user stats");
    },

    async getTaskTimeSeries(from?: string, to?: string, interval?: string, metric?: string): Promise<Record<string, unknown>> {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (interval) params.set("interval", interval);
      if (metric) params.set("metric", metric);
      const qs = params.toString();
      return await requestJson<Record<string, unknown>>("GET", `/api/stats/timeseries${qs ? `?${qs}` : ""}`, "get task timeseries");
    },

    // ── User Management ────────────────────────────────────────

    async listUsers(): Promise<User[]> {
      const data = await requestJson<{ users: User[] }>("GET", `/api/users`, "list users");
      return data.users;
    },

    async getUser(userId: string): Promise<User> {
      const data = await requestJson<{ user: User }>("GET", `/api/users/${enc(userId)}`, "get user");
      return data.user;
    },

    async createUser(username: string, role?: UserRole, feishuUserId?: string): Promise<User> {
      const data = await requestJson<{ user: User }>("POST", `/api/users`, "create user", { username, role, feishuUserId });
      return data.user;
    },

    async updateUserRole(userId: string, role: UserRole): Promise<User> {
      const data = await requestJson<{ user: User }>("PATCH", `/api/users/${enc(userId)}/role`, "update user role", { role });
      return data.user;
    },

    async deleteUser(userId: string): Promise<void> {
      await requestVoid("DELETE", `/api/users/${enc(userId)}`, "delete user");
    },

    async regenerateUserToken(userId: string): Promise<User> {
      const data = await requestJson<{ user: User }>("POST", `/api/users/${enc(userId)}/token/regenerate`, "regenerate user token");
      return data.user;
    },

    async listApiKeys(userId?: string): Promise<Array<Record<string, unknown>>> {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      const data = await requestJson<{ apiKeys: Array<Record<string, unknown>> }>("GET", `/api/keys${params.toString() ? `?${params.toString()}` : ""}`, "list API keys");
      return data.apiKeys;
    },

    async getApiKey(keyId: string): Promise<Record<string, unknown>> {
      const data = await requestJson<{ apiKey: Record<string, unknown> }>("GET", `/api/keys/${enc(keyId)}`, "get API key");
      return data.apiKey;
    },

    async createApiKey(name: string, userId: string, role?: string): Promise<Record<string, unknown>> {
      const data = await requestJson<{ apiKey: Record<string, unknown> }>("POST", `/api/keys`, "create API key", { name, userId, role });
      return data.apiKey;
    },

    async rotateApiKey(keyId: string, gracePeriodMs?: number): Promise<Record<string, unknown>> {
      const data = await requestJson<{ apiKey: Record<string, unknown> }>("POST", `/api/keys/${enc(keyId)}/rotate`, "rotate API key", { gracePeriodMs });
      return data.apiKey;
    },

    async revokeApiKey(keyId: string): Promise<void> {
      await requestVoid("POST", `/api/keys/${enc(keyId)}/revoke`, "revoke API key");
    },

    async enableApiKey(keyId: string): Promise<Record<string, unknown>> {
      const data = await requestJson<{ apiKey: Record<string, unknown> }>("POST", `/api/keys/${enc(keyId)}/enable`, "enable API key");
      return data.apiKey;
    },

    async disableApiKey(keyId: string): Promise<Record<string, unknown>> {
      const data = await requestJson<{ apiKey: Record<string, unknown> }>("POST", `/api/keys/${enc(keyId)}/disable`, "disable API key");
      return data.apiKey;
    },

    async cleanupExpiredApiKeys(): Promise<{ cleaned: number }> {
      const data = await requestJson<{ cleaned: number }>("POST", `/api/keys/cleanup-expired`, "cleanup expired API keys");
      return { cleaned: data.cleaned };
    },

    // ─── Saved Views ─────────────────────────────────────────────────────

    async listSavedViews(createdBy?: string): Promise<import("../shared/types.js").SavedView[]> {
      const params = new URLSearchParams();
      if (createdBy) params.set("createdBy", createdBy);
      const data = await requestJson<{ views: import("../shared/types.js").SavedView[] }>("GET", `/api/saved-views${params.toString() ? `?${params.toString()}` : ""}`, "list saved views");
      return data.views;
    },

    async getSavedView(viewId: string): Promise<import("../shared/types.js").SavedView> {
      return await requestJson<import("../shared/types.js").SavedView>("GET", `/api/saved-views/${enc(viewId)}`, "get saved view");
    },

    async createSavedView(name: string, filters: Record<string, unknown>): Promise<import("../shared/types.js").SavedView> {
      return await requestJson<import("../shared/types.js").SavedView>("POST", `/api/saved-views`, "create saved view", { name, filters });
    },

    async updateSavedView(viewId: string, updates: { name?: string; filters?: Record<string, unknown> }): Promise<import("../shared/types.js").SavedView> {
      return await requestJson<import("../shared/types.js").SavedView>("PUT", `/api/saved-views/${enc(viewId)}`, "update saved view", updates);
    },

    async deleteSavedView(viewId: string): Promise<void> {
      await requestVoid("DELETE", `/api/saved-views/${enc(viewId)}`, "delete saved view");
    },

    async applySavedView(viewId: string): Promise<Task[]> {
      // Step 1: Get the saved view and its filters
      const view = await requestJson<import("../shared/types.js").SavedView>(
        "GET",
        `/api/saved-views/${enc(viewId)}`,
        "get saved view",
      );
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
      const data = await requestJson<{ tasks: Task[] }>(
        "GET",
        `/api/tasks/search${qs ? `?${qs}` : ""}`,
        "search tasks",
      );
      return data.tasks;
    },

    async resetStaleTasks(timeoutMs?: number): Promise<{ resetCount: number }> {
      return await requestJson<{ resetCount: number }>("POST", `/api/tasks/reset-stale`, "reset stale tasks", { timeoutMs });
    },

    async cleanupProcessedEvents(retentionDays?: number): Promise<{ deletedCount: number }> {
      return await requestJson<{ deletedCount: number }>("POST", `/api/tasks/cleanup-events`, "cleanup processed events", { retentionDays });
    },

    async watchTask(taskId: string): Promise<TaskWatcher> {
      const data = await requestJson<{ watcher: TaskWatcher }>("POST", `/api/tasks/${enc(taskId)}/watchers`, "watch task");
      return data.watcher;
    },

    async unwatchTask(taskId: string): Promise<{ removed: boolean }> {
      return await requestJson<{ removed: boolean }>("DELETE", `/api/tasks/${enc(taskId)}/watchers`, "unwatch task");
    },

    async listTaskWatchers(taskId: string): Promise<TaskWatcher[]> {
      const data = await requestJson<{ watchers: TaskWatcher[] }>("GET", `/api/tasks/${enc(taskId)}/watchers`, "list task watchers");
      return data.watchers;
    },

    // Time entry methods
    async listTimeEntries(taskId: string): Promise<import("../shared/types.js").TimeEntry[]> {
      const data = await requestJson<{ entries: import("../shared/types.js").TimeEntry[] }>("GET", `/api/tasks/${enc(taskId)}/time-entries`, "list time entries");
      return data.entries;
    },

    async createTimeEntry(taskId: string, opts: { startedAt?: string; endedAt?: string; durationMinutes?: number; description?: string; loggedBy?: string }): Promise<import("../shared/types.js").TimeEntry> {
      const data = await requestJson<{ entry: import("../shared/types.js").TimeEntry }>("POST", `/api/tasks/${enc(taskId)}/time-entries`, "create time entry", opts);
      return data.entry;
    },

    async startTimeEntry(taskId: string, description?: string): Promise<import("../shared/types.js").TimeEntry> {
      const data = await requestJson<{ entry: import("../shared/types.js").TimeEntry }>("POST", `/api/tasks/${enc(taskId)}/time-entries/start`, "start time tracking", { description });
      return data.entry;
    },

    async stopTimeEntry(taskId: string, entryId: string): Promise<import("../shared/types.js").TimeEntry> {
      const data = await requestJson<{ entry: import("../shared/types.js").TimeEntry }>("POST", `/api/tasks/${enc(taskId)}/time-entries/stop`, "stop time tracking", { entryId });
      return data.entry;
    },

    async deleteTimeEntry(taskId: string, entryId: string): Promise<void> {
      await requestVoid("DELETE", `/api/tasks/${enc(taskId)}/time-entries/${enc(entryId)}`, "delete time entry");
    },

    async getTimeTrackingStats(): Promise<import("../shared/types.js").TimeTrackingSummary> {
      return await requestJson<import("../shared/types.js").TimeTrackingSummary>("GET", `/api/stats/time-tracking`, "get time tracking stats");
    },

    async getActivityFeed(taskId: string, limit?: number): Promise<import("../shared/types.js").ActivityFeedItem[]> {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const data = await requestJson<{ items: import("../shared/types.js").ActivityFeedItem[] }>("GET", `/api/tasks/${enc(taskId)}/activity${qs ? "?" + qs : ""}`, "get activity feed");
      return data.items;
    },

    // Cycle (sprint) methods
    async listCycles(status?: import("../shared/types.js").CycleStatus): Promise<import("../shared/types.js").CycleSummary[]> {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const qs = params.toString();
      const data = await requestJson<{ cycles: import("../shared/types.js").CycleSummary[] }>("GET", `/api/cycles${qs ? "?" + qs : ""}`, "list cycles");
      return data.cycles;
    },

    async getCycle(cycleId: string): Promise<import("../shared/types.js").CycleSummary> {
      const data = await requestJson<{ cycle: import("../shared/types.js").CycleSummary }>("GET", `/api/cycles/${enc(cycleId)}`, "get cycle");
      return data.cycle;
    },

    async createCycle(data: { name: string; description?: string; startDate: string; endDate: string }): Promise<import("../shared/types.js").Cycle> {
      const result = await requestJson<{ cycle: import("../shared/types.js").Cycle }>("POST", `/api/cycles`, "create cycle", data);
      return result.cycle;
    },

    async updateCycle(cycleId: string, updates: Record<string, unknown>): Promise<import("../shared/types.js").Cycle> {
      const result = await requestJson<{ cycle: import("../shared/types.js").Cycle }>("PUT", `/api/cycles/${enc(cycleId)}`, "update cycle", updates);
      return result.cycle;
    },

    async deleteCycle(cycleId: string): Promise<void> {
      await requestVoid("DELETE", `/api/cycles/${enc(cycleId)}`, "delete cycle");
    },

    async addTaskToCycle(taskId: string, cycleId: string): Promise<import("../shared/types.js").Task> {
      const data = await requestJson<{ task: import("../shared/types.js").Task }>("POST", `/api/cycles/${enc(cycleId)}/tasks`, "add task to cycle", { taskId });
      return data.task;
    },

    async removeTaskFromCycle(taskId: string): Promise<import("../shared/types.js").Task> {
      const data = await requestJson<{ task: import("../shared/types.js").Task }>("DELETE", `/api/cycles/tasks/${enc(taskId)}`, "remove task from cycle");
      return data.task;
    },

    async listCycleTasks(cycleId: string): Promise<import("../shared/types.js").Task[]> {
      const data = await requestJson<{ tasks: import("../shared/types.js").Task[] }>("GET", `/api/cycles/${enc(cycleId)}/tasks`, "list cycle tasks");
      return data.tasks;
    },

    async getCycleProgress(cycleId: string): Promise<import("../shared/types.js").CycleProgress> {
      const data = await requestJson<{ progress: import("../shared/types.js").CycleProgress }>("GET", `/api/cycles/${enc(cycleId)}/progress`, "get cycle progress");
      return data.progress;
    },

    async getGlobalActivity(limit?: number): Promise<import("../shared/types.js").ActivityFeedItem[]> {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set("limit", String(limit));
      const qs = params.toString();
      const data = await requestJson<{ items: import("../shared/types.js").ActivityFeedItem[] }>("GET", `/api/activity${qs ? "?" + qs : ""}`, "get global activity");
      return data.items;
    },

    // Module (epic) methods
    async listModules(status?: import("../shared/types.js").ModuleStatus): Promise<import("../shared/types.js").ModuleWithProgress[]> {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const qs = params.toString();
      const data = await requestJson<{ modules: import("../shared/types.js").ModuleWithProgress[] }>("GET", `/api/modules${qs ? "?" + qs : ""}`, "list modules");
      return data.modules;
    },

    async getModule(moduleId: string): Promise<import("../shared/types.js").ModuleWithProgress> {
      const data = await requestJson<{ module: import("../shared/types.js").ModuleWithProgress }>("GET", `/api/modules/${enc(moduleId)}`, "get module");
      return data.module;
    },

    async createModule(data: { name: string; description?: string; startDate?: string; endDate?: string }): Promise<import("../shared/types.js").Module> {
      const result = await requestJson<{ module: import("../shared/types.js").Module }>("POST", `/api/modules`, "create module", data);
      return result.module;
    },

    async updateModule(moduleId: string, updates: Record<string, unknown>): Promise<import("../shared/types.js").Module> {
      const result = await requestJson<{ module: import("../shared/types.js").Module }>("PUT", `/api/modules/${enc(moduleId)}`, "update module", updates);
      return result.module;
    },

    async deleteModule(moduleId: string): Promise<void> {
      await requestVoid("DELETE", `/api/modules/${enc(moduleId)}`, "delete module");
    },

    async addTaskToModule(taskId: string, moduleId: string): Promise<import("../shared/types.js").Task> {
      const data = await requestJson<{ task: import("../shared/types.js").Task }>("POST", `/api/modules/${enc(moduleId)}/tasks`, "add task to module", { taskId });
      return data.task;
    },

    async removeTaskFromModule(taskId: string): Promise<import("../shared/types.js").Task> {
      // We'll fetch the task first to find its moduleId
      const taskData = await requestJson<{ task: import("../shared/types.js").Task }>(
        "GET",
        `/api/tasks/${enc(taskId)}`,
        "get task",
      );
      const moduleId = taskData.task.moduleId;
      if (!moduleId) {
        throw new Error("Task is not assigned to any module");
      }
      const data = await requestJson<{ task: import("../shared/types.js").Task }>(
        "DELETE",
        `/api/modules/${enc(moduleId)}/tasks/${enc(taskId)}`,
        "remove task from module",
      );
      return data.task;
    },

    async listModuleTasks(moduleId: string): Promise<import("../shared/types.js").Task[]> {
      const data = await requestJson<{ tasks: import("../shared/types.js").Task[] }>("GET", `/api/modules/${enc(moduleId)}/tasks`, "list module tasks");
      return data.tasks;
    },

    async getAuditCount(): Promise<number> {
      const data = await requestJson<{ count: number }>("GET", `/api/audit/count`, "get audit count");
      return data.count;
    },

    async cleanupAuditLog(retentionDays?: number): Promise<{ deletedCount: number }> {
      const data = await requestJson<{ ok: boolean; deletedCount: number }>("POST", `/api/audit/cleanup`, "cleanup audit log", { retentionDays });
      return { deletedCount: data.deletedCount };
    },

    async updateTaskCard(taskId: string, markdown: string, title?: string, color?: string): Promise<{ success: boolean; messageId: string }> {
      const data = await requestJson<{ success: boolean; messageId: string }>("PUT", `/api/tasks/${enc(taskId)}/card`, "update task card", { markdown, title, color });
      return { success: data.success, messageId: data.messageId };
    },

    // Task links
    async listTaskLinks(taskId: string): Promise<import("../shared/types.js").TaskLink[]> {
      const data = await requestJson<{ links: import("../shared/types.js").TaskLink[] }>("GET", `/api/tasks/${enc(taskId)}/links`, "list task links");
      return data.links;
    },

    async addTaskLink(taskId: string, title: string, url: string): Promise<import("../shared/types.js").TaskLink> {
      const data = await requestJson<{ link: import("../shared/types.js").TaskLink }>("POST", `/api/tasks/${enc(taskId)}/links`, "add task link", { title, url });
      return data.link;
    },

    async deleteTaskLink(taskId: string, linkId: number): Promise<void> {
      await requestVoid("DELETE", `/api/tasks/${enc(taskId)}/links/${enc(linkId)}`, "delete task link");
    },
  };
}
