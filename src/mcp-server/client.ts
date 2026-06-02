import type { Task, TaskStatus, AuditLogEntry, AuditLogSearchOptions } from "../shared/types.js";

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
  };
}
