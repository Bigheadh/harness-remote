import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "../tasks/store.js";
import { authenticate, authorize } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

export function registerStatsRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
): void {
  // GET /api/stats/summary — comprehensive task statistics
  server.get("/api/stats/summary", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    try {
      const stats = await store.getTaskStats();
      return reply.send(stats);
    } catch (err) {
      log.error({ err }, "Failed to compute task stats");
      return reply.code(500).send({
        error: { code: "internal_error", message: "Failed to compute task statistics" },
      });
    }
  });
}
