import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import type { TaskRouteContext } from "./context.js";

export function registerWatcherAndTimeRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, log } = ctx;

  // ===== Task Watchers =====

  // GET /api/tasks/:id/watchers - list watchers for a task
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/watchers", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const watchers = await store.listWatchers(id);
      return reply.send({ watchers, count: watchers.length });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to list watchers");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to list watchers" } });
    }
  });

  // POST /api/tasks/:id/watchers - add yourself as a watcher
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/watchers", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const userId = authCtx.user?.id ?? "anonymous";
      const watcher = await store.addWatcher(id, userId);
      log.info({ taskId: id, userId }, "Task watcher added");
      return reply.code(201).send({ watcher });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to add watcher");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to add watcher" } });
    }
  });

  // DELETE /api/tasks/:id/watchers - remove yourself as a watcher
  server.delete<{
    Params: { id: string };
  }>("/api/tasks/:id/watchers", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const userId = authCtx.user?.id ?? "anonymous";
      const removed = await store.removeWatcher(id, userId);
      log.info({ taskId: id, userId, removed }, "Task watcher removed");
      return reply.send({ ok: true, removed });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to remove watcher");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to remove watcher" } });
    }
  });

  // ===== Time Entry Routes =====

  // GET /api/tasks/:id/time-entries - list time entries for a task
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/time-entries", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const entries = await store.listTimeEntries(id);
      return reply.send({ entries, count: entries.length });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to list time entries");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to list time entries" } });
    }
  });

  // POST /api/tasks/:id/time-entries - log a time entry (manual or timer-based)
  server.post<{
    Params: { id: string };
    Body: { startedAt?: string; endedAt?: string; durationMinutes?: number; description?: string; loggedBy?: string };
  }>("/api/tasks/:id/time-entries", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const { startedAt, endedAt, durationMinutes, description, loggedBy } = req.body ?? {};
      const now = new Date().toISOString();
      const start = startedAt ?? now;
      let end = endedAt;
      let duration = durationMinutes ?? 0;
      if (start && end && !durationMinutes) {
        duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
      }
      if (!end && !durationMinutes) {
        // Running entry (no end yet)
        end = undefined;
        duration = 0;
      }
      const actor = authCtx.user?.id ?? loggedBy ?? "anonymous";
      const entry = await store.createTimeEntry(id, start, end, duration, description ?? null, actor);
      return reply.code(201).send({ entry });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to create time entry");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to create time entry" } });
    }
  });

  // POST /api/tasks/:id/time-entries/start - start a timer for a task
  server.post<{
    Params: { id: string };
    Body: { description?: string; loggedBy?: string };
  }>("/api/tasks/:id/time-entries/start", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const { description, loggedBy } = req.body ?? {};
      const now = new Date().toISOString();
      const actor = authCtx.user?.id ?? loggedBy ?? "anonymous";
      const entry = await store.createTimeEntry(id, now, undefined, 0, description ?? null, actor);
      return reply.code(201).send({ entry });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to start time tracking");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to start time tracking" } });
    }
  });

  // POST /api/tasks/:id/time-entries/stop - stop a running timer
  server.post<{
    Params: { id: string; entryId?: string };
    Body: { entryId?: string };
  }>("/api/tasks/:id/time-entries/stop", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const { entryId } = req.body ?? req.params;
      if (!entryId) {
        return reply.code(400).send({ error: { code: "invalid_request", message: "entryId is required" } });
      }
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const now = new Date().toISOString();
      const entry = await store.stopTimeEntry(id, entryId, now);
      return reply.send({ entry });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      const message = err instanceof Error ? err.message : "Failed to stop time tracking";
      return reply.code(400).send({ error: { code: "invalid_request", message } });
    }
  });

  // DELETE /api/tasks/:id/time-entries/:entryId - delete a time entry
  server.delete<{
    Params: { id: string; entryId: string };
  }>("/api/tasks/:id/time-entries/:entryId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id, entryId } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const deleted = await store.deleteTimeEntry(id, entryId);
      if (!deleted) {
        return reply.code(404).send({ error: { code: "not_found", message: "Time entry not found" } });
      }
      return reply.send({ deleted: true });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to delete time entry");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to delete time entry" } });
    }
  });
}
