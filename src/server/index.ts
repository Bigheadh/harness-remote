import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Fastify, { type FastifyRequest } from "fastify";
import { loadServerConfig } from "./config.js";
import { createTaskStore } from "./tasks/store.js";
import { registerTaskRoutes } from "./tasks/routes.js";
import { registerFeishuRoutes } from "./feishu/events.js";
import { createFeishuReplyClient } from "./feishu/client.js";
import { registerDashboardRoutes } from "./dashboard/routes.js";
import { createDeviceStore } from "./devices/store.js";
import { registerDeviceRoutes } from "./devices/routes.js";
import { createAuditLogStore } from "./audit/store.js";
import { registerAuditRoutes } from "./audit/routes.js";
import { createUserStore } from "./auth/store.js";
import { registerUserRoutes } from "./auth/routes.js";
import { createApiKeyStore } from "./auth/apikeys/store.js";
import { registerApiKeyRoutes } from "./auth/apikeys/routes.js";
import { createWebhookStore } from "./webhooks/store.js";
import { registerWebhookRoutes } from "./webhooks/routes.js";
import { startRetryWorker, setWebhookTimeoutMs } from "./webhooks/dispatcher.js";
import { RateLimiter } from "./ratelimit/limiter.js";
import { registerRateLimitHook } from "./ratelimit/middleware.js";
import { registerScheduledTaskRoutes } from "./scheduled/routes.js";
import { startScheduler } from "./scheduler/index.js";
import { registerStatsRoutes } from "./stats/routes.js";
import { registerSseRoutes } from "./sse/routes.js";
import { closeAllClients } from "./sse/broadcaster.js";
import { registerMetricsRoutes } from "./metrics/routes.js";
import { recordHttpRequest } from "./metrics/collector.js";
import { createApiUsageStore } from "./apiusage/store.js";
import { registerUsageTrackingHook } from "./apiusage/middleware.js";
import { registerUsageRoutes } from "./apiusage/routes.js";
import { registerOpenApiRoutes } from "./openapi/routes.js";
import compress from "@fastify/compress";
import { createLogger } from "../shared/logger.js";

const configPath = process.argv.includes("--config")
  ? process.argv[process.argv.indexOf("--config") + 1]
  : undefined;

/**
 * Safely derive sibling SQLite file paths regardless of whether storagePath ends in .sqlite or .db.
 */
export function deriveStorePath(basePath: string, suffix: string): string {
  if (/\.sqlite$/i.test(basePath)) {
    return basePath.replace(/\.sqlite$/i, `.${suffix}.sqlite`);
  }
  if (/\.db$/i.test(basePath)) {
    return basePath.replace(/\.db$/i, `.${suffix}.db`);
  }
  return `${basePath}.${suffix}.sqlite`;
}

/** Redact sensitive token query parameters before logging request URLs */
function redactUrlTokens(url: string): string {
  return url.replace(/([?&](?:token|personalToken|api_key|apiKey)=)[^&]+/gi, "$1[REDACTED]");
}

