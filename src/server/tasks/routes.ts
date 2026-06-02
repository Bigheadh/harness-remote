import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "./store.js";
import type { TaskStatus } from "../../shared/types.js";
import type { FeishuReplyClient } from "../feishu/client.js";
import { requireBearerToken } from "../../shared/http.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

export function registerTaskRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
  feishuClient?: FeishuReplyClient,
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
    const { status, limit } = req.query as {
      status?: TaskStatus;
      limit?: number;
    };
    const tasks = await store.listTasks(status, limit);
    return reply.send({ tasks });
  });

  // GET /api/tasks/search - search task history
  server.get("/api/tasks/search", async (req: FastifyRequest, reply: FastifyReply) => {
    const { q, status, from, to, limit } = req.query as {
      q?: string;
      status?: TaskStatus;
      from?: string;
      to?: string;
      limit?: number;
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

    const tasks = await store.searchTasks({ q, status, from, to, limit });
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
    return reply.send({ ok: true, resetCount });
  });

  // POST /api/tasks/cleanup-events - clean up old processed events
  server.post("/api/tasks/cleanup-events", async (req, reply) => {
    const body = req.body as { retentionDays?: number } | undefined;
    const retentionDays = body?.retentionDays ?? 7; // Default 7 days

    const deletedCount = await store.cleanupProcessedEvents(retentionDays);
    log.info({ deletedCount, retentionDays }, "Processed events cleaned up");
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
      return reply.send({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error({ taskId: id, err: message }, "Failed to reply to Feishu");
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
