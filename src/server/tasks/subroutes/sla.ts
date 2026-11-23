import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskPriority } from "../../../shared/types.js";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import { buildSlaBreachCard } from "../../feishu/card-builder.js";
import { recordSlaEvent } from "../../metrics/collector.js";
import type { TaskRouteContext } from "./context.js";

export function registerSlaRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, feishuClient, log } = ctx;

  // ── SLA Management ──────────────────────────────────────────────

  // GET /api/sla/policies - list all SLA policies (requires tasks.read)
  server.get("/api/sla/policies", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const policies = await store.listSlaPolicies();
    return reply.send({ policies });
  });

  // GET /api/sla/policies/:id - get an SLA policy by ID (requires tasks.read)
  server.get<{ Params: { id: string } }>("/api/sla/policies/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const policy = await store.getSlaPolicy(req.params.id);
    if (!policy) {
      return reply.code(404).send({
        error: { code: "not_found", message: `SLA policy not found: ${req.params.id}` },
      });
    }
    return reply.send({ policy });
  });

  // POST /api/sla/policies - create an SLA policy (requires tasks.write)
  server.post("/api/sla/policies", async (req: FastifyRequest, reply: FastifyReply) => {
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
      targetMinutes?: number;
      warningThresholdPercent?: number;
      matchPriorities?: string[];
      matchTags?: string[];
      enabled?: boolean;
    };

    if (typeof body?.name !== "string" || body.name.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'name' (non-empty string)" },
      });
    }
    if (typeof body?.targetMinutes !== "number" || body.targetMinutes <= 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'targetMinutes' (positive number in minutes)" },
      });
    }

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.matchPriorities && body.matchPriorities.length > 0) {
      const invalid = body.matchPriorities.filter((p) => !validPriorities.includes(p));
      if (invalid.length > 0) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: `Invalid priorities: ${invalid.join(", ")}. Must be one of: ${validPriorities.join(", ")}` },
        });
      }
    }

    const policy = await store.createSlaPolicy({
      name: body.name.trim(),
      description: body.description,
      targetMinutes: body.targetMinutes,
      warningThresholdPercent: body.warningThresholdPercent ?? 80,
      matchPriorities: body.matchPriorities as TaskPriority[] | undefined,
      matchTags: body.matchTags,
      enabled: body.enabled ?? true,
      createdBy: authCtx.user?.username ?? "api",
    });
    log.info({ policyId: policy.id, name: policy.name }, "SLA policy created");
    return reply.code(201).send({ policy });
  });

  // PUT /api/sla/policies/:id - update an SLA policy (requires tasks.write)
  server.put<{ Params: { id: string } }>("/api/sla/policies/:id", async (req, reply) => {
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
      targetMinutes?: number;
      warningThresholdPercent?: number;
      matchPriorities?: string[];
      matchTags?: string[];
      enabled?: boolean;
    };

    if (body.targetMinutes !== undefined && (typeof body.targetMinutes !== "number" || body.targetMinutes <= 0)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "'targetMinutes' must be a positive number" },
      });
    }

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.matchPriorities && body.matchPriorities.length > 0) {
      const invalid = body.matchPriorities.filter((p) => !validPriorities.includes(p));
      if (invalid.length > 0) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: `Invalid priorities: ${invalid.join(", ")}` },
        });
      }
    }

    try {
      const policy = await store.updateSlaPolicy(req.params.id, {
        name: body.name,
        description: body.description,
        targetMinutes: body.targetMinutes,
        warningThresholdPercent: body.warningThresholdPercent,
        matchPriorities: body.matchPriorities as TaskPriority[] | undefined,
        matchTags: body.matchTags,
        enabled: body.enabled,
      });
      log.info({ policyId: policy.id }, "SLA policy updated");
      return reply.send({ policy });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `SLA policy not found: ${req.params.id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/sla/policies/:id - delete an SLA policy (requires tasks.write)
  server.delete<{ Params: { id: string } }>("/api/sla/policies/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const deleted = await store.deleteSlaPolicy(req.params.id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `SLA policy not found: ${req.params.id}` },
      });
    }
    log.info({ policyId: req.params.id }, "SLA policy deleted");
    return reply.send({ ok: true });
  });

  // GET /api/sla/summary - get SLA compliance summary (requires tasks.read)
  server.get("/api/sla/summary", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const summary = await store.getSlaSummary();
    return reply.send(summary);
  });

  // GET /api/sla/breaches - list active SLA breaches (requires tasks.read)
  server.get("/api/sla/breaches", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const breaches = await store.listSlaBreaches();
    return reply.send({ breaches, count: breaches.length });
  });

  // POST /api/sla/check - trigger SLA breach detection (requires tasks.write)
  server.post("/api/sla/check", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const result = await store.checkAndRecordSlaBreaches();
    log.info({ warnings: result.warnings, breaches: result.breaches }, "SLA breach check completed");

    // Record SLA metrics
    if (result.warnings > 0) {
      for (let i = 0; i < result.warnings; i++) {
        recordSlaEvent("warning");
      }
    }
    if (result.breaches > 0) {
      for (let i = 0; i < result.breaches; i++) {
        recordSlaEvent("breach");
      }
    }

    // Send Feishu notifications for SLA breaches and warnings
    if (feishuClient && result.details.length > 0) {
      for (const detail of result.details) {
        if (detail.taskFeishuMessageId) {
          const card = buildSlaBreachCard(
            {
              id: detail.taskId,
              feishuMessageId: detail.taskFeishuMessageId,
              commandText: detail.taskCommandText,
              priority: detail.taskPriority,
              status: detail.taskStatus,
              tags: detail.taskTags,
            } as any,
            detail.policyName,
            detail.breachType,
            detail.targetMinutes,
            detail.actualMinutes,
          );
          feishuClient.sendCardMessage({ messageId: detail.taskFeishuMessageId, card }).catch((err) => {
            log.warn({ taskId: detail.taskId, err: err instanceof Error ? err.message : String(err) }, "Failed to send SLA breach notification to Feishu");
          });
        }
      }
    }

    return reply.send({ ok: true, ...result });
  });

  // GET /api/tasks/:id/sla - get SLA status for a specific task (requires tasks.read)
  server.get<{ Params: { id: string } }>("/api/tasks/:id/sla", async (req, reply) => {
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

    const slaStatus = await store.getSlaStatusForTask(id);
    return reply.send(slaStatus);
  });
}
