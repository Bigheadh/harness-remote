import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import type { TaskRouteContext } from "./context.js";

export function registerSavedViewRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, auditStore, log } = ctx;

  // ─── Saved Views ──────────────────────────────────────────────────────

  // GET /api/saved-views - list saved views (requires tasks.read)
  server.get("/api/saved-views", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { createdBy } = req.query as { createdBy?: string };
    const views = await store.listSavedViews(createdBy);
    return reply.send({ views, count: views.length });
  });

  // GET /api/saved-views/:id - get saved view details (requires tasks.read)
  server.get("/api/saved-views/:id", async (req: FastifyRequest, reply: FastifyReply) => {
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
    const view = await store.getSavedView(id);
    if (!view) {
      return reply.code(404).send({ error: { code: "not_found", message: "Saved view not found" } });
    }
    return reply.send(view);
  });

  // POST /api/saved-views - create a saved view (requires tasks.write)
  server.post("/api/saved-views", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { name, filters } = req.body as { name?: string; filters?: Record<string, unknown> };
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "name is required" } });
    }
    if (!filters || typeof filters !== "object") {
      return reply.code(400).send({ error: { code: "invalid_request", message: "filters object is required" } });
    }

    const createdBy = authCtx.user?.username ?? "api";
    const view = await store.createSavedView(name.trim(), createdBy, filters as import("../../../shared/types.js").SavedViewFilters);

    if (auditStore) {
      await auditStore.log({
        action: "task.created",
        actor: createdBy,
        actorType: "api",
        details: { entity: "saved_view", viewId: view.id, viewName: view.name },
      });
    }

    return reply.code(201).send(view);
  });

  // PUT /api/saved-views/:id - update a saved view (requires tasks.write)
  server.put("/api/saved-views/:id", async (req: FastifyRequest, reply: FastifyReply) => {
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
    const { name, filters } = req.body as { name?: string; filters?: Record<string, unknown> };
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (filters !== undefined) updates.filters = filters;

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "At least one of name or filters must be provided" } });
    }

    try {
      const view = await store.updateSavedView(id, updates as Partial<import("../../../shared/types.js").SavedView>);
      return reply.send(view);
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({ error: { code: "not_found", message: "Saved view not found" } });
      }
      throw e;
    }
  });

  // DELETE /api/saved-views/:id - delete a saved view (requires tasks.write)
  server.delete("/api/saved-views/:id", async (req: FastifyRequest, reply: FastifyReply) => {
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
    const deleted = await store.deleteSavedView(id);
    if (!deleted) {
      return reply.code(404).send({ error: { code: "not_found", message: "Saved view not found" } });
    }
    return reply.send({ ok: true });
  });
}
