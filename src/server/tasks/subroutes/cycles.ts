import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import type { TaskRouteContext } from "./context.js";
import { CreateCycleBodySchema, parseBody } from "../../openapi/schemas.js";

export function registerCycleRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, log } = ctx;

  // ──────────────────────────────────────────────────────────
  // Cycle (Sprint) management routes
  // ──────────────────────────────────────────────────────────

  // GET /api/cycles — list all cycles
  server.get("/api/cycles", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const query = req.query as Record<string, unknown>;
    const status = typeof query["status"] === "string" ? query["status"] : undefined;
    try {
      const cycles = await store.listCycles(status as import("../../../shared/types.js").CycleStatus | undefined);
      return reply.send({ cycles });
    } catch (e) {
      log.error({ err: e }, "Failed to list cycles");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/cycles/:id — get a single cycle
  server.get("/api/cycles/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const cycle = await store.getCycle(id);
      if (!cycle) {
        return reply.code(404).send({ error: { code: "not_found", message: `Cycle not found: ${id}` } });
      }
      return reply.send({ cycle });
    } catch (e) {
      log.error({ err: e, cycleId: id }, "Failed to get cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // POST /api/cycles — create a new cycle
  server.post("/api/cycles", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const body = parseBody(CreateCycleBodySchema, req.body, reply);
    if (!body) return;
    try {
      const cycle = await store.createCycle({
        name: body.name,
        description: body.description,
        startDate: body.startDate,
        endDate: body.endDate,
        createdBy: authCtx.user?.id ?? "anonymous",
      });
      log.info({ cycleId: cycle.id, name: cycle.name }, "Cycle created");
      return reply.code(201).send({ cycle });
    } catch (e) {
      log.error({ err: e }, "Failed to create cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // PUT /api/cycles/:id — update a cycle
  server.put("/api/cycles/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    try {
      const cycle = await store.updateCycle(id, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        startDate: body.startDate as string | undefined,
        endDate: body.endDate as string | undefined,
        status: body.status as import("../../../shared/types.js").CycleStatus | undefined,
      });
      log.info({ cycleId: id }, "Cycle updated");
      return reply.send({ cycle });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("not found")) {
        return reply.code(404).send({ error: { code: "not_found", message } });
      }
      log.error({ err: e, cycleId: id }, "Failed to update cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // DELETE /api/cycles/:id — delete a cycle
  server.delete("/api/cycles/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      await store.deleteCycle(id);
      log.info({ cycleId: id }, "Cycle deleted");
      return reply.send({ ok: true });
    } catch (e) {
      log.error({ err: e, cycleId: id }, "Failed to delete cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // POST /api/cycles/:id/tasks — add a task to a cycle
  server.post("/api/cycles/:id/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    if (!body.taskId || typeof body.taskId !== "string") {
      return reply.code(400).send({ error: { code: "invalid_request", message: "'taskId' is required" } });
    }
    try {
      const task = await store.addTaskToCycle(body.taskId as string, id);
      log.info({ cycleId: id, taskId: body.taskId }, "Task added to cycle");
      return reply.send({ task });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("not found")) {
        return reply.code(404).send({ error: { code: "not_found", message } });
      }
      log.error({ err: e, cycleId: id }, "Failed to add task to cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // DELETE /api/cycles/tasks/:taskId — remove a task from its cycle
  server.delete("/api/cycles/tasks/:taskId", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { taskId } = req.params as { taskId: string };
    try {
      const task = await store.removeTaskFromCycle(taskId);
      log.info({ taskId }, "Task removed from cycle");
      return reply.send({ task });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("not found")) {
        return reply.code(404).send({ error: { code: "not_found", message } });
      }
      log.error({ err: e, taskId }, "Failed to remove task from cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/cycles/:id/tasks — list tasks in a cycle
  server.get("/api/cycles/:id/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const tasks = await store.listCycleTasks(id);
      return reply.send({ tasks });
    } catch (e) {
      log.error({ err: e, cycleId: id }, "Failed to list cycle tasks");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/cycles/:id/progress — cycle burndown and progress data
  server.get("/api/cycles/:id/progress", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const progress = await store.getCycleProgress(id);
      return reply.send({ progress });
    } catch (e) {
      log.error({ err: e, cycleId: id }, "Failed to get cycle progress");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/activity - global activity feed across all tasks (requires tasks.read)
  server.get("/api/activity", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { limit } = req.query as { limit?: number };
    try {
      const items = await store.getGlobalActivity(limit);
      return reply.send({ items, count: items.length });
    } catch (e) {
      log.error({ err: e }, "Failed to get global activity");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });
}
