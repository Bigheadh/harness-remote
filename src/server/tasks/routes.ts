import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "./store.js";
import type { TaskStatus } from "../../shared/types.js";
import type { AuditLogEntry } from "../../shared/types.js";
import type { FeishuReplyClient } from "../feishu/client.js";
import type { AuditLogStore } from "../audit/store.js";
import type { UserStore } from "../auth/store.js";
import type { ApiKeyStore } from "../auth/apikeys/store.js";
import type { WebhookStore } from "../webhooks/store.js";
import { authenticate, authorize } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";
import { dispatchWebhook } from "../webhooks/dispatcher.js";

const log = createLogger({ level: "info" });

export function registerTaskRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
  feishuClient?: FeishuReplyClient,
  auditStore?: AuditLogStore,
  userStore?: UserStore,
  webhookStore?: WebhookStore,
  apiKeyStore?: ApiKeyStore,
): void {
  // Health endpoint with DB connectivity check (no auth required)
  server.get("/health", async (_req, reply) => {
    const dbOk = await store.healthCheck();
    if (!dbOk) {
      return reply.code(503).send({ ok: false, error: "Database unreachable" });
    }
    return reply.send({ ok: true });
  });

  // RBAC-aware auth hook for /api/* routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith("/api/")) {
      try {
        const authCtx = await authenticate(req.headers["authorization"], personalToken, userStore, apiKeyStore);
        // Attach auth context for downstream handlers
        (req as FastifyRequest & { authCtx?: typeof authCtx }).authCtx = authCtx;
      } catch (e) {
        if (e instanceof AppError) {
          return reply.code(401).send({
            error: { code: e.code, message: e.message },
          });
        }
        return reply.code(401).send({
          error: { code: "unauthorized", message: "Missing or invalid bearer token" },
        });
      }
    }
  });

  // GET /api/tasks/tags - list all unique tags (requires tasks.read)
  server.get("/api/tasks/tags", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const tags = await store.listAllTags();
    return reply.send({ tags });
  });

  // ── Task Templates ────────────────────────────────────────────────

  // GET /api/templates - list all task templates (requires tasks.read)
  server.get("/api/templates", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const templates = await store.listTemplates();
    return reply.send({ templates });
  });

  // GET /api/templates/:id - get a task template by ID (requires tasks.read)
  server.get<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const template = await store.getTemplate(req.params.id);
    if (!template) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Template not found: ${req.params.id}` },
      });
    }
    return reply.send({ template });
  });

  // POST /api/templates - create a task template (requires tasks.write)
  server.post("/api/templates", async (req: FastifyRequest, reply: FastifyReply) => {
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
      name?: string;
      description?: string;
      commandText?: string;
      priority?: string;
      tags?: string[];
      assignedDeviceId?: string;
      dueDateOffsetMs?: number;
      reminderOffsetMs?: number;
    };

    if (typeof body?.name !== "string" || body.name.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'name' (non-empty string)" },
      });
    }
    if (typeof body?.commandText !== "string" || body.commandText.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'commandText' (non-empty string)" },
      });
    }

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid priority: ${body.priority}. Must be one of: ${validPriorities.join(", ")}` },
      });
    }

    const template = await store.createTemplate({
      name: body.name.trim(),
      description: body.description,
      commandText: body.commandText.trim(),
      priority: body.priority as "low" | "normal" | "high" | "urgent" | undefined,
      tags: body.tags,
      assignedDeviceId: body.assignedDeviceId,
      dueDateOffsetMs: body.dueDateOffsetMs,
      reminderOffsetMs: body.reminderOffsetMs,
      createdBy: authCtx.user?.username ?? "api",
    });
    log.info({ templateId: template.id, name: template.name }, "Task template created");
    return reply.code(201).send({ template });
  });

  // PUT /api/templates/:id - update a task template (requires tasks.write)
  server.put<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
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
      name?: string;
      description?: string;
      commandText?: string;
      priority?: string;
      tags?: string[];
      assignedDeviceId?: string;
      dueDateOffsetMs?: number;
      reminderOffsetMs?: number;
    };

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid priority: ${body.priority}. Must be one of: ${validPriorities.join(", ")}` },
      });
    }

    try {
      const template = await store.updateTemplate(req.params.id, {
        name: body.name,
        description: body.description,
        commandText: body.commandText,
        priority: body.priority as "low" | "normal" | "high" | "urgent" | undefined,
        tags: body.tags,
        assignedDeviceId: body.assignedDeviceId,
        dueDateOffsetMs: body.dueDateOffsetMs,
        reminderOffsetMs: body.reminderOffsetMs,
      });
      log.info({ templateId: template.id }, "Task template updated");
      return reply.send({ template });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Template not found: ${req.params.id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/templates/:id - delete a task template (requires tasks.write)
  server.delete<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const deleted = await store.deleteTemplate(req.params.id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Template not found: ${req.params.id}` },
      });
    }
    log.info({ templateId: req.params.id }, "Task template deleted");
    return reply.send({ ok: true });
  });

  // GET /api/tasks - list tasks (requires tasks.read)
  server.get("/api/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { status, limit, deviceId } = req.query as {
      status?: TaskStatus;
      limit?: number;
      deviceId?: string;
    };
    const tasks = await store.listTasks(status, limit, deviceId);
    return reply.send({ tasks });
  });

  // GET /api/tasks/search - search task history (requires tasks.search)
  server.get("/api/tasks/search", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.search");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { q, status, from, to, limit, deviceId, tags } = req.query as {
      q?: string;
      status?: TaskStatus;
      from?: string;
      to?: string;
      limit?: number;
      deviceId?: string;
      tags?: string;
    };

    if (status && !["pending", "picked", "running", "done", "failed"].includes(status)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid status: ${status}` },
      });
    }

    if (from && isNaN(Date.parse(from))) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Invalid 'from' date format. Use ISO 8601." },
      });
    }

    if (to && isNaN(Date.parse(to))) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Invalid 'to' date format. Use ISO 8601." },
      });
    }

    const parsedTags = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
    const tasks = await store.searchTasks({ q, status, from, to, limit, deviceId, tags: parsedTags });
    return reply.send({ tasks });
  });

  // GET /api/tasks/overdue - list overdue tasks (requires tasks.read)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get("/api/tasks/overdue", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const tasks = await store.listOverdueTasks();
    return reply.send({ tasks, count: tasks.length });
  });

  // POST /api/tasks/bulk/status - bulk status update (requires tasks.status)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/status", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.status");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[]; status?: TaskStatus };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }
    if (!body?.status) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Missing 'status' in request body" },
      });
    }

    const validStatuses: TaskStatus[] = ["pending", "picked", "running", "done", "failed"];
    if (!validStatuses.includes(body.status)) {
      return reply.code(400).send({
        error: { code: "invalid_status", message: `Invalid status: ${body.status}` },
      });
    }

    const result = await store.bulkUpdateStatus(body.ids, body.status);
    log.info({ count: result.updated, errors: result.errors.length }, "Bulk status update completed");

    if (auditStore && result.updated > 0) {
      await auditStore.log({
        action: "task.status_changed",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.updated, status: body.status, ids: body.ids, errors: result.errors },
      });
    }

    // Dispatch webhooks for each successfully updated task
    if (webhookStore && result.updated > 0) {
      for (const taskId of body.ids) {
        if (result.errors.includes(taskId)) continue;
        const task = await store.getTask(taskId);
        if (task) {
          dispatchWebhook(webhookStore, "task.status_changed", task, { bulk: true, status: body.status }).catch(() => {});
        }
      }
    }

    return reply.send({ ok: true, ...result });
  });

  // POST /api/tasks/bulk/assign - bulk assign tasks (requires tasks.assign)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/assign", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.assign");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[]; deviceId?: string };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }
    if (typeof body?.deviceId !== "string" || body.deviceId.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'deviceId' (non-empty string)" },
      });
    }

    const result = await store.bulkAssign(body.ids, body.deviceId.trim());
    log.info({ count: result.updated, deviceId: body.deviceId, errors: result.errors.length }, "Bulk assign completed");

    if (auditStore && result.updated > 0) {
      await auditStore.log({
        action: "task.assigned",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.updated, deviceId: body.deviceId.trim(), ids: body.ids, errors: result.errors },
      });
    }

    return reply.send({ ok: true, ...result });
  });

  // POST /api/tasks/bulk/delete - bulk delete tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/delete", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[] };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }

    const result = await store.bulkDelete(body.ids);
    log.info({ count: result.deleted, errors: result.errors.length }, "Bulk delete completed");

    if (auditStore && result.deleted > 0) {
      await auditStore.log({
        action: "task.status_changed",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, action: "delete", count: result.deleted, ids: body.ids, errors: result.errors },
      });
    }

    return reply.send({ ok: true, ...result });
  });

  // GET /api/tasks/ready - list tasks ready for processing (pending + all deps met)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get("/api/tasks/ready", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { limit, deviceId } = req.query as {
      limit?: number;
      deviceId?: string;
    };
    const tasks = await store.listReadyTasks(limit, deviceId);
    return reply.send({ tasks, count: tasks.length });
  });

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

  // GET /api/tasks/:id - get task detail (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }
    return reply.send({ task });
  });

  // POST /api/tasks/:id/status - update status (requires tasks.status)
  server.post<{
    Params: { id: string };
    Body: { status: TaskStatus };
  }>("/api/tasks/:id/status", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.status");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const { status } = req.body as { status?: TaskStatus };

    if (!status) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Missing 'status' in request body" },
      });
    }

    const validStatuses: TaskStatus[] = ["pending", "picked", "running", "done", "failed"];
    if (!validStatuses.includes(status)) {
      return reply.code(400).send({
        error: { code: "invalid_status", message: `Invalid status: ${status}` },
      });
    }

    try {
      // Get task before update to capture previous status
      const prevTask = await store.getTask(id);
      const previousStatus = prevTask?.status;
      const task = await store.updateTaskStatus(id, status);
      if (auditStore) {
        await auditStore.log({
          action: "task.status_changed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { from: previousStatus, to: status },
        });
      }
      // Dispatch webhook for status change
      if (webhookStore) {
        dispatchWebhook(webhookStore, "task.status_changed", task, { previousStatus }).catch(() => {});
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && e.message.includes("Invalid status transition")) {
        return reply.code(409).send({
          error: { code: "invalid_status", message: e.message },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/result - report result (requires tasks.result)
  server.post<{
    Params: { id: string };
    Body: { success: boolean; summary: string; details?: string };
  }>("/api/tasks/:id/result", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.result");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as {
      success?: boolean;
      summary?: string;
      details?: string;
    };

    if (typeof body?.success !== "boolean" || typeof body?.summary !== "string") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'success' (boolean) and 'summary' (string)",
        },
      });
    }

    try {
      const task = await store.saveTaskResult(
        id,
        body.success,
        body.summary,
        body.details,
      );
      if (auditStore) {
        await auditStore.log({
          action: "task.result_reported",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { success: body.success, summary: body.summary },
        });
      }
      // Dispatch webhook for result report
      if (webhookStore) {
        dispatchWebhook(webhookStore, "task.result_reported", task, { success: body.success, summary: body.summary }).catch(() => {});
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/assign - assign task to device (requires tasks.assign)
  server.post<{
    Params: { id: string };
    Body: { deviceId: string };
  }>("/api/tasks/:id/assign", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.assign");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { deviceId?: string };

    if (typeof body?.deviceId !== "string" || body.deviceId.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'deviceId' (non-empty string)",
        },
      });
    }

    try {
      const task = await store.assignTask(id, body.deviceId.trim());
      log.info({ taskId: id, deviceId: body.deviceId }, "Task assigned to device");
      if (auditStore) {
        await auditStore.log({
          action: "task.assigned",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { deviceId: body.deviceId.trim() },
        });
      }
      // Dispatch webhook for assignment
      if (webhookStore) {
        dispatchWebhook(webhookStore, "task.assigned", task, { deviceId: body.deviceId.trim() }).catch(() => {});
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/unassign - unassign task from device (requires tasks.assign)
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/unassign", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.assign");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;

    try {
      const task = await store.unassignTask(id);
      log.info({ taskId: id }, "Task unassigned from device");
      if (auditStore) {
        await auditStore.log({
          action: "task.unassigned",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
        });
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/tags - add tags to a task (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { tags: string[] };
  }>("/api/tasks/:id/tags", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { tags?: string[] };

    if (!Array.isArray(body?.tags) || body.tags.length === 0) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'tags' (non-empty array of strings)",
        },
      });
    }

    // Validate all tags are non-empty strings
    const validTags = body.tags
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter((t) => t.length > 0);

    if (validTags.length === 0) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "All tags must be non-empty strings",
        },
      });
    }

    try {
      const task = await store.addTags(id, validTags);
      log.info({ taskId: id, tags: validTags }, "Tags added to task");
      if (auditStore) {
        await auditStore.log({
          action: "task.tags_added",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { tags: validTags },
        });
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/tags/:tag - remove a tag from a task (requires tasks.write)
  server.delete<{
    Params: { id: string; tag: string };
  }>("/api/tasks/:id/tags/:tag", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, tag } = req.params;

    if (!tag || tag.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Tag must be a non-empty string" },
      });
    }

    try {
      const task = await store.removeTag(id, tag);
      log.info({ taskId: id, tag }, "Tag removed from task");
      if (auditStore) {
        await auditStore.log({
          action: "task.tags_removed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { tag },
        });
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/due - set or clear due date (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { dueDate: string | null };
  }>("/api/tasks/:id/due", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { dueDate?: string | null };

    if (body?.dueDate !== null && body?.dueDate !== undefined && typeof body.dueDate !== "string") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "'dueDate' must be an ISO 8601 date string or null to clear",
        },
      });
    }

    if (body?.dueDate && isNaN(Date.parse(body.dueDate))) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Invalid date format. Use ISO 8601 (e.g., '2026-06-15' or '2026-06-15T14:00:00Z')",
        },
      });
    }

    try {
      const task = await store.setTaskDueDate(id, body?.dueDate ?? null);
      log.info({ taskId: id, dueDate: body?.dueDate ?? null }, "Task due date updated");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/reminder - set or clear reminder (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { reminderAt: string | null };
  }>("/api/tasks/:id/reminder", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { reminderAt?: string | null };

    if (body?.reminderAt !== null && body?.reminderAt !== undefined && typeof body.reminderAt !== "string") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "'reminderAt' must be an ISO 8601 date string or null to clear",
        },
      });
    }

    if (body?.reminderAt && isNaN(Date.parse(body.reminderAt))) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Invalid date format. Use ISO 8601 (e.g., '2026-06-15T09:00:00Z')",
        },
      });
    }

    try {
      const task = await store.setTaskReminder(id, body?.reminderAt ?? null);
      log.info({ taskId: id, reminderAt: body?.reminderAt ?? null }, "Task reminder updated");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/reset-stale - reset stale tasks (requires tasks.reset_stale)
  server.post("/api/tasks/reset-stale", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.reset_stale");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { timeoutMs?: number } | undefined;
    const timeoutMs = body?.timeoutMs ?? 30 * 60 * 1000; // Default 30 minutes

    const resetCount = await store.resetStaleTasks(timeoutMs);
    log.info({ resetCount, timeoutMs }, "Stale tasks reset");
    if (auditStore && resetCount > 0) {
      await auditStore.log({
        action: "task.reset_stale",
        actor: authCtx.user?.username ?? "system",
        actorType: "system",
        details: { resetCount, timeoutMs },
      });
    }
    return reply.send({ ok: true, resetCount });
  });

  // POST /api/tasks/cleanup-events - clean up old processed events (requires tasks.cleanup)
  server.post("/api/tasks/cleanup-events", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.cleanup");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { retentionDays?: number } | undefined;
    const retentionDays = body?.retentionDays ?? 7; // Default 7 days

    const deletedCount = await store.cleanupProcessedEvents(retentionDays);
    log.info({ deletedCount, retentionDays }, "Processed events cleaned up");
    if (auditStore && deletedCount > 0) {
      await auditStore.log({
        action: "cleanup.processed_events",
        actor: authCtx.user?.username ?? "system",
        actorType: "system",
        details: { deletedCount, retentionDays },
      });
    }
    return reply.send({ ok: true, deletedCount });
  });

  // POST /api/tasks/:id/reply - reply to Feishu message (requires tasks.reply)
  server.post<{
    Params: { id: string };
    Body: { message: string };
  }>("/api/tasks/:id/reply", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.reply");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { message?: string };

    if (typeof body?.message !== "string" || body.message.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'message' (non-empty string)",
        },
      });
    }

    if (!feishuClient) {
      return reply.code(503).send({
        error: {
          code: "not_configured",
          message: "Feishu reply client is not configured",
        },
      });
    }

    try {
      const messageId = await store.getTaskMessageId(id);
      if (!messageId) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }

      await feishuClient.replyToMessage({ messageId, text: body.message });
      log.info({ taskId: id }, "Reply sent to Feishu");
      if (auditStore) {
        await auditStore.log({
          action: "feishu.reply_sent",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
        });
      }
      return reply.send({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error({ taskId: id, err: message }, "Failed to reply to Feishu");
      if (auditStore) {
        await auditStore.log({
          action: "feishu.reply_failed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { error: message },
        });
      }
      return reply.code(502).send({
        error: { code: "feishu_reply_failed", message },
      });
    }
  });

  // ── Task Dependencies ──────────────────────────────────────────────

  // GET /api/tasks/:id/dependencies - get dependencies for a task (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/dependencies", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }

    const dependencyIds = await store.getDependencies(id);
    const blocked = await store.isTaskBlocked(id);

    // Fetch full dependency task objects
    const dependencies: Array<{ id: string; status: string; commandText: string }> = [];
    for (const depId of dependencyIds) {
      const depTask = await store.getTask(depId);
      if (depTask) {
        dependencies.push({ id: depTask.id, status: depTask.status, commandText: depTask.commandText });
      }
    }

    // Also get dependents (tasks waiting on this one)
    const dependentIds = await store.getDependents(id);

    return reply.send({
      dependencies,
      dependentIds,
      blocked,
    });
  });

  // POST /api/tasks/:id/dependencies - set dependencies for a task (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { dependsOn: string[] };
  }>("/api/tasks/:id/dependencies", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { dependsOn?: string[] };

    if (!Array.isArray(body?.dependsOn)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'dependsOn' (array of task IDs)" },
      });
    }

    // Validate all IDs are strings
    const validIds = body.dependsOn.filter((d): d is string => typeof d === "string" && d.trim() !== "");
    if (validIds.length !== body.dependsOn.length) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "All dependency IDs must be non-empty strings" },
      });
    }

    try {
      const task = await store.setDependencies(id, validIds);
      log.info({ taskId: id, dependsOn: validIds }, "Task dependencies set");
      if (auditStore) {
        await auditStore.log({
          action: "task.dependencies_set",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { dependsOn: validIds },
        });
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && (e.message.includes("Circular dependency") || e.message.includes("cannot depend on itself"))) {
        return reply.code(409).send({
          error: { code: "invalid_dependency", message: e.message },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/dependencies/:depId - remove a specific dependency (requires tasks.write)
  server.delete<{
    Params: { id: string; depId: string };
  }>("/api/tasks/:id/dependencies/:depId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, depId } = req.params;

    try {
      // Get current dependencies, remove the specified one, and re-set
      const currentDeps = await store.getDependencies(id);
      if (!currentDeps.includes(depId)) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Dependency not found: ${depId}` },
        });
      }
      const newDeps = currentDeps.filter((d) => d !== depId);
      const task = await store.setDependencies(id, newDeps);
      log.info({ taskId: id, removedDep: depId }, "Task dependency removed");
      if (auditStore) {
        await auditStore.log({
          action: "task.dependencies_set",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { removed: depId, dependsOn: newDeps },
        });
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // GET /api/tasks/:id/comments - list comments for a task (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/comments", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }
    const comments = await store.listComments(id);
    return reply.send({ comments, count: comments.length });
  });

  // POST /api/tasks/:id/comments - add a comment to a task (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { body: string };
  }>("/api/tasks/:id/comments", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { body?: string };

    if (typeof body?.body !== "string" || body.body.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'body' (non-empty string)",
        },
      });
    }

    try {
      const authorType: AuditLogEntry["actorType"] = authCtx.user?.username ? "api" : "system";
      const author = authCtx.user?.username ?? "system";
      const comment = await store.addComment(id, author, authorType, body.body);
      log.info({ taskId: id, commentId: comment.id }, "Comment added to task");
      if (auditStore) {
        await auditStore.log({
          action: "task.comment_added",
          taskId: id,
          actor: author,
          actorType: authorType,
          details: { commentId: comment.id, body: body.body },
        });
      }
      return reply.send({ comment });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/comments/:commentId - delete a comment (requires tasks.write)
  server.delete<{
    Params: { id: string; commentId: string };
  }>("/api/tasks/:id/comments/:commentId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, commentId } = req.params;
    const parsedCommentId = Number(commentId);

    if (isNaN(parsedCommentId) || parsedCommentId <= 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "commentId must be a positive integer" },
      });
    }

    const deleted = await store.deleteComment(parsedCommentId, id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Comment not found: ${commentId}` },
      });
    }

    log.info({ taskId: id, commentId: parsedCommentId }, "Comment deleted from task");
    if (auditStore) {
      await auditStore.log({
        action: "task.comment_deleted",
        taskId: id,
        actor: authCtx.user?.username ?? "system",
        actorType: "api",
        details: { commentId: parsedCommentId },
      });
    }
    return reply.send({ ok: true });
  });

  // Error handler
  server.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      const statusCode =
        error.code === "unauthorized"
          ? 401
          : error.code === "forbidden"
            ? 403
            : error.code === "not_found"
              ? 404
              : error.code === "invalid_status"
                ? 409
                : error.code === "invalid_request"
                  ? 400
                  : error.code === "rate_limited"
                    ? 429
                    : 500;
      return reply.code(statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
    return reply.code(500).send({
      error: { code: "internal_error", message: "Internal server error" },
    });
  });
}
