import { describe, it, expect, beforeEach } from "vitest";
import { registerMcpTools } from "../../src/mcp-server/tools.js";
import type { TaskApiClient } from "../../src/mcp-server/client.js";
import type { Task, TaskStatus, TaskComment } from "../../src/shared/types.js";

// --- Mock TaskApiClient ---
function createMockClient(): TaskApiClient & {
  calls: { method: string; args: unknown[] }[];
  failWith?: string;
} {
  const calls: { method: string; args: unknown[] }[] = [];
  const mock: TaskApiClient & {
    calls: { method: string; args: unknown[] }[];
    failWith?: string;
  } = {
    calls,
    failWith: undefined,

    async listTasks(status?: TaskStatus, limit?: number): Promise<Task[]> {
      calls.push({ method: "listTasks", args: [status, limit] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_001",
          source: "feishu",
          feishuMessageId: "om_test",
          feishuChatId: "oc_test",
          feishuUserId: "ou_test",
          commandText: "帮我检查项目状态",
          status: status ?? "pending",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getTask(taskId: string): Promise<Task> {
      calls.push({ method: "getTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_detail",
        feishuChatId: "oc_detail",
        feishuUserId: "ou_detail",
        commandText: "详细任务",
        status: "pending",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async markTaskRunning(taskId: string): Promise<Task> {
      calls.push({ method: "markTaskRunning", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_running",
        feishuChatId: "oc_running",
        feishuUserId: "ou_running",
        commandText: "运行中任务",
        status: "running",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:01:00.000Z",
      };
    },

    async reportTaskResult(
      taskId: string,
      success: boolean,
      summary: string,
      details?: string,
    ): Promise<Task> {
      calls.push({
        method: "reportTaskResult",
        args: [taskId, success, summary, details],
      });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_result",
        feishuChatId: "oc_result",
        feishuUserId: "ou_result",
        commandText: "结果任务",
        status: success ? "done" : "failed",
        resultSummary: summary,
        resultDetails: details,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:02:00.000Z",
      };
    },

    async replyFeishu(taskId: string, message: string): Promise<void> {
      calls.push({ method: "replyFeishu", args: [taskId, message] });
      if (mock.failWith) throw new Error(mock.failWith);
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
      calls.push({ method: "searchTasks", args: [options] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_search_001",
          source: "feishu",
          feishuMessageId: "om_search",
          feishuChatId: "oc_search",
          feishuUserId: "ou_search",
          commandText: "搜索测试任务",
          status: options.status ?? "done",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
          resultSummary: "搜索结果",
        },
      ];
    },

    async addTags(taskId: string, tags: string[]): Promise<Task> {
      calls.push({ method: "addTags", args: [taskId, tags] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_tags",
        feishuChatId: "oc_tags",
        feishuUserId: "ou_tags",
        commandText: "标签任务",
        status: "pending",
        tags,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async removeTag(taskId: string, tag: string): Promise<Task> {
      calls.push({ method: "removeTag", args: [taskId, tag] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_tags",
        feishuChatId: "oc_tags",
        feishuUserId: "ou_tags",
        commandText: "标签任务",
        status: "pending",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async listAllTags(): Promise<string[]> {
      calls.push({ method: "listAllTags", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return ["bug", "feature", "urgent"];
    },

    async setDueDate(taskId: string, dueDate: string | null): Promise<Task> {
      calls.push({ method: "setDueDate", args: [taskId, dueDate] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_due",
        feishuChatId: "oc_due",
        feishuUserId: "ou_due",
        commandText: "截止日期任务",
        status: "pending",
        dueDate: dueDate ?? undefined,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async setReminder(taskId: string, reminderAt: string | null): Promise<Task> {
      calls.push({ method: "setReminder", args: [taskId, reminderAt] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_remind",
        feishuChatId: "oc_remind",
        feishuUserId: "ou_remind",
        commandText: "提醒任务",
        status: "pending",
        reminderAt: reminderAt ?? undefined,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async listOverdueTasks(): Promise<Task[]> {
      calls.push({ method: "listOverdueTasks", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_overdue_001",
          source: "feishu",
          feishuMessageId: "om_overdue",
          feishuChatId: "oc_overdue",
          feishuUserId: "ou_overdue",
          commandText: "逾期任务",
          status: "pending",
          dueDate: "2026-05-01T00:00:00.000Z",
          createdAt: "2026-04-01T12:00:00.000Z",
          updatedAt: "2026-04-01T12:00:00.000Z",
        },
      ];
    },

    async listComments(taskId: string): Promise<TaskComment[]> {
      calls.push({ method: "listComments", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: 1,
          taskId,
          author: "test-user",
          authorType: "api",
          body: "Test comment",
          createdAt: "2026-06-02T12:00:00.000Z",
        },
      ];
    },

    async addComment(taskId: string, author: string, body: string): Promise<TaskComment> {
      calls.push({ method: "addComment", args: [taskId, author, body] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: 42,
        taskId,
        author,
        authorType: "api",
        body,
        createdAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async registerDevice(name: string, capabilities?: string): Promise<{ id: string; token: string }> {
      calls.push({ method: "registerDevice", args: [name, capabilities] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { id: "dev_001", token: "tok_test" };
    },

    async queryAuditLog(options: { action?: string; taskId?: string; actor?: string; actorType?: string; from?: string; to?: string; limit?: number }): Promise<import("../../src/shared/types.js").AuditLogEntry[]> {
      calls.push({ method: "queryAuditLog", args: [options] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [];
    },

    async bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }> {
      calls.push({ method: "bulkUpdateStatus", args: [ids, status] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { updated: ids.length, errors: [] };
    },

    async bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }> {
      calls.push({ method: "bulkAssign", args: [ids, deviceId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { updated: ids.length, errors: [] };
    },

    async bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
      calls.push({ method: "bulkDelete", args: [ids] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { deleted: ids.length, errors: [] };
    },
  };
  return mock;
}

// --- Mock McpServer to capture tool registrations ---
interface ToolRegistration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
}

function createMockServer(): {
  registrations: ToolRegistration[];
  registerTool: (
    name: string,
    opts: { description: string; inputSchema: Record<string, unknown> },
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ) => void;
} {
  const registrations: ToolRegistration[] = [];
  return {
    registrations,
    registerTool: (
      name: string,
      opts: { description: string; inputSchema: Record<string, unknown> },
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      registrations.push({
        name,
        description: opts.description,
        inputSchema: opts.inputSchema,
        handler: handler as ToolRegistration["handler"],
      });
    },
  };
}

// --- Tests ---
describe("MCP tools", () => {
  let mock: ReturnType<typeof createMockClient>;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    mock = createMockClient();
    mockServer = createMockServer();
    registerMcpTools(mockServer as never, mock);
  });

  describe("tool registration", () => {
    it("registers all 17 tools", () => {
      expect(mockServer.registrations).toHaveLength(17);
    });

    it("registers list_tasks with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_tasks");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("List tasks");
    });

    it("registers get_task with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_task");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Get details");
    });

    it("registers mark_task_running with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "mark_task_running");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("running");
    });

    it("registers report_task_result with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("result");
    });

    it("registers reply_feishu with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "reply_feishu");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("reply");
    });

    it("registers search_tasks with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Search task history");
    });
  });

  describe("list_tasks handler", () => {
    it("calls client.listTasks with default parameters", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_tasks")!;
      const result = await tool.handler({});

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("listTasks");
      expect(mock.calls[0].args[0]).toBeUndefined();
      expect(mock.calls[0].args[1]).toBeUndefined();

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].id).toBe("task_001");
    });

    it("passes status and limit to client", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_tasks")!;
      await tool.handler({ status: "running", limit: 5 });

      expect(mock.calls[0].method).toBe("listTasks");
      expect(mock.calls[0].args[0]).toBe("running");
      expect(mock.calls[0].args[1]).toBe(5);
    });

    it("returns error when client throws", async () => {
      mock.failWith = "Server unreachable";
      const tool = mockServer.registrations.find((r) => r.name === "list_tasks")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server unreachable");
    });
  });

  describe("get_task handler", () => {
    it("returns task details for a valid taskId", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_task")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(mock.calls[0].method).toBe("getTask");
      expect(mock.calls[0].args[0]).toBe("task_001");

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBeDefined();
      expect(parsed.task.id).toBe("task_001");
    });

    it("returns error when task not found", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "get_task")!;
      const result = await tool.handler({ taskId: "nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Task not found");
    });
  });

  describe("mark_task_running handler", () => {
    it("marks a task as running", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "mark_task_running")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(mock.calls[0].method).toBe("markTaskRunning");
      expect(mock.calls[0].args[0]).toBe("task_001");

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBeDefined();
      expect(parsed.task.status).toBe("running");
    });

    it("returns error on invalid status transition", async () => {
      mock.failWith = "Invalid status transition";
      const tool = mockServer.registrations.find((r) => r.name === "mark_task_running")!;
      const result = await tool.handler({ taskId: "task_done" });

      expect(result.isError).toBe(true);
    });
  });

  describe("report_task_result handler", () => {
    it("reports successful result with all fields", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result")!;
      const result = await tool.handler({
        taskId: "task_001",
        success: true,
        summary: "处理完成",
        details: "使用快排算法",
      });

      expect(mock.calls[0].method).toBe("reportTaskResult");
      const args = mock.calls[0].args;
      expect(args[0]).toBe("task_001");
      expect(args[1]).toBe(true);
      expect(args[2]).toBe("处理完成");
      expect(args[3]).toBe("使用快排算法");

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.status).toBe("done");
      expect(parsed.task.resultSummary).toBe("处理完成");
    });

    it("reports failed result", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result")!;
      const result = await tool.handler({
        taskId: "task_001",
        success: false,
        summary: "执行失败",
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.status).toBe("failed");
    });

    it("handles result without details", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result")!;
      await tool.handler({
        taskId: "task_001",
        success: true,
        summary: "完成",
      });

      const args = mock.calls[0].args;
      expect(args[3]).toBeUndefined();
    });

    it("returns error on report failure", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result")!;
      const result = await tool.handler({
        taskId: "nonexistent",
        success: true,
        summary: "done",
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("reply_feishu handler", () => {
    it("sends a reply to Feishu", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "reply_feishu")!;
      const result = await tool.handler({
        taskId: "task_001",
        message: "我已收到任务，稍后处理。",
      });

      expect(mock.calls[0].method).toBe("replyFeishu");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toBe("我已收到任务，稍后处理。");

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ok).toBe(true);
    });

    it("returns error on reply failure", async () => {
      mock.failWith = "Feishu API error";
      const tool = mockServer.registrations.find((r) => r.name === "reply_feishu")!;
      const result = await tool.handler({
        taskId: "task_001",
        message: "测试回复",
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Feishu API error");
    });
  });

  describe("search_tasks handler", () => {
    it("calls client.searchTasks with text query", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks")!;
      const result = await tool.handler({ q: "检查" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("searchTasks");
      expect(mock.calls[0].args[0]).toEqual({ q: "检查" });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.count).toBe(1);
    });

    it("passes all filter options to client", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks")!;
      const result = await tool.handler({
        q: "deploy",
        status: "done",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.000Z",
        limit: 10,
      });

      expect(mock.calls[0].args[0]).toEqual({
        q: "deploy",
        status: "done",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.000Z",
        limit: 10,
      });

      expect(result.isError).toBeFalsy();
    });

    it("returns error when client throws", async () => {
      mock.failWith = "Search failed";
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks")!;
      const result = await tool.handler({ q: "test" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Search failed");
    });

    it("passes tags filter to client", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks")!;
      await tool.handler({ tags: ["bug", "urgent"] });

      expect(mock.calls[0].args[0]).toHaveProperty("tags", ["bug", "urgent"]);
    });
  });

  describe("manage_task_tags handler", () => {
    it("registers manage_task_tags with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Manage tags");
    });

    it("lists all tags", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "list" });

      expect(mock.calls[0].method).toBe("listAllTags");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tags).toEqual(["bug", "feature", "urgent"]);
      expect(parsed.count).toBe(3);
    });

    it("adds tags to a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({
        action: "add",
        taskId: "task_001",
        tags: ["bug", "critical"],
      });

      expect(mock.calls[0].method).toBe("addTags");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toEqual(["bug", "critical"]);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBeDefined();
      expect(parsed.message).toContain("bug");
    });

    it("removes a tag from a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({
        action: "remove",
        taskId: "task_001",
        tag: "bug",
      });

      expect(mock.calls[0].method).toBe("removeTag");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toBe("bug");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBeDefined();
      expect(parsed.message).toContain("bug");
    });

    it("returns error when add action missing taskId", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "add", tags: ["bug"] });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("taskId is required");
    });

    it("returns error when add action missing tags", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "add", taskId: "task_001" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("tags array is required");
    });

    it("returns error when remove action missing tag", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "remove", taskId: "task_001" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("tag is required");
    });

    it("returns error on client failure", async () => {
      mock.failWith = "Server error";
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "list" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server error");
    });
  });

  describe("comment tools", () => {
    it("registers add_task_comment tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "add_task_comment");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("comment");
    });

    it("registers list_task_comments tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_task_comments");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("comment");
    });

    it("adds a comment to a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "add_task_comment")!;
      const result = await tool.handler({ taskId: "task_001", body: "This is a test comment" });

      expect(mock.calls[0].method).toBe("addComment");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[2]).toBe("This is a test comment");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.comment).toBeDefined();
      expect(parsed.comment.id).toBe(42);
      expect(parsed.message).toContain("Comment added");
    });

    it("returns error when add_comment fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "add_task_comment")!;
      const result = await tool.handler({ taskId: "task_nonexistent", body: "test" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Task not found");
    });

    it("lists comments for a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_task_comments")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(mock.calls[0].method).toBe("listComments");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.comments).toHaveLength(1);
      expect(parsed.comments[0].body).toBe("Test comment");
      expect(parsed.count).toBe(1);
    });

    it("returns error when list_comments fails", async () => {
      mock.failWith = "Server error";
      const tool = mockServer.registrations.find((r) => r.name === "list_task_comments")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server error");
    });
  });
});
