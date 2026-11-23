import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { TaskApiClient } from "../client.js";

export function registerCoreTaskTools(server: McpServer, client: TaskApiClient): void {
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
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("Filter by task priority."),
      },
    },
    async (args) => {
      const { status, limit, deviceId, priority } = args;

      try {
        const tasks = await client.listTasks(status, limit, deviceId, priority);
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
        "Search task history by text, status, priority, date range, tags, source, cycle, and module. Text search covers command text, description, and result summary. Returns matching tasks sorted by creation time (newest first).",
      inputSchema: {
        q: z
          .string()
          .optional()
          .describe("Full-text search on task command text, description, and result summary"),
        status: z
          .enum(["pending", "picked", "running", "done", "failed"])
          .optional()
          .describe("Filter by task status"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("Filter by task priority"),
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
        cycleId: z
          .string()
          .optional()
          .describe("Filter by cycle (sprint) ID — only return tasks in this cycle"),
        moduleId: z
          .string()
          .optional()
          .describe("Filter by module (epic) ID — only return tasks in this module"),
        source: z
          .enum(["feishu", "web", "mcp"])
          .optional()
          .describe("Filter by task origin source (feishu, web, or mcp)"),
      },
    },
    async (args) => {
      const { q, status, priority, from, to, limit, deviceId, tags, cycleId, moduleId, source } = args;

      try {
        const tasks = await client.searchTasks({ q, status, priority, from, to, limit, deviceId, tags, cycleId, moduleId, source });
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

  // set_task_due_date tool
  server.registerTool(
    "set_task_due_date",
    {
      description:
        "Set or clear the due date for a task. Pass a valid ISO 8601 date string to set, or null to clear. Tasks with due dates that are past their deadline appear in overdue queries.",
      inputSchema: {
        taskId: z.string().describe("The task ID to set the due date for"),
        dueDate: z
          .string()
          .nullable()
          .describe("ISO 8601 date string (e.g., '2026-06-15' or '2026-06-15T14:00:00Z') or null to clear the due date"),
      },
    },
    async (args) => {
      const { taskId, dueDate } = args;

      try {
        const task = await client.setDueDate(taskId, dueDate);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: dueDate
                  ? `Due date set to ${dueDate}`
                  : "Due date cleared",
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

  // set_task_description tool
  server.registerTool(
    "set_task_description",
    {
      description:
        "Set or clear a structured description for a task. Use this to provide context beyond the raw command text — explain what the task is about, acceptance criteria, or relevant background. Pass null to clear.",
      inputSchema: {
        taskId: z.string().describe("The task ID to set the description for"),
        description: z
          .string()
          .nullable()
          .describe("Structured task description (e.g., 'Deploy the new API to staging. Verify health endpoint returns 200.') or null to clear"),
      },
    },
    async (args) => {
      const { taskId, description } = args;

      try {
        const task = await client.setTaskDescription(taskId, description);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: description
                  ? `Description set (${description.length} chars)`
                  : "Description cleared",
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

  // set_task_priority tool
  server.registerTool(
    "set_task_priority",
    {
      description:
        "Set the priority of a task. Priority affects task ordering in listings and can trigger auto-escalation for overdue tasks. Valid values: low, normal, high, urgent.",
      inputSchema: {
        taskId: z.string().describe("The task ID to set the priority for"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .describe("The new priority level: low, normal, high, or urgent"),
      },
    },
    async (args) => {
      const { taskId, priority } = args;

      try {
        const task = await client.setPriority(taskId, priority);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Priority set to ${priority}`,
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

  // list_overdue_tasks tool
  server.registerTool(
    "list_overdue_tasks",
    {
      description:
        "List all tasks that are past their due date and still active (pending, picked, or running). Returns tasks sorted by due date (earliest overdue first). Use this to check for deadline violations.",
      inputSchema: {},
    },
    async () => {
      try {
        const tasks = await client.listOverdueTasks();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                tasks,
                count: tasks.length,
                message: tasks.length === 0
                  ? "No overdue tasks"
                  : `${tasks.length} task(s) overdue`,
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

  // manage_task_tags tool
  server.registerTool(
    "manage_task_tags",
    {
      description:
        "Manage tags on tasks. Supports adding/removing tags on single or multiple tasks, or listing all tags. Use action 'add' for single task add, 'remove' for single task remove, 'bulk_add' to add tags to multiple tasks, 'bulk_remove' to remove a tag from multiple tasks, or 'list' to get all unique tags.",
      inputSchema: {
        action: z
          .enum(["add", "remove", "list", "bulk_add", "bulk_remove"])
          .describe("The tag action to perform"),
        taskId: z
          .string()
          .optional()
          .describe("The task ID (required for add/remove actions)"),
        taskIds: z
          .array(z.string())
          .optional()
          .describe("Array of task IDs (required for bulk_add/bulk_remove actions)"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags to add (required for 'add' and 'bulk_add' actions)"),
        tag: z
          .string()
          .optional()
          .describe("Tag to remove (required for 'remove' and 'bulk_remove' actions)"),
      },
    },
    async (args) => {
      const { action, taskId, taskIds, tags, tag } = args;

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

        if (action === "bulk_add") {
          if (!taskIds || taskIds.length === 0) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "taskIds array is required for 'bulk_add' action" }) }],
              isError: true,
            };
          }
          if (!tags || tags.length === 0) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "tags array is required for 'bulk_add' action" }) }],
              isError: true,
            };
          }
          const result = await client.bulkAddTags(taskIds, tags);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ result, message: `Added tags [${tags.join(", ")}] to ${result.updated} task(s)` }, null, 2),
              },
            ],
          };
        }

        if (action === "bulk_remove") {
          if (!taskIds || taskIds.length === 0) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "taskIds array is required for 'bulk_remove' action" }) }],
              isError: true,
            };
          }
          if (!tag) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "tag is required for 'bulk_remove' action" }) }],
              isError: true,
            };
          }
          const result = await client.bulkRemoveTags(taskIds, tag);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ result, message: `Removed tag '${tag}' from ${result.updated} task(s)` }, null, 2),
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

  // add_task_comment tool
  server.registerTool(
    "add_task_comment",
    {
      description:
        "Add a comment to a task. Comments are used for activity tracking, notes, and discussion on a task. Each comment includes the author and timestamp.",
      inputSchema: {
        taskId: z.string().describe("The task ID to add a comment to"),
        body: z.string().describe("The comment text"),
      },
    },
    async (args) => {
      const { taskId, body } = args;

      try {
        const comment = await client.addComment(taskId, "mcp-user", body);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                comment,
                message: `Comment added (id: ${comment.id})`,
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

  // list_task_comments tool
  server.registerTool(
    "list_task_comments",
    {
      description:
        "List all comments on a task. Returns comments in chronological order (oldest first). Use this to review the activity timeline and discussion on a task.",
      inputSchema: {
        taskId: z.string().describe("The task ID to list comments for"),
      },
    },
    async (args) => {
      const { taskId } = args;

      try {
        const comments = await client.listComments(taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                comments,
                count: comments.length,
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

  // assign_task tool
  server.registerTool(
    "assign_task",
    {
      description:
        "Assign a single task to a specific device. The device must be registered. Returns the updated task with the new assignedDeviceId.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to assign"),
        deviceId: z.string().describe("The ID of the device to assign the task to"),
      },
    },
    async (args) => {
      const { taskId, deviceId } = args;

      try {
        const task = await client.assignTask(taskId, deviceId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task '${task.commandText}' assigned to device '${deviceId}'`,
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

  // unassign_task tool
  server.registerTool(
    "unassign_task",
    {
      description:
        "Unassign a task from its current device. Clears the assignedDeviceId field. Returns the updated task.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to unassign"),
      },
    },
    async (args) => {
      const { taskId } = args;

      try {
        const task = await client.unassignTask(taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task '${task.commandText}' unassigned from device`,
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

  // list_ready_tasks tool
  server.registerTool(
    "list_ready_tasks",
    {
      description:
        "List tasks that are ready for processing — pending tasks with ALL dependencies satisfied. This is the recommended way to pick up work, as it excludes tasks still blocked by prerequisites.",
      inputSchema: {
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
          .describe("Filter by assigned device ID"),
      },
    },
    async (args) => {
      const { limit, deviceId } = args;
      try {
        const tasks = await client.listReadyTasks(limit, deviceId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                tasks,
                count: tasks.length,
                message: tasks.length === 0
                  ? "No tasks ready for processing"
                  : `${tasks.length} task(s) ready — all prerequisites met`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // download_attachment tool
  server.registerTool(
    "download_attachment",
    {
      description:
        "Download a file attachment from a task. Returns the file as base64-encoded data along with its filename and MIME type. The task must have attachments (check via get_task). Use the index from the task's attachments array.",
      inputSchema: {
        taskId: z.string().describe("The task ID that owns the attachment"),
        attachmentIndex: z
          .number()
          .int()
          .min(0)
          .describe("Zero-based index of the attachment in the task's attachments array"),
      },
    },
    async (args) => {
      const { taskId, attachmentIndex } = args;

      try {
        const result = await client.downloadAttachment(taskId, attachmentIndex);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                fileName: result.fileName,
                contentType: result.contentType,
                sizeBytes: Math.ceil(result.base64Data.length * 3 / 4),
                base64Data: result.base64Data,
                message: `Downloaded "${result.fileName}" (${result.contentType}). Decode the base64Data to get the raw file bytes.`,
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

  // update_task_card tool
  server.registerTool(
    "update_task_card",
    {
      description:
        "Update the Feishu interactive card for a task with new markdown content. This updates the existing card in real-time (streaming card pattern), useful for showing progress updates, intermediate results, or status changes without creating a new message.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task whose Feishu card to update"),
        markdown: z.string().describe("Markdown content to display in the updated card"),
        title: z.string().optional().describe("Optional card header title (default: task command text)"),
        color: z.enum(["blue", "green", "red", "orange", "purple", "indigo", "turquoise", "yellow", "grey", "wathet"]).optional().describe("Optional card header color theme (default: blue)"),
      },
    },
    async (args) => {
      try {
        const result = await client.updateTaskCard(
          args.taskId as string,
          args.markdown as string,
          args.title as string | undefined,
          args.color as string | undefined,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // list_all_tags tool
  server.registerTool(
    "list_all_tags",
    {
      description:
        "List all unique tags used across all tasks in the system. Returns an array of tag strings. Useful for discovering available tags before filtering tasks or managing tag assignments.",
      inputSchema: {},
    },
    async () => {
      try {
        const tags = await client.listAllTags();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  tags,
                  count: tags.length,
                  message: tags.length > 0 ? `Found ${tags.length} unique tag(s)` : "No tags found",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // Phase 94: Create Task MCP Tool
  server.registerTool(
    "create_task",
    {
      description:
        "Create a new task directly (without a template). Provide a commandText describing what needs to be done. Optionally set priority, tags, description, device assignment, and due date. Returns the created task with its generated ID.",
      inputSchema: {
        commandText: z
          .string()
          .describe("The task command text describing what needs to be done"),
        description: z
          .string()
          .optional()
          .describe("Optional detailed description of the task"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("Task priority. Default: normal"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags to assign to the task"),
        assignedDeviceId: z
          .string()
          .optional()
          .describe("Device ID to assign the task to"),
        dueDate: z
          .string()
          .optional()
          .describe("Due date in ISO 8601 format"),
      },
    },
    async (args) => {
      try {
        const task = await client.createTask({
          commandText: args.commandText,
          description: args.description,
          priority: args.priority,
          tags: args.tags,
          assignedDeviceId: args.assignedDeviceId,
          dueDate: args.dueDate,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: "Task created successfully",
                  task: {
                    id: task.id,
                    commandText: task.commandText,
                    status: task.status,
                    priority: task.priority,
                    tags: task.tags,
                    assignedDeviceId: task.assignedDeviceId,
                    dueDate: task.dueDate,
                    description: task.description,
                    createdAt: task.createdAt,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // Composite update_task tool — update multiple fields in a single MCP call
  server.registerTool(
    "update_task",
    {
      description:
        "Update one or more fields on an existing task in a single call (command text, description, priority, due date, reminder, estimated minutes, assigned device, tags, pin/archive state). Prefer this composite tool over multiple single-field update calls.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to update"),
        commandText: z.string().min(1).optional().describe("Updated command/title text"),
        description: z.string().nullable().optional().describe("Updated description (pass null to clear)"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Updated priority level"),
        dueDate: z.string().nullable().optional().describe("ISO 8601 due date (pass null to clear)"),
        reminderAt: z.string().nullable().optional().describe("ISO 8601 reminder timestamp (pass null to clear)"),
        estimatedMinutes: z
          .number()
          .int()
          .min(1)
          .nullable()
          .optional()
          .describe("Estimated duration in minutes (pass null to clear)"),
        assignedDeviceId: z
          .string()
          .nullable()
          .optional()
          .describe("Device ID to assign (pass null to unassign)"),
        addTags: z.array(z.string().min(1)).optional().describe("Tags to add to the task"),
        removeTags: z.array(z.string().min(1)).optional().describe("Tags to remove from the task"),
        pinned: z.boolean().optional().describe("Pin (true) or unpin (false) the task"),
        archived: z.boolean().optional().describe("Archive (true) or unarchive (false) the task"),
      },
    },
    async (args) => {
      const {
        taskId,
        commandText,
        description,
        priority,
        dueDate,
        reminderAt,
        estimatedMinutes,
        assignedDeviceId,
        addTags,
        removeTags,
        pinned,
        archived,
      } = args;

      const updatedFields: string[] = [];
      let task;

      try {
        if (commandText !== undefined) {
          task = await client.setTaskCommandText(taskId, commandText);
          updatedFields.push("commandText");
        }
        if (description !== undefined) {
          task = await client.setTaskDescription(taskId, description);
          updatedFields.push("description");
        }
        if (priority !== undefined) {
          task = await client.setPriority(taskId, priority);
          updatedFields.push("priority");
        }
        if (dueDate !== undefined) {
          task = await client.setDueDate(taskId, dueDate);
          updatedFields.push("dueDate");
        }
        if (reminderAt !== undefined) {
          task = await client.setReminder(taskId, reminderAt);
          updatedFields.push("reminderAt");
        }
        if (estimatedMinutes !== undefined) {
          task = await client.setEstimatedMinutes(taskId, estimatedMinutes);
          updatedFields.push("estimatedMinutes");
        }
        if (assignedDeviceId !== undefined) {
          task = assignedDeviceId === null
            ? await client.unassignTask(taskId)
            : await client.assignTask(taskId, assignedDeviceId);
          updatedFields.push("assignedDeviceId");
        }
        if (addTags && addTags.length > 0) {
          task = await client.addTags(taskId, addTags);
          updatedFields.push("addTags");
        }
        if (removeTags && removeTags.length > 0) {
          for (const tag of removeTags) {
            task = await client.removeTag(taskId, tag);
          }
          updatedFields.push("removeTags");
        }
        if (pinned !== undefined) {
          task = pinned ? await client.pinTask(taskId) : await client.unpinTask(taskId);
          updatedFields.push("pinned");
        }
        if (archived !== undefined) {
          task = archived ? await client.archiveTask(taskId) : await client.unarchiveTask(taskId);
          updatedFields.push("archived");
        }

        if (updatedFields.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error updating task: at least one field must be provided",
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, updatedFields, task }, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error updating task: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
