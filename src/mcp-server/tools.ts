import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { TaskApiClient } from "./client.js";

export function registerMcpTools(
  server: McpServer,
  client: TaskApiClient,
): void {
  // list_tasks tool
  server.registerTool(
    "list_tasks",
    {
      description: "List tasks from the server. Returns pending tasks by default.",
      inputSchema: {
        status: z
          .enum(["pending", "picked", "running", "done", "failed"])
          .optional()
          .describe("Filter by task status. Default: pending"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of tasks to return. Default: 20, max: 100"),
      },
    },
    async (args) => {
      const { status, limit } = args;

      try {
        const tasks = await client.listTasks(status, limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ tasks }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // get_task tool
  server.registerTool(
    "get_task",
    {
      description: "Get details of a specific task by ID.",
      inputSchema: {
        taskId: z.string().describe("The task ID to retrieve"),
      },
    },
    async (args) => {
      const { taskId } = args;

      try {
        const task = await client.getTask(taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // mark_task_running tool
  server.registerTool(
    "mark_task_running",
    {
      description:
        "Mark a task as running. The task must be in pending or picked status.",
      inputSchema: {
        taskId: z.string().describe("The task ID to mark as running"),
      },
    },
    async (args) => {
      const { taskId } = args;

      try {
        const task = await client.markTaskRunning(taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // report_task_result tool
  server.registerTool(
    "report_task_result",
    {
      description:
        "Report the result of a task. This will update the task status and reply to Feishu.",
      inputSchema: {
        taskId: z.string().describe("The task ID to report results for"),
        success: z
          .boolean()
          .describe("Whether the task was completed successfully"),
        summary: z.string().describe("A brief summary of the result"),
        details: z
          .string()
          .optional()
          .describe("Optional detailed description of the result"),
      },
    },
    async (args) => {
      const { taskId, success, summary, details } = args;

      try {
        const task = await client.reportTaskResult(
          taskId,
          success,
          summary,
          details,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // reply_feishu tool
  server.registerTool(
    "reply_feishu",
    {
      description:
        "Send a reply to the original Feishu conversation for a task.",
      inputSchema: {
        taskId: z.string().describe("The task ID to reply to"),
        message: z.string().describe("The message text to send"),
      },
    },
    async (args) => {
      const { taskId, message } = args;

      try {
        await client.replyFeishu(taskId, message);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true }),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
