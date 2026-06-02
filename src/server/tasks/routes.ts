import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "./store.js";
import type { TaskStatus } from "../../shared/types.js";
import type { FeishuReplyClient } from "../feishu/client.js";
import type { AuditLogStore } from "../audit/store.js";
import { requireBearerToken } from "../../shared/http.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

export function registerTaskRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
  feishuClient?: FeishuReplyClient,
  auditStore?: AuditLogStore,
): void {
  // Health endpoint with DB connectivity check
  server.get("/health", async (_req, reply) => {
    const dbOk = await store.healthCheck();
    if (!dbOk) {
      return reply.code(503).send({ ok: false, error: "Database unreachable" });
    }
    return reply.send({ ok: true });
  });

  // Auth hook for /api/* routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith("/api/")) {
      try {
        requireBearerToken(req.headers["authorization"], personalToken);
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

  // GET /api/tasks - list tasks
  server.get("/api/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const { status, limit, deviceId } = req.query as {
      status?: TaskStatus;
      limit?: number;
      deviceId?: string;
    };
    const tasks = await store.listTasks(status, limit, deviceId);
    return reply.send({ tasks });
  });

  // GET /api/tasks/search - search task history
  server.get("/api/tasks/search", async (req: FastifyRequest, reply: FastifyReply) => {
    const { q, status, from, to, limit, deviceId } = req.query as {
      q?: string;
      status?: TaskStatus;
      from?: string;
      to?: string;
      limit?: number;
      deviceId?: string;
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

    const tasks = await store.searchTasks({ q, status, from, to, limit, deviceId });
    return reply.send({ tasks });
  });

  // GET /api/tasks/:id - get task detail
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id", async (req, reply) => {
    const { id } = req.params;
    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }
    return reply.send({ task });
  });

  // POST /api/tasks/:id/status - update status
  server.post<{
    Params: { id: string };
    Body: { status: TaskStatus };
  }>("/api/tasks/:id/status", async (req, reply) => {
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
      const task = await store.updateTaskStatus(id, status);
      if (auditStore) {
        await auditStore.log({
          action: "task.status_changed",
          taskId: id,
          actor: "api",
          actorType: "api",
          details: { from: task.status, to: status },
        });
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

  // POST /api/tasks/:id/result - report result
  server.post<{
    Params: { id: string };
    Body: { success: boolean; summary: string; details?: string };
  }>("/api/tasks/:id/result", async (req, reply) => {
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
          actor: "api",
          actorType: "api",
          details: { success: body.success, summary: body.summary },
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

  // POST /api/tasks/:id/assign - assign task to device
  server.post<{
    Params: { id: string };
    Body: { deviceId: string };
  }>("/api/tasks/:id/assign", async (req, reply) => {
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
          actor: body.deviceId.trim(),
          actorType: "device",
          details: { deviceId: body.deviceId.trim() },
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

  // POST /api/tasks/:id/unassign - unassign task from device
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/unassign", async (req, reply) => {
    const { id } = req.params;

    try {
      const task = await store.unassignTask(id);
      log.info({ taskId: id }, "Task unassigned from device");
      if (auditStore) {
        await auditStore.log({
          action: "task.unassigned",
          taskId: id,
          actor: "api",
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

  // POST /api/tasks/reset-stale - reset stale tasks back to pending
  server.post("/api/tasks/reset-stale", async (req, reply) => {
    const body = req.body as { timeoutMs?: number } | undefined;
    const timeoutMs = body?.timeoutMs ?? 30 * 60 * 1000; // Default 30 minutes

    const resetCount = await store.resetStaleTasks(timeoutMs);
    log.info({ resetCount, timeoutMs }, "Stale tasks reset");
    if (auditStore && resetCount > 0) {
      await auditStore.log({
        action: "task.reset_stale",
        actor: "system",
        actorType: "system",
        details: { resetCount, timeoutMs },
      });
    }
    return reply.send({ ok: true, resetCount });
  });

  // POST /api/tasks/cleanup-events - clean up old processed events
  server.post("/api/tasks/cleanup-events", async (req, reply) => {
    const body = req.body as { retentionDays?: number } | undefined;
    const retentionDays = body?.retentionDays ?? 7; // Default 7 days

    const deletedCount = await store.cleanupProcessedEvents(retentionDays);
    log.info({ deletedCount, retentionDays }, "Processed events cleaned up");
    if (auditStore && deletedCount > 0) {
      await auditStore.log({
        action: "cleanup.processed_events",
        actor: "system",
        actorType: "system",
        details: { deletedCount, retentionDays },
      });
    }
    return reply.send({ ok: true, deletedCount });
  });

  // POST /api/tasks/:id/reply - reply to Feishu message
  server.post<{
    Params: { id: string };
    Body: { message: string };
  }>("/api/tasks/:id/reply", async (req, reply) => {
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
          actor: "api",
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
          actor: "api",
          actorType: "api",
          details: { error: message },
        });
      }
      return reply.code(502).send({
        error: { code: "feishu_reply_failed", message },
      });
    }
  });

  // Error handler
  server.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      const statusCode =
        error.code === "unauthorized"
          ? 401
          : error.code === "not_found"
            ? 404
            : error.code === "invalid_status"
              ? 409
              : error.code === "invalid_request"
                ? 400
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
