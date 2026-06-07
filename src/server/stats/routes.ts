import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "../tasks/store.js";
import type { TimeSeriesInterval, TimeSeriesMetric } from "../../shared/types.js";
import { authenticate, authorize } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";
import { TtlCache } from "../../shared/cache.js";

const log = createLogger({ level: "info" });

/** Default TTL for summary cache: 60 seconds */
const SUMMARY_CACHE_TTL_MS = 60_000;
/** Default TTL for timeseries cache: 30 seconds (more query variants) */
const TIMESERIES_CACHE_TTL_MS = 30_000;

export function registerStatsRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
): void {
  /** Cache keyed by a static string for summary (no params) */
  const summaryCache = new TtlCache<unknown>({ defaultTtlMs: SUMMARY_CACHE_TTL_MS, maxEntries: 10 });
  /** Cache keyed by `${from}|${to}|${interval}|${metric}` for timeseries */
  const timeseriesCache = new TtlCache<unknown>({ defaultTtlMs: TIMESERIES_CACHE_TTL_MS, maxEntries: 50 });
  // GET /api/stats/processing — task processing time analytics
  server.get("/api/stats/processing", async (req: FastifyRequest, reply: FastifyReply) => {
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
      const cached = summaryCache.get("processing");
      if (cached) {
        return reply.send(cached);
      }

      // Query completed tasks with processing timestamps
      const rows = await store.getAllTasks();
      const completed = rows.filter(t => t.completedAt && (t.status === "done" || t.status === "failed"));

      const durations: number[] = [];
      const queueWaits: number[] = [];
      const processingTimes: number[] = [];

      for (const task of completed) {
        if (task.completedAt && task.pickedAt) {
          const wait = new Date(task.pickedAt).getTime() - new Date(task.createdAt).getTime();
          queueWaits.push(wait);
        }
        if (task.completedAt && task.startedAt) {
          const proc = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
          processingTimes.push(proc);
        }
        if (task.completedAt && task.createdAt) {
          const total = new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
          durations.push(total);
        }
      }

      const percentile = (arr: number[], p: number): number | null => {
        if (arr.length === 0) return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil(sorted.length * p / 100) - 1;
        return sorted[Math.max(0, idx)];
      };

      const avg = (arr: number[]): number | null => {
        if (arr.length === 0) return null;
        return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
      };

      const result = {
        totalCompleted: completed.length,
        totalDurationMs: avg(durations),
        avgDurationMs: avg(durations),
        p50DurationMs: percentile(durations, 50),
        p95DurationMs: percentile(durations, 95),
        avgQueueWaitMs: avg(queueWaits),
        avgProcessingMs: avg(processingTimes),
        p50ProcessingMs: percentile(processingTimes, 50),
        p95ProcessingMs: percentile(processingTimes, 95),
        byStatus: {
          done: completed.filter(t => t.status === "done").length,
          failed: completed.filter(t => t.status === "failed").length,
        },
      };

      summaryCache.set("processing", result);
      return reply.send(result);
    } catch (err) {
      log.error({ err }, "Failed to compute processing stats");
      return reply.code(500).send({
        error: { code: "internal_error", message: "Failed to compute processing statistics" },
      });
    }
  });


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
      // Check cache first
      const cached = summaryCache.get("summary");
      if (cached) {
        return reply.send(cached);
      }

      const stats = await store.getTaskStats();

      // Cache the result
      summaryCache.set("summary", stats);

      return reply.send(stats);
    } catch (err) {
      log.error({ err }, "Failed to compute task stats");
      return reply.code(500).send({
        error: { code: "internal_error", message: "Failed to compute task statistics" },
      });
    }
  });

  // GET /api/stats/users — per-user task statistics (who creates tasks and how many)
  server.get("/api/stats/users", async (req: FastifyRequest, reply: FastifyReply) => {
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
      const cached = summaryCache.get("users");
      if (cached) {
        return reply.send(cached);
      }

      const allTasks = await store.getAllTasks();

      // Group by feishuUserId
      const userMap = new Map<string, {
        userId: string;
        total: number;
        byStatus: Record<string, number>;
        done: number;
        failed: number;
        avgResolutionMinutes: number | null;
        lastTaskAt: string | null;
      }>();

      for (const task of allTasks) {
        const uid = task.feishuUserId;
        let entry = userMap.get(uid);
        if (!entry) {
          entry = {
            userId: uid,
            total: 0,
            byStatus: { pending: 0, picked: 0, running: 0, done: 0, failed: 0 },
            done: 0,
            failed: 0,
            avgResolutionMinutes: null,
            lastTaskAt: null,
          };
          userMap.set(uid, entry);
        }
        entry.total++;
        entry.byStatus[task.status] = (entry.byStatus[task.status] || 0) + 1;

        if (task.status === "done") entry.done++;
        if (task.status === "failed") entry.failed++;

        if (!entry.lastTaskAt || task.createdAt > entry.lastTaskAt) {
          entry.lastTaskAt = task.createdAt;
        }
      }

      // Compute avg resolution time per user
      for (const [, entry] of userMap) {
        const completedTasks = allTasks.filter(
          (t) => t.feishuUserId === entry.userId && t.completedAt && t.createdAt && (t.status === "done" || t.status === "failed")
        );
        if (completedTasks.length > 0) {
          const totalMs = completedTasks.reduce((sum, t) => {
            return sum + (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime());
          }, 0);
          entry.avgResolutionMinutes = Math.round(totalMs / completedTasks.length / 60000);
        }
      }

      const users = [...userMap.values()].sort((a, b) => b.total - a.total);

      const result = {
        totalUsers: users.length,
        totalTasks: allTasks.length,
        users,
      };

      summaryCache.set("users", result);
      return reply.send(result);
    } catch (err) {
      log.error({ err }, "Failed to compute per-user stats");
      return reply.code(500).send({
        error: { code: "internal_error", message: "Failed to compute per-user statistics" },
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

    // Build cache key from query params
    const cacheKey = `${effectiveFrom}|${effectiveTo}|${effectiveInterval}|${effectiveMetric}`;

    try {
      // Check cache first
      const cached = timeseriesCache.get(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      const result = await store.getTaskTimeSeries(effectiveFrom, effectiveTo, effectiveInterval, effectiveMetric);

      // Cache the result
      timeseriesCache.set(cacheKey, result);

      return reply.send(result);
    } catch (err) {
      log.error({ err }, "Failed to compute time-series data");
      return reply.code(500).send({
        error: { code: "internal_error", message: "Failed to compute time-series data" },
      });
    }
  });

  // GET /api/stats/time-tracking — aggregated time tracking statistics
  server.get("/api/stats/time-tracking", async (req: FastifyRequest, reply: FastifyReply) => {
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
      const cached = summaryCache.get("time-tracking");
      if (cached) {
        return reply.send(cached);
      }

      const result = await store.getTimeTrackingSummary();
      summaryCache.set("time-tracking", result);
      return reply.send(result);
    } catch (err) {
      log.error({ err }, "Failed to compute time tracking stats");
      return reply.code(500).send({
        error: { code: "internal_error", message: "Failed to compute time tracking statistics" },
      });
    }
  });
}
