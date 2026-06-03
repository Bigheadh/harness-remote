import type { Task, TaskStatus, AuditLogEntry, AuditLogSearchOptions } from "../shared/types.js";
import type { TaskComment, TaskNote, TaskTemplate, ScheduledTask, ScheduleFrequency } from "../shared/types.js";
import type { SlaPolicy, SlaBreachLog, SlaSummary } from "../shared/types.js";

export interface TaskApiClient {
  listTasks(status?: TaskStatus, limit?: number, deviceId?: string): Promise<Task[]>;
  searchTasks(options: {
    q?: string;
    status?: TaskStatus;
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
  listOverdueTasks(): Promise<Task[]>;
  listComments(taskId: string): Promise<TaskComment[]>;
  addComment(taskId: string, author: string, body: string): Promise<TaskComment>;
  bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }>;
  bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }>;
  bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }>;
  // Template methods
  listTemplates(): Promise<TaskTemplate[]>;
  getTemplate(templateId: string): Promise<TaskTemplate>;
  createTemplate(template: { name: string; description?: string; commandText: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDateOffsetMs?: number; reminderOffsetMs?: number }): Promise<TaskTemplate>;
  updateTemplate(templateId: string, updates: Record<string, unknown>): Promise<TaskTemplate>;
  deleteTemplate(templateId: string): Promise<void>;
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
  // Task lock methods
  lockTask(taskId: string, deviceId?: string, ttlMs?: number): Promise<import("../shared/types.js").TaskLock>;
  unlockTask(taskId: string, deviceId?: string): Promise<void>;
  getTaskLock(taskId: string): Promise<{ locked: boolean; lock: import("../shared/types.js").TaskLock | null }>;
  // Export/Import methods
  exportTasks(): Promise<Record<string, unknown>>;
  importTasks(data: Record<string, unknown>, mode?: string): Promise<{ imported: number; skipped: number; errors: string[] }>;
  // SLA methods
  listSlaPolicies(): Promise<SlaPolicy[]>;
  getSlaPolicy(policyId: string): Promise<SlaPolicy>;
  createSlaPolicy(policy: { name: string; description?: string; targetMinutes: number; warningThresholdPercent?: number; matchPriorities?: string[]; matchTags?: string[]; enabled?: boolean }): Promise<SlaPolicy>;
  updateSlaPolicy(policyId: string, updates: Record<string, unknown>): Promise<SlaPolicy>;
  deleteSlaPolicy(policyId: string): Promise<void>;
  getSlaSummary(): Promise<SlaSummary>;
  listSlaBreaches(): Promise<SlaBreachLog[]>;
  checkSlaBreaches(): Promise<{ warnings: number; breaches: number }>;
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
  // Priority auto-escalation
  escalateOverduePriorities(): Promise<{ escalated: number; tasks: Task[] }>;
  // API usage analytics
  getApiUsageStats(from?: string, to?: string): Promise<Record<string, unknown>>;
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
    async listTasks(status?: TaskStatus, limit?: number, filterDeviceId?: string): Promise<Task[]> {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (limit) params.set("limit", String(limit));
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
      from?: string;
      to?: string;
      limit?: number;
      deviceId?: string;
      tags?: string[];
    }): Promise<Task[]> {
      const params = new URLSearchParams();
      if (options.q) params.set("q", options.q);
      if (options.status) params.set("status", options.status);
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

    async checkSlaBreaches(): Promise<{ warnings: number; breaches: number }> {
      const response = await fetch(`${serverBaseUrl}/api/sla/check`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Failed to check SLA breaches: ${response.status} ${body.error?.message ?? response.statusText}`);
      }
      const data = (await response.json()) as { warnings: number; breaches: number };
      return { warnings: data.warnings, breaches: data.breaches };
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
  };
}
