import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { TaskApiClient } from "../client.js";

export function registerPlanningTools(server: McpServer, client: TaskApiClient): void {
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
        variables: z
          .record(z.string(), z.string())
          .optional()
          .describe("Default variable values for template substitution. Use {var_name} in commandText/description to reference these variables."),
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
        variables: z
          .record(z.string(), z.string())
          .optional()
          .describe("Default variable values for template substitution (pass null to clear)"),
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

  // create_task_from_template tool
  server.registerTool(
    "create_task_from_template",
    {
      description:
        "Create a new task from an existing template. Templates define reusable task configurations (command text, priority, tags, device, due date offset, reminder offset). You can override any field when creating the task.",
      inputSchema: {
        templateId: z.string().describe("The template ID to use"),
        commandText: z.string().optional().describe("Override the template's command text"),
        description: z.string().optional().describe("Override the task description"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("Override the template's default priority"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Override the template's default tags"),
        assignedDeviceId: z
          .string()
          .optional()
          .describe("Override the template's assigned device"),
        dueDate: z
          .string()
          .optional()
          .describe("Override due date (ISO string). If not set, uses template's dueDateOffsetMs from now"),
        reminderAt: z
          .string()
          .optional()
          .describe("Override reminder time (ISO string). If not set, uses template's reminderOffsetMs from now"),
        variables: z
          .record(z.string(), z.string())
          .optional()
          .describe("Variable values for template substitution. Template text with {var_name} placeholders will be replaced with provided values."),
      },
    },
    async (args) => {
      try {
        const overrides: Record<string, unknown> = {};
        if (args.commandText !== undefined) overrides.commandText = args.commandText;
        if (args.description !== undefined) overrides.description = args.description;
        if (args.priority !== undefined) overrides.priority = args.priority;
        if (args.tags !== undefined) overrides.tags = args.tags;
        if (args.assignedDeviceId !== undefined) overrides.assignedDeviceId = args.assignedDeviceId;
        if (args.dueDate !== undefined) overrides.dueDate = args.dueDate;
        if (args.reminderAt !== undefined) overrides.reminderAt = args.reminderAt;
        if (args.variables !== undefined) overrides.variables = args.variables;

        const task = await client.createTaskFromTemplate(args.templateId, overrides);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task created from template (id: ${task.id}, status: ${task.status}, priority: ${task.priority})`,
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

  // get_template_usage_stats tool
  server.registerTool(
    "get_template_usage_stats",
    {
      description:
        "Get usage statistics for all task templates. Shows how many times each template has been used to create tasks, sorted by most-used first. Useful for identifying which templates are most valuable and which are unused.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.getTemplateUsageStats();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: result.templateCount === 0
                  ? "No templates exist yet"
                  : `Total: ${result.totalUsage} task(s) created from ${result.templateCount} template(s)`,
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

  // ── Scheduled Task Tools ──────────────────────────────────────────

  // list_scheduled_tasks tool
  server.registerTool(
    "list_scheduled_tasks",
    {
      description:
        "List all scheduled/recurring tasks. These are task definitions that automatically create new tasks on a schedule (hourly, daily, weekly, monthly).",
      inputSchema: {},
    },
    async () => {
      try {
        const scheduledTasks = await client.listScheduledTasks();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ scheduledTasks, count: scheduledTasks.length }, null, 2),
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

  // get_scheduled_task tool
  server.registerTool(
    "get_scheduled_task",
    {
      description: "Get details of a specific scheduled task by ID.",
      inputSchema: {
        scheduledTaskId: z.string().describe("The scheduled task ID to retrieve"),
      },
    },
    async (args) => {
      try {
        const scheduledTask = await client.getScheduledTask(args.scheduledTaskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ scheduledTask }, null, 2),
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

  // create_scheduled_task tool
  server.registerTool(
    "create_scheduled_task",
    {
      description:
        "Create a new scheduled/recurring task. This will automatically create tasks on the specified frequency (once, hourly, daily, weekly, monthly).",
      inputSchema: {
        commandText: z.string().describe("The command text for tasks created by this schedule"),
        frequency: z
          .enum(["once", "hourly", "daily", "weekly", "monthly"])
          .describe("How often to create a task"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("Priority for created tasks. Default: normal"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags to apply to created tasks"),
        assignedDeviceId: z
          .string()
          .optional()
          .describe("Device ID to assign created tasks to"),
        nextRunAt: z
          .string()
          .optional()
          .describe("ISO 8601 datetime for when to first run. Default: now"),
        enabled: z
          .boolean()
          .optional()
          .describe("Whether the schedule is active. Default: true"),
        templateId: z
          .string()
          .optional()
          .describe("Optional template ID to base tasks on"),
      },
    },
    async (args) => {
      try {
        const scheduledTask = await client.createScheduledTask(args);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                scheduledTask,
                message: `Scheduled task created (id: ${scheduledTask.id}, frequency: ${scheduledTask.frequency})`,
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

  // update_scheduled_task tool
  server.registerTool(
    "update_scheduled_task",
    {
      description: "Update an existing scheduled task. Only specified fields will be changed.",
      inputSchema: {
        scheduledTaskId: z.string().describe("The scheduled task ID to update"),
        commandText: z.string().optional().describe("New command text"),
        frequency: z
          .enum(["once", "hourly", "daily", "weekly", "monthly"])
          .optional()
          .describe("New frequency"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("New priority"),
        tags: z
          .array(z.string())
          .optional()
          .describe("New tags"),
        assignedDeviceId: z
          .string()
          .optional()
          .describe("New device ID (pass null to clear)"),
        nextRunAt: z
          .string()
          .optional()
          .describe("New next run time (ISO 8601)"),
        enabled: z
          .boolean()
          .optional()
          .describe("Enable or disable the schedule"),
      },
    },
    async (args) => {
      const { scheduledTaskId, ...updates } = args;
      const filteredUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          filteredUpdates[key] = value;
        }
      }

      try {
        const scheduledTask = await client.updateScheduledTask(scheduledTaskId, filteredUpdates);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ scheduledTask, message: `Scheduled task ${scheduledTaskId} updated` }, null, 2),
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

  // delete_scheduled_task tool
  server.registerTool(
    "delete_scheduled_task",
    {
      description: "Delete a scheduled task. This will stop future task creation from this schedule. WARNING: This operation is irreversible.",
      inputSchema: {
        scheduledTaskId: z.string().describe("The scheduled task ID to delete"),
      },
    },
    async (args) => {
      try {
        await client.deleteScheduledTask(args.scheduledTaskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, message: `Scheduled task ${args.scheduledTaskId} deleted` }, null, 2),
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

  // run_scheduled_task tool
  server.registerTool(
    "run_scheduled_task",
    {
      description:
        "Manually trigger a scheduled task to create a task immediately, without waiting for the next scheduled run. The schedule's next run time is still updated.",
      inputSchema: {
        scheduledTaskId: z.string().describe("The scheduled task ID to trigger"),
      },
    },
    async (args) => {
      try {
        const result = await client.runScheduledTask(args.scheduledTaskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task: result.task,
                scheduledTask: result.scheduledTask,
                message: `Task ${result.task.id} created from scheduled task ${args.scheduledTaskId}`,
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

  // ── Task Dependency Tools ──────────────────────────────────────────

  // list_cycles tool
  server.registerTool(
    "list_cycles",
    {
      description:
        "List all cycles (sprints). Each cycle is a time-boxed work period with a name, start/end dates, and status (upcoming, active, completed). Returns cycle summaries with task counts. Optionally filter by status.",
      inputSchema: {
        status: z
          .enum(["upcoming", "active", "completed"])
          .optional()
          .describe("Filter cycles by status: upcoming, active, or completed"),
      },
    },
    async (args) => {
      try {
        const cycles = await client.listCycles(args.status as import("../../shared/types.js").CycleStatus | undefined);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ cycles, count: cycles.length }, null, 2),
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

  // get_cycle tool
  server.registerTool(
    "get_cycle",
    {
      description:
        "Get details of a specific cycle (sprint) by ID. Returns the cycle name, description, start/end dates, status, and task counts.",
      inputSchema: {
        cycleId: z.string().describe("The ID of the cycle to retrieve"),
      },
    },
    async (args) => {
      try {
        const cycle = await client.getCycle(args.cycleId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(cycle, null, 2),
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

  // create_cycle tool
  server.registerTool(
    "create_cycle",
    {
      description:
        "Create a new cycle (sprint). A cycle is a time-boxed work period for grouping tasks. Provide a name, start date, and end date. Optionally add a description of the cycle's goals.",
      inputSchema: {
        name: z.string().describe("Name of the cycle (e.g., 'Sprint 1', 'Week 24')"),
        startDate: z.string().describe("Start date in ISO 8601 format (e.g., '2026-06-01')"),
        endDate: z.string().describe("End date in ISO 8601 format (e.g., '2026-06-14')"),
        description: z.string().optional().describe("Optional description of the cycle's goals"),
      },
    },
    async (args) => {
      try {
        const cycle = await client.createCycle({
          name: args.name as string,
          startDate: args.startDate as string,
          endDate: args.endDate as string,
          description: args.description as string | undefined,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ cycle, message: `Cycle '${cycle.name}' created` }, null, 2),
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

  // update_cycle tool
  server.registerTool(
    "update_cycle",
    {
      description:
        "Update a cycle's properties. You can change the name, description, start/end dates, or status. Only provide the fields you want to update.",
      inputSchema: {
        cycleId: z.string().describe("The ID of the cycle to update"),
        name: z.string().optional().describe("New name for the cycle"),
        description: z.string().optional().describe("New description of the cycle's goals"),
        startDate: z.string().optional().describe("New start date in ISO 8601 format"),
        endDate: z.string().optional().describe("New end date in ISO 8601 format"),
        status: z
          .enum(["upcoming", "active", "completed"])
          .optional()
          .describe("New status: upcoming, active, or completed"),
      },
    },
    async (args) => {
      try {
        const updates: Record<string, unknown> = {};
        if (args.name !== undefined) updates.name = args.name;
        if (args.description !== undefined) updates.description = args.description;
        if (args.startDate !== undefined) updates.startDate = args.startDate;
        if (args.endDate !== undefined) updates.endDate = args.endDate;
        if (args.status !== undefined) updates.status = args.status;
        const cycle = await client.updateCycle(args.cycleId as string, updates);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ cycle, message: `Cycle '${cycle.name}' updated` }, null, 2),
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

  // delete_cycle tool
  server.registerTool(
    "delete_cycle",
    {
      description:
        "Permanently delete a cycle (sprint). Tasks that were in the cycle are not deleted — they are simply unlinked from the cycle.",
      inputSchema: {
        cycleId: z.string().describe("The ID of the cycle to delete"),
      },
    },
    async (args) => {
      try {
        await client.deleteCycle(args.cycleId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ deleted: true, message: "Cycle deleted" }, null, 2),
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

  // add_task_to_cycle tool
  server.registerTool(
    "add_task_to_cycle",
    {
      description:
        "Assign a task to a cycle (sprint). This links the task to the specified time-boxed work period, enabling sprint planning and progress tracking.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to add to the cycle"),
        cycleId: z.string().describe("The ID of the cycle to add the task to"),
      },
    },
    async (args) => {
      try {
        const task = await client.addTaskToCycle(args.taskId as string, args.cycleId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task, message: `Task '${task.id}' added to cycle` }, null, 2),
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

  // remove_task_from_cycle tool
  server.registerTool(
    "remove_task_from_cycle",
    {
      description:
        "Remove a task from its current cycle (sprint). The task is not deleted — it is simply unlinked from the cycle.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to remove from its cycle"),
      },
    },
    async (args) => {
      try {
        const task = await client.removeTaskFromCycle(args.taskId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task, message: `Task '${task.id}' removed from cycle` }, null, 2),
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

  // list_cycle_tasks tool
  server.registerTool(
    "list_cycle_tasks",
    {
      description:
        "List all tasks in a specific cycle (sprint). Returns the tasks with their current status, priority, and assignment. Useful for sprint reviews and progress tracking.",
      inputSchema: {
        cycleId: z.string().describe("The ID of the cycle to list tasks for"),
      },
    },
    async (args) => {
      try {
        const tasks = await client.listCycleTasks(args.cycleId as string);
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
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // get_cycle_progress tool
  server.registerTool(
    "get_cycle_progress",
    {
      description:
        "Get burndown and progress data for a cycle (sprint). Returns completion percentage, velocity (tasks/day), status breakdown, priority breakdown, burndown chart data (actual vs ideal), and time tracking summary (estimated vs actual minutes). Use this to track sprint health and generate burndown charts.",
      inputSchema: {
        cycleId: z.string().describe("The ID of the cycle to get progress data for"),
      },
    },
    async (args) => {
      try {
        const progress = await client.getCycleProgress(args.cycleId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ progress }, null, 2),
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

  // list_modules tool
  server.registerTool(
    "list_modules",
    {
      description:
        "List all modules (epics). Each module groups related tasks into a logical unit (e.g., 'Auth System', 'Payment Flow'). Returns module summaries with task counts and completion percentage. Optionally filter by status.",
      inputSchema: {
        status: z
          .enum(["planned", "active", "completed", "archived"])
          .optional()
          .describe("Filter modules by status: planned, active, completed, or archived"),
      },
    },
    async (args) => {
      try {
        const modules = await client.listModules(args.status as import("../../shared/types.js").ModuleStatus | undefined);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ modules, count: modules.length }, null, 2),
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

  // get_module tool
  server.registerTool(
    "get_module",
    {
      description:
        "Get details of a specific module (epic) by ID. Returns the module name, description, status, date range, target completion, and actual task progress (total tasks, completed tasks, completion percentage).",
      inputSchema: {
        moduleId: z.string().describe("The ID of the module to retrieve"),
      },
    },
    async (args) => {
      try {
        const mod = await client.getModule(args.moduleId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(mod, null, 2),
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

  // create_module tool
  server.registerTool(
    "create_module",
    {
      description:
        "Create a new module (epic) to group related tasks. A module represents a logical feature area or work stream. Tasks can be assigned to modules for organizational purposes.",
      inputSchema: {
        name: z.string().describe("Human-readable module name (e.g., 'Auth System', 'Payment Flow')"),
        description: z.string().optional().describe("Description of the module's goals and scope"),
        startDate: z.string().optional().describe("Planned start date (ISO 8601)"),
        endDate: z.string().optional().describe("Planned end date (ISO 8601)"),
      },
    },
    async (args) => {
      try {
        const mod = await client.createModule({
          name: args.name as string,
          description: args.description as string | undefined,
          startDate: args.startDate as string | undefined,
          endDate: args.endDate as string | undefined,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ module: mod, message: `Module "${mod.name}" created successfully` }, null, 2),
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

  // update_module tool
  server.registerTool(
    "update_module",
    {
      description:
        "Update an existing module's properties. Can change name, description, status (planned/active/completed/archived), date range, or target completion percentage.",
      inputSchema: {
        moduleId: z.string().describe("The ID of the module to update"),
        name: z.string().optional().describe("New module name"),
        description: z.string().optional().describe("New description (pass null to clear)"),
        status: z
          .enum(["planned", "active", "completed", "archived"])
          .optional()
          .describe("New status"),
        startDate: z.string().optional().describe("New start date (ISO 8601, pass null to clear)"),
        endDate: z.string().optional().describe("New end date (ISO 8601, pass null to clear)"),
        targetCompletionPercent: z.number().min(0).max(100).optional().describe("Target completion percentage (0-100, pass null to clear)"),
      },
    },
    async (args) => {
      try {
        const updates: Record<string, unknown> = {};
        if (args.name !== undefined) updates.name = args.name;
        if (args.description !== undefined) updates.description = args.description;
        if (args.status !== undefined) updates.status = args.status;
        if (args.startDate !== undefined) updates.startDate = args.startDate;
        if (args.endDate !== undefined) updates.endDate = args.endDate;
        if (args.targetCompletionPercent !== undefined) updates.targetCompletionPercent = args.targetCompletionPercent;

        const mod = await client.updateModule(args.moduleId as string, updates);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ module: mod, message: "Module updated successfully" }, null, 2),
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

  // delete_module tool
  server.registerTool(
    "delete_module",
    {
      description:
        "Delete a module (epic). This removes the module and unassigns all its tasks (tasks are NOT deleted, only their module association is cleared).",
      inputSchema: {
        moduleId: z.string().describe("The ID of the module to delete"),
      },
    },
    async (args) => {
      try {
        await client.deleteModule(args.moduleId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, message: "Module deleted successfully. All tasks have been unassigned from this module." }, null, 2),
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

  // add_task_to_module tool
  server.registerTool(
    "add_task_to_module",
    {
      description:
        "Assign a task to a module (epic). This links the task to the specified module for organizational grouping. A task can belong to one module at a time.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to assign"),
        moduleId: z.string().describe("The ID of the module to assign the task to"),
      },
    },
    async (args) => {
      try {
        const task = await client.addTaskToModule(args.taskId as string, args.moduleId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task, message: `Task "${task.id}" assigned to module "${args.moduleId}"` }, null, 2),
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

  // remove_task_from_module tool
  server.registerTool(
    "remove_task_from_module",
    {
      description:
        "Remove a task from its current module. The task is NOT deleted — it simply loses its module association. The task must currently be assigned to a module.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to unassign from its module"),
      },
    },
    async (args) => {
      try {
        const task = await client.removeTaskFromModule(args.taskId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task, message: `Task "${task.id}" removed from its module` }, null, 2),
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

  // list_module_tasks tool
  server.registerTool(
    "list_module_tasks",
    {
      description:
        "List all tasks belonging to a specific module (epic). Returns the tasks sorted by creation date (newest first). Useful for reviewing progress within a feature area.",
      inputSchema: {
        moduleId: z.string().describe("The ID of the module whose tasks to list"),
      },
    },
    async (args) => {
      try {
        const tasks = await client.listModuleTasks(args.moduleId as string);
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
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );
}