export async function startServer(): Promise<void> {
  const config = loadServerConfig(configPath);
  const log = createLogger({ level: "info" });

  log.info({ port: config.port }, "Starting harness-remote server");

  if (config.webhookTimeoutMs !== undefined) {
    setWebhookTimeoutMs(config.webhookTimeoutMs);
  }

  // Ensure data directory exists
  mkdirSync(dirname(config.storagePath), { recursive: true });

  const store = createTaskStore(config.storagePath);
  const deviceStore = createDeviceStore(deriveStorePath(config.storagePath, "devices"));
  const auditStore = createAuditLogStore(deriveStorePath(config.storagePath, "audit"));
  const userStore = createUserStore(deriveStorePath(config.storagePath, "users"));
  const webhookStore = createWebhookStore(deriveStorePath(config.storagePath, "webhooks"));
  const apiKeyStore = createApiKeyStore(deriveStorePath(config.storagePath, "apikeys"));
  const usageStore = createApiUsageStore(deriveStorePath(config.storagePath, "usage"));

  const server = Fastify({
    logger: false, // We use our own redacting logger
  });

  // Enable response compression (gzip/deflate) for all routes
  await server.register(compress, {
    threshold: 1024, // Only compress responses larger than 1KB
    encodings: ["gzip", "deflate"],
  });

  // Request ID tracing & logging middleware
  server.addHook("onRequest", async (req, reply) => {
    const incoming = req.headers["x-request-id"];
    const reqId =
      typeof incoming === "string" && incoming.trim().length > 0 && incoming.length <= 128
        ? incoming.trim()
        : randomUUID();
    (req as FastifyRequest & { startTime: number; traceId: string }).startTime = Date.now();
    (req as FastifyRequest & { traceId: string }).traceId = reqId;
    reply.header("X-Request-Id", reqId);
  });

  server.addHook("onResponse", async (req, reply) => {
    const r = req as FastifyRequest & { startTime?: number; traceId?: string };
    const duration = r.startTime ? Date.now() - r.startTime : 0;
    const safeUrl = redactUrlTokens(req.url);
    log.info(
      {
        reqId: r.traceId,
        method: req.method,
        url: safeUrl,
        statusCode: reply.statusCode,
        duration,
      },
      "Request completed",
    );
    // Record metrics for Prometheus (skip /metrics itself to avoid noise)
    // Prefer matched route template to prevent high-cardinality metric explosion on 404s
    const matchedRoute = req.routeOptions?.url;
    if (matchedRoute !== "/metrics" && req.url !== "/metrics") {
      const durationSeconds = duration / 1000;
      recordHttpRequest(
        req.method,
        matchedRoute ?? "__unmatched__",
        reply.statusCode,
        durationSeconds,
      );
    }
  });

  // Register routes — pass userStore and apiKeyStore for RBAC support
  const feishuClient = createFeishuReplyClient(config.feishu);
  registerTaskRoutes(server, store, config.personalToken, feishuClient, auditStore, userStore, webhookStore, apiKeyStore, config.feishu.notifyOnStatusChange);
  registerFeishuRoutes(server, store, config.feishu, auditStore, webhookStore, feishuClient);
  registerDashboardRoutes(server, store, config.personalToken, config.publicBaseUrl, userStore, apiKeyStore);
  registerDeviceRoutes(server, deviceStore, config.personalToken, userStore, apiKeyStore);
  registerAuditRoutes(server, auditStore, config.personalToken, userStore, apiKeyStore);
  registerUserRoutes(server, userStore, config.personalToken, apiKeyStore);
  registerApiKeyRoutes(server, apiKeyStore, config.personalToken, userStore, auditStore);
  registerWebhookRoutes(server, webhookStore, config.personalToken, userStore, apiKeyStore);
  registerScheduledTaskRoutes(server, store, config.personalToken, auditStore);
  registerStatsRoutes(server, store, config.personalToken);
  registerSseRoutes(server, config.personalToken, userStore, apiKeyStore);
  registerMetricsRoutes(server, store);
  registerUsageRoutes(server, usageStore, config.personalToken, userStore, apiKeyStore);
  registerOpenApiRoutes(server, config.publicBaseUrl);

  // API usage tracking — registered AFTER routes (so auth hook runs first)
  registerUsageTrackingHook(server, usageStore);

  // Rate limiting — registered AFTER routes (so auth hook runs first)
  const rateLimiter = new RateLimiter({
    maxRequests: config.rateLimit?.maxRequests ?? 60,
    windowMs: config.rateLimit?.windowMs ?? 60_000,
    overrides: config.rateLimit?.overrides,
  });
  registerRateLimitHook(server, rateLimiter);

  // Start listening
  try {
    await server.listen({ port: config.port, host: "0.0.0.0" });
    log.info({ port: config.port }, "Server listening");
  } catch (err) {
    log.error({ err }, "Failed to start server");
    process.exit(1);
  }

  // Start the task scheduler (checks every 60 seconds for due scheduled tasks)
  const stopScheduler = startScheduler(store, 60_000);

  // Start the webhook retry worker (checks every 10 seconds for due retries)
  const stopRetryWorker = startRetryWorker(webhookStore);

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({}, "Shutting down...");
    stopScheduler();
    stopRetryWorker();
    rateLimiter.destroy();
    closeAllClients();
    await server.close();
    store.close?.();
    deviceStore.close?.();
    auditStore.close?.();
    userStore.close?.();
    webhookStore.close?.();
    apiKeyStore.close?.();
    usageStore.close?.();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
