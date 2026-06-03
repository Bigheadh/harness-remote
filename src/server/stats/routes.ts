import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "../tasks/store.js";
import type { TimeSeriesInterval, TimeSeriesMetric } from "../../shared/types.js";
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

  // GET /api/stats/timeseries — time-series analytics for charts
  // Query params: from (ISO), to (ISO), interval (hour|day|week|month), metric (created|completed|resolution_time)
  server.get("/api/stats/timeseries", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { from, to, interval, metric } = req.query as {
      from?: string;
      to?: string;
      interval?: string;
      metric?: string;
    };

    // Validate interval
    const validIntervals: TimeSeriesInterval[] = ["hour", "day", "week", "month"];
    const effectiveInterval: TimeSeriesInterval = validIntervals.includes(interval as TimeSeriesInterval)
      ? (interval as TimeSeriesInterval)
      : "day";

    // Validate metric
    const validMetrics: TimeSeriesMetric[] = ["created", "completed", "resolution_time"];
    const effectiveMetric: TimeSeriesMetric = validMetrics.includes(metric as TimeSeriesMetric)
      ? (metric as TimeSeriesMetric)
      : "created";

    // Default time range: last 30 days
    const now = new Date();
    const effectiveTo = to ?? now.toISOString();
    const effectiveFrom = from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Basic validation
    if (new Date(effectiveFrom) >= new Date(effectiveTo)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "'from' must be before 'to'" },
      });
    }

    // Limit range to prevent excessive data
    const maxRangeMs = 366 * 24 * 60 * 60 * 1000; // 1 year
    if (new Date(effectiveTo).getTime() - new Date(effectiveFrom).getTime() > maxRangeMs) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Time range cannot exceed 1 year" },
      });
    }

    try {
      const result = await store.getTaskTimeSeries(effectiveFrom, effectiveTo, effectiveInterval, effectiveMetric);
      return reply.send(result);
    } catch (err) {
      log.error({ err }, "Failed to compute time-series data");
      return reply.code(500).send({
        error: { code: "internal_error", message: "Failed to compute time-series data" },
      });
    }
  });
}
