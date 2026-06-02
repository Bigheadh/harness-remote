import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "../tasks/store.js";
import type { ScheduleFrequency } from "../../shared/types.js";
import type { AuditLogStore } from "../audit/store.js";
import { authenticate, authorize } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

const VALID_FREQUENCIES: ScheduleFrequency[] = ["once", "hourly", "daily", "weekly", "monthly"];

export function registerScheduledTaskRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
  auditStore?: AuditLogStore,
): void {
  // GET /api/scheduled-tasks — list all scheduled tasks (requires tasks.read)
  server.get("/api/scheduled-tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const scheduledTasks = await store.listScheduledTasks();
    return reply.send({ scheduledTasks });
  });

  // GET /api/scheduled-tasks/:id — get a scheduled task by ID (requires tasks.read)
  server.get<{ Params: { id: string } }>("/api/scheduled-tasks/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const scheduled = await store.getScheduledTask(req.params.id);
    if (!scheduled) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Scheduled task not found: ${req.params.id}` },
      });
    }
    return reply.send({ scheduledTask: scheduled });
  });

  // POST /api/scheduled-tasks — create a scheduled task (requires tasks.write)
  server.post("/api/scheduled-tasks", async (req: FastifyRequest, reply: FastifyReply) => {
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
      commandText?: string;
      frequency?: ScheduleFrequency;
      priority?: string;
      tags?: string[];
      assignedDeviceId?: string;
      nextRunAt?: string;
      enabled?: boolean;
      templateId?: string;
    };

    if (typeof body?.commandText !== "string" || body.commandText.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'commandText' (non-empty string)" },
      });
    }
    if (!body.frequency || !VALID_FREQUENCIES.includes(body.frequency)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid frequency: ${body.frequency}. Must be one of: ${VALID_FREQUENCIES.join(", ")}` },
      });
    }
    if (body.nextRunAt && isNaN(Date.parse(body.nextRunAt))) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Invalid 'nextRunAt' date format. Use ISO 8601." },
      });
    }

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid priority: ${body.priority}. Must be one of: ${validPriorities.join(", ")}` },
      });
    }

    const now = new Date().toISOString();
    const scheduled = await store.createScheduledTask({
      commandText: body.commandText.trim(),
      frequency: body.frequency,
      priority: body.priority as "low" | "normal" | "high" | "urgent" | undefined,
      tags: body.tags,
      assignedDeviceId: body.assignedDeviceId,
      nextRunAt: body.nextRunAt ?? now,
      enabled: body.enabled !== false,
      templateId: body.templateId,
      createdBy: authCtx.user?.username ?? "api",
    });

    log.info({ scheduledId: scheduled.id, frequency: scheduled.frequency }, "Scheduled task created");
    return reply.code(201).send({ scheduledTask: scheduled });
  });

  // PUT /api/scheduled-tasks/:id — update a scheduled task (requires tasks.write)
  server.put<{ Params: { id: string } }>("/api/scheduled-tasks/:id", async (req, reply) => {
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
      commandText?: string;
      frequency?: ScheduleFrequency;
      priority?: string;
      tags?: string[];
      assignedDeviceId?: string;
      nextRunAt?: string;
      enabled?: boolean;
      templateId?: string;
    };

    if (body.frequency && !VALID_FREQUENCIES.includes(body.frequency)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid frequency: ${body.frequency}. Must be one of: ${VALID_FREQUENCIES.join(", ")}` },
      });
    }

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid priority: ${body.priority}. Must be one of: ${validPriorities.join(", ")}` },
      });
    }

    try {
      const scheduled = await store.updateScheduledTask(req.params.id, {
        commandText: body.commandText,
        frequency: body.frequency,
        priority: body.priority as "low" | "normal" | "high" | "urgent" | undefined,
        tags: body.tags,
        assignedDeviceId: body.assignedDeviceId,
        nextRunAt: body.nextRunAt,
        enabled: body.enabled,
        templateId: body.templateId,
      });
      log.info({ scheduledId: scheduled.id }, "Scheduled task updated");
      return reply.send({ scheduledTask: scheduled });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Scheduled task not found: ${req.params.id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/scheduled-tasks/:id — delete a scheduled task (requires tasks.write)
  server.delete<{ Params: { id: string } }>("/api/scheduled-tasks/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const deleted = await store.deleteScheduledTask(req.params.id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Scheduled task not found: ${req.params.id}` },
      });
    }
    log.info({ scheduledId: req.params.id }, "Scheduled task deleted");
    return reply.send({ ok: true });
  });

  // POST /api/scheduled-tasks/:id/run — manually trigger a scheduled task (requires tasks.write)
  server.post<{ Params: { id: string } }>("/api/scheduled-tasks/:id/run", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const scheduled = await store.getScheduledTask(req.params.id);
    if (!scheduled) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Scheduled task not found: ${req.params.id}` },
      });
    }

    // Create the task
    const now = new Date().toISOString();
    const task = await store.createTask({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: "feishu",
      feishuMessageId: `sched_${scheduled.id}_${Date.now()}`,
      feishuChatId: "",
      feishuUserId: scheduled.createdBy,
      commandText: scheduled.commandText,
      status: "pending",
      priority: scheduled.priority as "low" | "normal" | "high" | "urgent",
      tags: scheduled.tags,
      assignedDeviceId: scheduled.assignedDeviceId,
      createdAt: now,
      updatedAt: now,
    });

    // Calculate next run
    const { calculateNextRun } = await import("../scheduler/index.js");
    const nextRunAt = calculateNextRun(scheduled.frequency, scheduled.lastRunAt);
    await store.markScheduledTaskRun(scheduled.id, nextRunAt, task.id);

    log.info({ scheduledId: scheduled.id, taskId: task.id }, "Scheduled task manually triggered");
    return reply.send({ task, scheduledTask: await store.getScheduledTask(req.params.id) });
  });
}
