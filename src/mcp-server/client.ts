import type { Task, TaskStatus } from "../shared/types.js";

export interface TaskApiClient {
  listTasks(status?: TaskStatus, limit?: number): Promise<Task[]>;
  searchTasks(options: {
    q?: string;
    status?: TaskStatus;
    from?: string;
    to?: string;
    limit?: number;
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
}

export function createTaskApiClient(
  serverBaseUrl: string,
  personalToken: string,
): TaskApiClient {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${personalToken}`,
  };

  return {
    async listTasks(status?: TaskStatus, limit?: number): Promise<Task[]> {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (limit) params.set("limit", String(limit));

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
    }): Promise<Task[]> {
      const params = new URLSearchParams();
      if (options.q) params.set("q", options.q);
      if (options.status) params.set("status", options.status);
      if (options.from) params.set("from", options.from);
      if (options.to) params.set("to", options.to);
      if (options.limit) params.set("limit", String(options.limit));

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
  };
}
