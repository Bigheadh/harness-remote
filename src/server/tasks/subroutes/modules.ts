import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import type { TaskRouteContext } from "./context.js";
import { CreateModuleBodySchema, parseBody } from "../../openapi/schemas.js";

export function registerModuleRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, log } = ctx;

  // ─── Module (Epic) Management Routes ───

  // GET /api/modules — list all modules with progress
  server.get("/api/modules", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { status } = req.query as { status?: string };
    try {
      const modules = await store.listModules(status as import("../../../shared/types.js").ModuleStatus | undefined);
      return reply.send({ modules, count: modules.length });
    } catch (e) {
      log.error({ err: e }, "Failed to list modules");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/modules/:id — get a single module with progress
  server.get("/api/modules/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const mod = await store.getModule(id);
      if (!mod) {
        return reply.code(404).send({ error: { code: "not_found", message: `Module not found: ${id}` } });
      }
      return reply.send({ module: mod });
    } catch (e) {
      log.error({ err: e, moduleId: id }, "Failed to get module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // POST /api/modules — create a new module
  server.post("/api/modules", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const body = parseBody(CreateModuleBodySchema, req.body, reply);
    if (!body) return;

    try {
      const mod = await store.createModule({
        name: body.name,
        description: body.description,
        startDate: body.startDate,
        endDate: body.endDate,
        createdBy: authCtx.user?.username ?? "api",
      });
      log.info({ moduleId: mod.id, name: mod.name }, "Module created");
      return reply.code(201).send({ module: mod });
    } catch (e) {
      log.error({ err: e }, "Failed to create module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // PUT /api/modules/:id — update a module
  server.put("/api/modules/:id", async (req: FastifyRequest, reply: FastifyReply) => {
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
    const body = req.body as {
      name?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      targetCompletionPercent?: number;
    } | undefined;

    const validStatuses = ["planned", "active", "completed", "archived"];
    if (body?.status !== undefined && !validStatuses.includes(body.status)) {
      return reply.code(400).send({ error: { code: "validation_error", message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` } });
    }

    try {
      const mod = await store.updateModule(id, {
        name: body?.name,
        description: body?.description,
        status: body?.status as import("../../../shared/types.js").ModuleStatus | undefined,
        startDate: body?.startDate,
        endDate: body?.endDate,
        targetCompletionPercent: body?.targetCompletionPercent,
      });
      log.info({ moduleId: id }, "Module updated");
      return reply.send({ module: mod });
    } catch (e) {
      if (e instanceof Error && e.message === "Module not found") {
        return reply.code(404).send({ error: { code: "not_found", message: `Module not found: ${id}` } });
      }
      log.error({ err: e, moduleId: id }, "Failed to update module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // DELETE /api/modules/:id — delete a module
  server.delete("/api/modules/:id", async (req: FastifyRequest, reply: FastifyReply) => {
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
      await store.deleteModule(id);
      log.info({ moduleId: id }, "Module deleted");
      return reply.send({ success: true });
    } catch (e) {
      log.error({ err: e, moduleId: id }, "Failed to delete module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // POST /api/modules/:id/tasks — add a task to a module
  server.post("/api/modules/:id/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
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
    const body = req.body as { taskId?: string } | undefined;
    if (typeof body?.taskId !== "string" || body.taskId.trim() === "") {
      return reply.code(400).send({ error: { code: "validation_error", message: "taskId is required" } });
    }
    try {
      const task = await store.addTaskToModule(body.taskId.trim(), id);
      log.info({ moduleId: id, taskId: body.taskId }, "Task added to module");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && (e.message === "Task not found" || e.message === "Module not found")) {
        return reply.code(404).send({ error: { code: "not_found", message: e.message } });
      }
      log.error({ err: e, moduleId: id }, "Failed to add task to module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // DELETE /api/modules/:id/tasks/:taskId — remove a task from its module
  server.delete("/api/modules/:id/tasks/:taskId", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { taskId } = req.params as { id: string; taskId: string };
    try {
      const task = await store.removeTaskFromModule(taskId);
      log.info({ taskId }, "Task removed from module");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message === "Task not found") {
        return reply.code(404).send({ error: { code: "not_found", message: e.message } });
      }
      log.error({ err: e, taskId }, "Failed to remove task from module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/modules/:id/tasks — list tasks in a module
  server.get("/api/modules/:id/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const tasks = await store.listModuleTasks(id);
      return reply.send({ tasks, count: tasks.length });
    } catch (e) {
      log.error({ err: e, moduleId: id }, "Failed to list module tasks");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });
}
