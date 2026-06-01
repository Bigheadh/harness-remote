import { describe, it, expect, beforeEach } from "vitest";
import { registerMcpTools } from "../../src/mcp-server/tools.js";
import type { TaskApiClient } from "../../src/mcp-server/client.js";
import type { Task, TaskStatus } from "../../src/shared/types.js";

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
    it("registers all 5 tools", () => {
      expect(mockServer.registrations).toHaveLength(5);
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
});
