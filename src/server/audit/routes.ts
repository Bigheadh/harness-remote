import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuditLogStore } from "./store.js";
import type { AuditAction, AuditLogEntry } from "../../shared/types.js";
import { requireBearerToken } from "../../shared/http.js";
import { AppError } from "../../shared/errors.js";

export function registerAuditRoutes(
  server: FastifyInstance,
  auditStore: AuditLogStore,
  personalToken: string,
): void {
  // Auth hook for /api/audit routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith("/api/audit")) {
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

  // GET /api/audit - query audit log
  server.get("/api/audit", async (req: FastifyRequest, reply: FastifyReply) => {
    const { action, taskId, actor, actorType, from, to, limit } = req.query as {
      action?: AuditAction;
      taskId?: string;
      actor?: string;
      actorType?: AuditLogEntry["actorType"];
      from?: string;
      to?: string;
      limit?: number;
    };

    if (action && !isValidAuditAction(action)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid action: ${action}` },
      });
    }

    if (actorType && !["feishu", "device", "api", "system"].includes(actorType)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid actorType: ${actorType}` },
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

    const entries = await auditStore.query({ action, taskId, actor, actorType, from, to, limit });
    return reply.send({ entries, count: entries.length });
  });

  // GET /api/audit/count - total audit log count
  server.get("/api/audit/count", async (_req, reply) => {
    const count = await auditStore.count();
    return reply.send({ count });
  });

  // POST /api/audit/cleanup - clean up old audit logs
  server.post("/api/audit/cleanup", async (req, reply) => {
    const body = req.body as { retentionDays?: number } | undefined;
    const retentionDays = body?.retentionDays ?? 30;
    const deletedCount = await auditStore.cleanup(retentionDays);
    return reply.send({ ok: true, deletedCount });
  });
}

const VALID_AUDIT_ACTIONS: string[] = [
  "task.created",
  "task.status_changed",
  "task.result_reported",
  "task.assigned",
  "task.unassigned",
  "task.reset_stale",
  "event.received",
  "event.duplicate",
  "event.non_allowed_user",
  "feishu.reply_sent",
  "feishu.reply_failed",
  "cleanup.processed_events",
];

function isValidAuditAction(action: string): boolean {
  return VALID_AUDIT_ACTIONS.includes(action);
}
