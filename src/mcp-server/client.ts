import type { Task, TaskStatus, AuditLogEntry, AuditLogSearchOptions } from "../shared/types.js";
import type { TaskComment, TaskTemplate, ScheduledTask, ScheduleFrequency } from "../shared/types.js";

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
  };
}
