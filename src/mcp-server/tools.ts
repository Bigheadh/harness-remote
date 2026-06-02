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
      description: "List tasks from the server. Returns pending tasks by default, sorted by priority (urgent first). If deviceId is configured, only returns tasks assigned to this device or unassigned tasks.",
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
        deviceId: z
          .string()
          .optional()
          .describe("Filter by assigned device ID. If not provided, uses the configured deviceId."),
      },
    },
    async (args) => {
      const { status, limit, deviceId } = args;

      try {
        const tasks = await client.listTasks(status, limit, deviceId);
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

  // search_tasks tool
  server.registerTool(
    "search_tasks",
    {
      description:
        "Search task history by text, status, date range, and tags. Returns matching tasks sorted by creation time (newest first).",
      inputSchema: {
        q: z
          .string()
          .optional()
          .describe("Full-text search on task command text and result summary"),
        status: z
          .enum(["pending", "picked", "running", "done", "failed"])
          .optional()
          .describe("Filter by task status"),
        from: z
          .string()
          .optional()
          .describe("ISO 8601 date string — only return tasks created on or after this date"),
        to: z
          .string()
          .optional()
          .describe("ISO 8601 date string — only return tasks created on or before this date"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of results. Default: 20, max: 100"),
        deviceId: z
          .string()
          .optional()
          .describe("Filter by assigned device ID"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Filter by tags (all specified tags must match)"),
      },
    },
    async (args) => {
      const { q, status, from, to, limit, deviceId, tags } = args;

      try {
        const tasks = await client.searchTasks({ q, status, from, to, limit, deviceId, tags });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ tasks, count: tasks.length }, null, 2),
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

  // register_device tool
  // register_device tool
  server.registerTool(
    "register_device",
    {
      description: "Register this MCP server instance as a device. Returns a device ID and token. Use this to set up multi-device task routing.",
      inputSchema: {
        name: z
          .string()
          .describe("A human-readable name for this device (e.g., 'office-desktop', 'laptop-dev')"),
        capabilities: z
          .string()
          .optional()
          .describe("Optional comma-separated capabilities (e.g., 'frontend,react,node')"),
      },
    },
    async (args) => {
      const { name, capabilities } = args;

      try {
        const device = await client.registerDevice(name, capabilities);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                device,
                message: `Device registered successfully. Save the token securely — it's needed for MCP config.`,
              }, null, 2),
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

  // query_audit_log tool
  server.registerTool(
    "query_audit_log",
    {
      description:
        "Query the audit log to see who did what and when. Returns audit entries sorted by time (newest first). Useful for tracking task lifecycle, user actions, and system events.",
      inputSchema: {
        action: z
          .string()
          .optional()
          .describe("Filter by action type (e.g., 'task.created', 'task.status_changed', 'task.result_reported')"),
        taskId: z
          .string()
          .optional()
          .describe("Filter by task ID to see all audit entries for a specific task"),
        actor: z
          .string()
          .optional()
          .describe("Filter by actor (user ID, device ID, or 'system')"),
        actorType: z
          .enum(["feishu", "device", "api", "system"])
          .optional()
          .describe("Filter by actor type"),
        from: z
          .string()
          .optional()
          .describe("ISO 8601 date string — only return entries on or after this date"),
        to: z
          .string()
          .optional()
          .describe("ISO 8601 date string — only return entries on or before this date"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum number of results. Default: 50, max: 200"),
      },
    },
    async (args) => {
      const { action, taskId, actor, actorType, from, to, limit } = args;

      try {
        const entries = await client.queryAuditLog({ action, taskId, actor, actorType, from, to, limit });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ entries, count: entries.length }, null, 2),
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

  // manage_task_tags tool
  server.registerTool(
    "manage_task_tags",
    {
      description:
        "Manage tags on a task. Supports adding tags, removing a tag, or listing all tags. Use action 'add' to add tags, 'remove' to remove a tag, or 'list' to get all unique tags in the system.",
      inputSchema: {
        action: z
          .enum(["add", "remove", "list"])
          .describe("The tag action to perform"),
        taskId: z
          .string()
          .optional()
          .describe("The task ID (required for add/remove actions)"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags to add (required for 'add' action)"),
        tag: z
          .string()
          .optional()
          .describe("Tag to remove (required for 'remove' action)"),
      },
    },
    async (args) => {
      const { action, taskId, tags, tag } = args;

      try {
        if (action === "list") {
          const allTags = await client.listAllTags();
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ tags: allTags, count: allTags.length }, null, 2),
              },
            ],
          };
        }

        if (action === "add") {
          if (!taskId) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "taskId is required for 'add' action" }) }],
              isError: true,
            };
          }
          if (!tags || tags.length === 0) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "tags array is required for 'add' action" }) }],
              isError: true,
            };
          }
          const task = await client.addTags(taskId, tags);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ task, message: `Added tags: ${tags.join(", ")}` }, null, 2),
              },
            ],
          };
        }

        if (action === "remove") {
          if (!taskId) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "taskId is required for 'remove' action" }) }],
              isError: true,
            };
          }
          if (!tag) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "tag is required for 'remove' action" }) }],
              isError: true,
            };
          }
          const task = await client.removeTag(taskId, tag);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ task, message: `Removed tag: ${tag}` }, null, 2),
              },
            ],
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown action: ${action}` }) }],
          isError: true,
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
