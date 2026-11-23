import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { TaskApiClient } from "../client.js";

export function registerAnalyticsTools(server: McpServer, client: TaskApiClient): void {
  // export_tasks tool
  server.registerTool(
    "export_tasks",
    {
      description:
        "Export all tasks, comments, dependencies, templates, and scheduled tasks as a JSON backup payload. Use this to back up the current instance or migrate data to another instance.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await client.exportTasks();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...data,
                message: `Exported ${(data.tasks as unknown[])?.length ?? 0} tasks, ${(data.comments as unknown[])?.length ?? 0} comments, ${(data.templates as unknown[])?.length ?? 0} templates`,
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

  // export_tasks_csv tool
  server.registerTool(
    "export_tasks_csv",
    {
      description:
        "Export tasks as CSV with optional filters. Returns CSV text with headers (id, source, commandText, status, priority, tags, dueDate, etc.). Use filters to narrow the export to specific status, priority, tags, date range, source, or text search. Without filters, exports all tasks.",
      inputSchema: {
        status: z.enum(["pending", "picked", "running", "done", "failed"]).optional().describe("Filter by task status"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Filter by task priority"),
        tags: z.string().optional().describe("Comma-separated tags to filter by (e.g. 'bug,urgent')"),
        from: z.string().optional().describe("Export tasks created after this ISO 8601 date"),
        to: z.string().optional().describe("Export tasks created before this ISO 8601 date"),
        q: z.string().optional().describe("Text search filter (matches commandText, resultSummary, description)"),
        deviceId: z.string().optional().describe("Filter by assigned device ID"),
        source: z.enum(["feishu", "web", "mcp"]).optional().describe("Filter by task origin source (feishu, web, or mcp)"),
      },
    },
    async (args) => {
      try {
        const csv = await client.exportTasksCsv({
          status: args.status,
          priority: args.priority,
          tags: args.tags,
          from: args.from,
          to: args.to,
          q: args.q,
          deviceId: args.deviceId,
          source: args.source,
        });
        const lineCount = csv.split("\n").length - 1;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                csv,
                lineCount,
                message: `Exported ${lineCount} tasks as CSV${args.status ? ` (status=${args.status})` : ""}${args.priority ? ` (priority=${args.priority})` : ""}`,
              }),
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

  // import_tasks tool
  server.registerTool(
    "import_tasks",
    {
      description:
        "Import tasks from a previously exported JSON payload. Use mode 'skip' (default) to ignore duplicates, or 'overwrite' to replace existing tasks. This restores tasks, comments, dependencies, templates, and scheduled tasks.",
      inputSchema: {
        data: z
          .record(z.string(), z.unknown())
          .describe("The export payload JSON object (from export_tasks)"),
        mode: z
          .enum(["skip", "overwrite"])
          .optional()
          .describe("How to handle duplicate IDs: 'skip' (default) ignores them, 'overwrite' replaces them"),
      },
    },
    async (args) => {
      const { data, mode } = args;
      try {
        const result = await client.importTasks(data as Record<string, unknown>, mode);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: `Imported ${result.imported} tasks, skipped ${result.skipped}${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
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

  // import_tasks_csv tool
  server.registerTool(
    "import_tasks_csv",
    {
      description:
        "Import tasks from CSV text with column mapping. Accepts CSV data with a header row and maps columns to task fields (commandText/title, priority, tags, dueDate, description). Use columnMap to rename CSV headers to task field names. Returns the count of imported tasks and any row-level errors.",
      inputSchema: {
        csv: z.string().describe("CSV text with header row and data rows"),
        columnMap: z
          .record(z.string(), z.string())
          .optional()
          .describe('Mapping from CSV column header to task field name, e.g. {"Title": "commandText", "Due Date": "dueDate"}'),
        defaultPriority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("Default priority for tasks without a priority column. Default: normal"),
        defaultTags: z
          .array(z.string())
          .optional()
          .describe("Default tags to apply to all imported tasks"),
        delimiter: z
          .string()
          .optional()
          .describe("CSV delimiter character. Default: comma"),
      },
    },
    async (args) => {
      try {
        const result = await client.importTasksFromCsv(args.csv, {
          columnMap: args.columnMap,
          defaultPriority: args.defaultPriority,
          defaultTags: args.defaultTags,
          delimiter: args.delimiter,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  imported: result.imported,
                  errors: result.errors,
                  taskIds: result.taskIds,
                  message: `Imported ${result.imported} tasks from CSV${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
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

  // ── SLA Tools ──────────────────────────────────────────────────

  // get_api_usage tool
  server.registerTool(
    "get_api_usage",
    {
      description:
        "Get API usage analytics — request counts, response times, and error rates per user/device. Shows who is calling the API, how frequently, and how fast. Useful for monitoring usage patterns and identifying bottlenecks.",
      inputSchema: {
        from: z
          .string()
          .optional()
          .describe("ISO 8601 start time to filter data (e.g., '2026-06-01T00:00:00Z')"),
        to: z
          .string()
          .optional()
          .describe("ISO 8601 end time to filter data (e.g., '2026-06-03T23:59:59Z')"),
      },
    },
    async (args) => {
      const { from, to } = args;

      try {
        const result = await client.getApiUsageStats(from, to);
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

  // get_api_usage_entries tool
  server.registerTool(
    "get_api_usage_entries",
    {
      description:
        "Get raw API usage entries for a specific caller (user, device, token, or IP). Shows individual request logs with method, path, status code, duration, and timestamp. Useful for debugging a specific caller's API activity and identifying problematic requests.",
      inputSchema: {
        callerId: z
          .string()
          .describe(
            "Caller identity to query (e.g., 'user:<id>', 'device:<id>', 'token:<hash>', 'ip:<addr>')",
          ),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of entries to return (default: 50)"),
      },
    },
    async (args) => {
      const { callerId, limit } = args;

      try {
        const result = await client.getApiUsageEntries(callerId, limit);
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

  // get_processing_stats tool
  server.registerTool(
    "get_processing_stats",
    {
      description:
        "Get task processing time analytics. Returns average/p50/p95 durations for queue wait, processing time, and total time. Includes success/failure counts. Useful for monitoring system performance and identifying bottlenecks.",
      inputSchema: {},
    },
    async () => {
      try {
        const stats = await client.getProcessingStats();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stats, null, 2),
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

  // get_task_stats_summary tool
  server.registerTool(
    "get_task_stats_summary",
    {
      description:
        "Get a comprehensive summary of task statistics. Returns total tasks, status distribution (pending/picked/running/done/failed), priority breakdown, tag counts, and other aggregate metrics. Use for high-level system health checks.",
      inputSchema: {},
    },
    async () => {
      try {
        const stats = await client.getTaskStatsSummary();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stats, null, 2),
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

  // get_user_stats tool
  server.registerTool(
    "get_user_stats",
    {
      description:
        "Get per-user task statistics. Returns a list of users (by Feishu user ID) with their task counts, status breakdown, average resolution time, and last activity. Useful for workload analysis and identifying power users.",
      inputSchema: {},
    },
    async () => {
      try {
        const stats = await client.getUserStats();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stats, null, 2),
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

  // get_task_timeseries tool
  server.registerTool(
    "get_task_timeseries",
    {
      description:
        "Get time-series analytics data for task creation, completion, or resolution time. Returns data points grouped by interval (hour/day/week/month). Useful for trend analysis, capacity planning, and generating charts. Default: last 30 days, daily interval, created metric.",
      inputSchema: {
        from: z
          .string()
          .optional()
          .describe("ISO 8601 start date. Default: 30 days ago"),
        to: z
          .string()
          .optional()
          .describe("ISO 8601 end date. Default: now"),
        interval: z
          .enum(["hour", "day", "week", "month"])
          .optional()
          .describe("Aggregation interval. Default: day"),
        metric: z
          .enum(["created", "completed", "resolution_time"])
          .optional()
          .describe("Which metric to chart. Default: created"),
      },
    },
    async (args) => {
      const { from, to, interval, metric } = args;
      try {
        const result = await client.getTaskTimeSeries(from, to, interval, metric);
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

  // get_time_tracking_stats tool
  server.registerTool(
    "get_time_tracking_stats",
    {
      description:
        "Get aggregated time tracking statistics across all tasks. Returns total entries, total minutes tracked, averages per entry and per task, active timers count, breakdown by user (who logged time), breakdown by task priority, and a 7-day daily trend. Useful for understanding time investment across the project and identifying which areas consume the most effort.",
      inputSchema: {},
    },
    async () => {
      try {
        const stats = await client.getTimeTrackingStats();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stats, null, 2),
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
