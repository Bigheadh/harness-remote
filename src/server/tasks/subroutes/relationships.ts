import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import type { TaskRouteContext } from "./context.js";

export function registerRelationshipRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, log } = ctx;

  // ── Task Relationships (Phase 58) ──────────────────────────────

  server.get<{ Params: { id: string } }>(
    "/api/tasks/:id/relationships",
    async (req, reply) => {
      const { id } = req.params;
      try {
        const relationships = await store.listRelationships(id);
        return reply.send({ relationships });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.code(404).send({ error: { code: "not_found", message: msg } });
        log.error({ err }, "Failed to list relationships");
        return reply.code(500).send({ error: { code: "internal_error", message: "Failed to list relationships" } });
      }
    }
  );

  server.post<{ Params: { id: string }; Body: { relatedTaskId: string; relationshipType: string } }>(
    "/api/tasks/:id/relationships",
    async (req, reply) => {
      const { id } = req.params;
      const { relatedTaskId, relationshipType } = req.body ?? {};
      const validTypes = ["depends_on", "blocks", "relates_to", "duplicates"];
      if (!relatedTaskId || !relationshipType || !validTypes.includes(relationshipType)) {
        return reply.code(400).send({ error: { code: "invalid_request", message: "relatedTaskId and valid relationshipType required" } });
      }
      try {
        await store.addRelationship(id, relatedTaskId, relationshipType as import("../../../shared/types.js").TaskRelationshipType);
        return reply.send({ ok: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.code(404).send({ error: { code: "not_found", message: msg } });
        if (msg.includes("itself")) return reply.code(400).send({ error: { code: "invalid_request", message: msg } });
        log.error({ err }, "Failed to add relationship");
        return reply.code(500).send({ error: { code: "internal_error", message: "Failed to add relationship" } });
      }
    }
  );

  server.delete<{ Params: { id: string; relatedId: string }; Querystring: { type?: string } }>(
    "/api/tasks/:id/relationships/:relatedId",
    async (req, reply) => {
      const { id, relatedId } = req.params;
      const type = req.query.type as import("../../../shared/types.js").TaskRelationshipType | undefined;
      try {
        await store.removeRelationship(id, relatedId, type);
        return reply.send({ ok: true });
      } catch (err: unknown) {
        log.error({ err }, "Failed to remove relationship");
        return reply.code(500).send({ error: { code: "internal_error", message: "Failed to remove relationship" } });
      }
    }
  );

  // Error handler
  server.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      const statusCode =
        error.code === "unauthorized"
          ? 401
          : error.code === "forbidden"
            ? 403
            : error.code === "not_found"
              ? 404
              : error.code === "invalid_status"
                ? 409
                : error.code === "invalid_request"
                  ? 400
                  : error.code === "rate_limited"
                    ? 429
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
