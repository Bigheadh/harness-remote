/**
 * Prometheus-compatible metrics endpoint.
 *
 * GET /metrics — Returns metrics in Prometheus exposition format (text/plain).
 * No authentication required (Prometheus scrapers typically don't send auth).
 *
 * The endpoint queries the task store for current task counts, combines them
 * with in-memory counters from the collector module, and outputs Prometheus-
 * compatible text.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "../tasks/store.js";
import { formatMetrics } from "./collector.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

export function registerMetricsRoutes(
  server: FastifyInstance,
  store: TaskStore,
): void {
  // GET /metrics — Prometheus scrape endpoint (no auth required)
  server.get("/metrics", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const taskCounts = await store.countTasksByStatus();
      const body = formatMetrics(taskCounts);
      return reply
        .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        .send(body);
    } catch (err) {
      log.error({ err }, "Failed to generate metrics");
      return reply.code(500).send("# Error generating metrics\n");
    }
  });
}
