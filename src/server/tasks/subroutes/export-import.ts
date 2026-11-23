import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskPriority, TaskStatus } from "../../../shared/types.js";
import type { TaskExportPayload } from "../store.js";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import type { TaskRouteContext } from "./context.js";

export function registerExportImportRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, auditStore, log } = ctx;

  // GET /api/tasks/export - export all tasks, comments, dependencies, templates, scheduled tasks (requires tasks.read)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get("/api/tasks/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    try {
      const data = await store.exportAll();
      log.info({ taskCount: data.tasks.length, commentCount: data.comments.length }, "Tasks exported");
      return reply.send(data);
    } catch (e) {
      throw e;
    }
  });

  // GET /api/tasks/export.csv - export all tasks as CSV (requires tasks.read)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  // Supports optional query params: status, priority, tags (comma-separated), from, to, q, deviceId
  server.get("/api/tasks/export.csv", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    try {
      const query = req.query as Record<string, string | undefined>;
      const hasFilters = query.status || query.priority || query.tags || query.from || query.to || query.q || query.deviceId || query.source;
      const tasks = hasFilters
        ? await store.searchAllTasksForExport({
            status: query.status as import("../../../shared/types.js").TaskStatus | undefined,
            priority: query.priority as import("../../../shared/types.js").TaskPriority | undefined,
            tags: query.tags ? query.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : undefined,
            from: query.from,
            to: query.to,
            q: query.q,
            deviceId: query.deviceId,
            source: query.source,
          })
        : await store.getAllTasks();

      // CSV header
      const headers = [
        "id", "source", "feishuMessageId", "feishuChatId", "feishuUserId",
        "commandText", "status", "priority", "assignedDeviceId",
        "dueDate", "reminderAt", "pinned", "createdAt", "updatedAt",
        "resultSummary", "resultDetails", "tags",
      ];

      function csvEscape(val: unknown): string {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }

      const rows = tasks.map(t => [
        csvEscape(t.id),
        csvEscape(t.source),
        csvEscape(t.feishuMessageId),
        csvEscape(t.feishuChatId),
        csvEscape(t.feishuUserId),
        csvEscape(t.commandText),
        csvEscape(t.status),
        csvEscape(t.priority),
        csvEscape(t.assignedDeviceId),
        csvEscape(t.dueDate),
        csvEscape(t.reminderAt),
        csvEscape(t.pinned ? "true" : "false"),
        csvEscape(t.createdAt),
        csvEscape(t.updatedAt),
        csvEscape(t.resultSummary),
        csvEscape(t.resultDetails),
        csvEscape(t.tags?.join("; ") ?? ""),
      ].join(","));

      const csv = [headers.join(","), ...rows].join("\n");

      log.info({ taskCount: tasks.length }, "Tasks exported as CSV");
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="tasks-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv);
    } catch (e) {
      throw e;
    }
  });

  // POST /api/tasks/import - import tasks from JSON payload (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/import", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { tasks?: unknown[]; version?: number; mode?: string } & Record<string, unknown>;
    if (!body || !Array.isArray(body.tasks)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must be a valid export payload with 'tasks' array" },
      });
    }

    const mode = (body.mode as string) === "overwrite" ? "overwrite" : "skip";

    try {
      const result = await store.importAll(body as never, mode);
      log.info({ imported: result.imported, skipped: result.skipped, errors: result.errors.length }, "Tasks imported");
      if (auditStore) {
        await auditStore.log({
          action: "task.created",
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "import", imported: result.imported, skipped: result.skipped, errorCount: result.errors.length },
        });
      }
      return reply.send({ ok: true, ...result });
    } catch (e) {
      if (e instanceof Error && e.message.includes("Invalid export data")) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: e.message },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/import-csv - import tasks from CSV text with column mapping (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/import-csv", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as {
      csv?: string;
      columnMap?: Record<string, string>;
      defaultPriority?: string;
      defaultTags?: string[];
      delimiter?: string;
    } & Record<string, unknown>;

    if (!body || typeof body.csv !== "string" || body.csv.trim().length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'csv' string with CSV data" },
      });
    }

    try {
      const delimiter = (body.delimiter as string) || ",";
      const lines = body.csv.split("\n").filter((l: string) => l.trim().length > 0);
      if (lines.length < 2) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: "CSV must have a header row and at least one data row" },
        });
      }

      // Parse CSV header
      const headerLine = lines[0];
      const headers = headerLine.split(delimiter).map((h: string) => h.trim().replace(/^"|"$/g, ""));

      // Column mapping: CSV column name -> Task field name
      const columnMap = body.columnMap ?? {};
      const defaultPriority = (body.defaultPriority as string) || "normal";
      const defaultTags = body.defaultTags ?? [];

      const imported: string[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(delimiter).map((v: string) => v.trim().replace(/^"|"$/g, ""));
          const row: Record<string, string> = {};
          headers.forEach((h: string, idx: number) => {
            row[h] = values[idx] ?? "";
          });

          // Map CSV columns to task fields
          const commandText = row[columnMap["commandText"] ?? columnMap["title"] ?? columnMap["name"] ?? headers[0]] ?? "";
          if (!commandText) {
            errors.push(`Row ${i + 1}: empty commandText/title, skipped`);
            continue;
          }

          const taskId = `task_csv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const priority = (row[columnMap["priority"] ?? "priority"] as string) || defaultPriority;
          const tagsStr = row[columnMap["tags"] ?? "tags"] ?? "";
          const tags = tagsStr ? tagsStr.split(/[;,]/).map((t: string) => t.trim()).filter(Boolean) : defaultTags;
          const dueDate = row[columnMap["dueDate"] ?? columnMap["due_date"] ?? "dueDate"] ?? undefined;
          const description = row[columnMap["description"] ?? "description"] ?? undefined;

          const now = new Date().toISOString();
          const task = {
            id: taskId,
            source: "mcp" as const,
            feishuMessageId: `csv_${taskId}`,
            feishuChatId: "",
            feishuUserId: "",
            commandText,
            status: "pending" as const,
            priority: (priority as TaskPriority) || "normal",
            tags: tags.length > 0 ? tags : undefined,
            dueDate: dueDate || undefined,
            description: description || undefined,
            createdAt: now,
            updatedAt: now,
          };

          await store.createTask(task);
          imported.push(taskId);
        } catch (rowErr) {
          errors.push(`Row ${i + 1}: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
        }
      }

      log.info({ imported: imported.length, errors: errors.length }, "Tasks imported from CSV");
      if (auditStore) {
        await auditStore.log({
          action: "task.created",
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "csv_import", imported: imported.length, errorCount: errors.length },
        });
      }
      return reply.send({ ok: true, imported: imported.length, errors, taskIds: imported });
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(400).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
  });
}
