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

  // set_task_reminder tool
  server.registerTool(
    "set_task_reminder",
    {
      description:
        "Set or clear a reminder time for a task. Pass a valid ISO 8601 datetime string to set, or null to clear. Reminders can be used to notify when a task needs attention.",
      inputSchema: {
        taskId: z.string().describe("The task ID to set the reminder for"),
        reminderAt: z
          .string()
          .nullable()
          .describe("ISO 8601 datetime string (e.g., '2026-06-15T09:00:00Z') or null to clear the reminder"),
      },
    },
    async (args) => {
      const { taskId, reminderAt } = args;

      try {
        const task = await client.setReminder(taskId, reminderAt);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: reminderAt
                  ? `Reminder set to ${reminderAt}`
                  : "Reminder cleared",
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

  // bulk_update_status tool
  server.registerTool(
    "bulk_update_status",
    {
      description:
        "Update the status of multiple tasks at once. Each task's status transition is validated individually — invalid transitions are skipped and reported in errors. Returns the count of successfully updated tasks and any errors.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to update"),
        status: z
          .enum(["pending", "picked", "running", "done", "failed"])
          .describe("The target status to set on all specified tasks"),
      },
    },
    async (args) => {
      const { ids, status } = args;

      try {
        const result = await client.bulkUpdateStatus(ids, status);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: `Updated ${result.updated} of ${ids.length} tasks to '${status}'${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
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

  // bulk_assign_tasks tool
  server.registerTool(
    "bulk_assign_tasks",
    {
      description:
        "Assign multiple tasks to a device at once. All specified tasks will be assigned to the given device. Returns the count of successfully assigned tasks and any errors.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to assign"),
        deviceId: z
          .string()
          .describe("The device ID to assign all tasks to"),
      },
    },
    async (args) => {
      const { ids, deviceId } = args;

      try {
        const result = await client.bulkAssign(ids, deviceId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: `Assigned ${result.updated} of ${ids.length} tasks to device '${deviceId}'${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
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

  // bulk_delete_tasks tool
  server.registerTool(
    "bulk_delete_tasks",
    {
      description:
        "Delete multiple tasks at once. This also deletes associated comments. Returns the count of successfully deleted tasks and any errors. WARNING: This operation is irreversible.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to delete"),
      },
    },
    async (args) => {
      const { ids } = args;

      try {
        const result = await client.bulkDelete(ids);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: `Deleted ${result.deleted} of ${ids.length} tasks${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
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

  // ── Task Template Tools ──────────────────────────────────────────

  // list_templates tool
  server.registerTool(
    "list_templates",
    {
      description:
        "List all saved task templates. Templates are reusable task definitions that can be used to quickly create common tasks.",
      inputSchema: {},
    },
    async () => {
      try {
        const templates = await client.listTemplates();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ templates, count: templates.length }, null, 2),
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

  // get_template tool
  server.registerTool(
    "get_template",
    {
      description: "Get details of a specific task template by ID.",
      inputSchema: {
        templateId: z.string().describe("The template ID to retrieve"),
      },
    },
    async (args) => {
      try {
        const template = await client.getTemplate(args.templateId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ template }, null, 2),
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

  // create_template tool
  server.registerTool(
    "create_template",
    {
      description:
        "Create a new task template. Templates define reusable task configurations with command text, priority, tags, and optional due date/reminder offsets.",
      inputSchema: {
        name: z.string().describe("A human-readable name for the template"),
        description: z.string().optional().describe("Optional description of what this template is for"),
        commandText: z.string().describe("The default command text for tasks created from this template"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("Default priority. Default: normal"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Default tags to apply when creating tasks from this template"),
        assignedDeviceId: z
          .string()
          .optional()
          .describe("Default device to assign tasks to"),
        dueDateOffsetMs: z
          .number()
          .int()
          .optional()
          .describe("Milliseconds offset from creation for the due date (e.g., 86400000 = +1 day)"),
        reminderOffsetMs: z
          .number()
          .int()
          .optional()
          .describe("Milliseconds offset from creation for the reminder (e.g., 3600000 = +1 hour)"),
      },
    },
    async (args) => {
      try {
        const template = await client.createTemplate(args);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                template,
                message: `Template '${template.name}' created (id: ${template.id})`,
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

  // update_template tool
  server.registerTool(
    "update_template",
    {
      description: "Update an existing task template. Only specified fields will be changed.",
      inputSchema: {
        templateId: z.string().describe("The template ID to update"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description (pass null to clear)"),
        commandText: z.string().optional().describe("New command text"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("New default priority"),
        tags: z
          .array(z.string())
          .optional()
          .describe("New default tags"),
        assignedDeviceId: z
          .string()
          .optional()
          .describe("New default device ID (pass null to clear)"),
        dueDateOffsetMs: z
          .number()
          .int()
          .optional()
          .describe("New due date offset in ms (pass null to clear)"),
        reminderOffsetMs: z
          .number()
          .int()
          .optional()
          .describe("New reminder offset in ms (pass null to clear)"),
      },
    },
    async (args) => {
      const { templateId, ...updates } = args;
      // Filter out undefined values so we only send specified fields
      const filteredUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          filteredUpdates[key] = value;
        }
      }

      try {
        const template = await client.updateTemplate(templateId, filteredUpdates);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ template, message: `Template '${template.name}' updated` }, null, 2),
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

  // delete_template tool
  server.registerTool(
    "delete_template",
    {
      description: "Delete a task template. This operation is irreversible.",
      inputSchema: {
        templateId: z.string().describe("The template ID to delete"),
      },
    },
    async (args) => {
      try {
        await client.deleteTemplate(args.templateId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, message: `Template ${args.templateId} deleted` }, null, 2),
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
}
