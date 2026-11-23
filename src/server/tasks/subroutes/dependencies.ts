import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import type { TaskRouteContext } from "./context.js";

export function registerDependencyRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, auditStore, log } = ctx;

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

  // GET /api/tasks/:id/dependency-graph - full dependency tree (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/dependency-graph", async (req, reply) => {
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

    try {
      const graph = await store.getDependencyGraph(id);
      return reply.send({ graph });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/lock - lock a task for exclusive processing (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { deviceId?: string; ttlMs?: number };
  }>("/api/tasks/:id/lock", async (req, reply) => {
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
    const body = req.body as { deviceId?: string; ttlMs?: number };

    // Determine the device ID — from body, auth context, or fallback to "api"
    const deviceId = body?.deviceId ?? authCtx.user?.username ?? "api";
    const ttlMs = body?.ttlMs ?? 300000; // Default 5 minutes

    try {
      const lock = await store.lockTask(id, deviceId, ttlMs);
      log.info({ taskId: id, deviceId, expiresAt: lock.expiresAt }, "Task locked");
      return reply.send({ lock });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && e.message.includes("locked by")) {
        return reply.code(409).send({
          error: { code: "locked", message: e.message },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/lock - unlock a task (requires tasks.write)
  server.delete<{
    Params: { id: string };
    Body: { deviceId?: string };
  }>("/api/tasks/:id/lock", async (req, reply) => {
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
    const body = req.body as { deviceId?: string };
    const deviceId = body?.deviceId ?? authCtx.user?.username ?? "api";

    try {
      const unlocked = await store.unlockTask(id, deviceId);
      if (!unlocked) {
        return reply.send({ ok: true, message: "No lock found for this task" });
      }
      log.info({ taskId: id, deviceId }, "Task unlocked");
      return reply.send({ ok: true });
    } catch (e) {
      if (e instanceof Error && e.message.includes("locked by")) {
        return reply.code(403).send({
          error: { code: "lock_mismatch", message: e.message },
        });
      }
      throw e;
    }
  });

  // GET /api/tasks/:id/lock - check if a task is locked (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/lock", async (req, reply) => {
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
    const lock = await store.getTaskLock(id);
    return reply.send({ locked: !!lock, lock: lock ?? null });
  });
}
