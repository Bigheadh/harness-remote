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
import { startRetryWorker } from "./webhooks/dispatcher.js";
import { RateLimiter } from "./ratelimit/limiter.js";
import { registerRateLimitHook } from "./ratelimit/middleware.js";
import { registerScheduledTaskRoutes } from "./scheduled/routes.js";
import { startScheduler } from "./scheduler/index.js";
import { registerStatsRoutes } from "./stats/routes.js";
import { registerSseRoutes } from "./sse/routes.js";
import { registerMetricsRoutes } from "./metrics/routes.js";
import { recordHttpRequest } from "./metrics/collector.js";
import compress from "@fastify/compress";
import { createLogger } from "../shared/logger.js";

const configPath = process.argv.includes("--config")
  ? process.argv[process.argv.indexOf("--config") + 1]
  : undefined;

export async function startServer(): Promise<void> {
  const config = loadServerConfig(configPath);
  const log = createLogger({ level: "info" });

  log.info({ port: config.port }, "Starting harness-remote server");

  // Ensure data directory exists
  mkdirSync(dirname(config.storagePath), { recursive: true });

  const store = createTaskStore(config.storagePath);

  // Device registry store (uses separate SQLite file in same directory)
  const deviceStoragePath = config.storagePath.replace(/\.sqlite$/, ".devices.sqlite");
  const deviceStore = createDeviceStore(deviceStoragePath);

  // Audit log store (uses separate SQLite file in same directory)
  const auditStoragePath = config.storagePath.replace(/\.sqlite$/, ".audit.sqlite");
  const auditStore = createAuditLogStore(auditStoragePath);

  // User/RBAC store (uses separate SQLite file in same directory)
  const userStoragePath = config.storagePath.replace(/\.sqlite$/, ".users.sqlite");
  const userStore = createUserStore(userStoragePath);

  // Webhook store (uses separate SQLite file in same directory)
  const webhookStoragePath = config.storagePath.replace(/\.sqlite$/, ".webhooks.sqlite");
  const webhookStore = createWebhookStore(webhookStoragePath);

  // API key store (uses separate SQLite file in same directory)
  const apiKeyStoragePath = config.storagePath.replace(/\.sqlite$/, ".apikeys.sqlite");
  const apiKeyStore = createApiKeyStore(apiKeyStoragePath);

  const server = Fastify({
    logger: false, // We use our own redacting logger
  });

  // Enable response compression (gzip/deflate) for all routes
  await server.register(compress, {
    threshold: 1024, // Only compress responses larger than 1KB
    encodings: ["gzip", "deflate"],
  });

  // Request logging middleware
  server.addHook("onRequest", async (req) => {
    (req as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  server.addHook("onResponse", async (req, reply) => {
    const startTime = (req as FastifyRequest & { startTime: number }).startTime;
    const duration = startTime ? Date.now() - startTime : 0;
    log.info(
      {
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        duration,
      },
      "Request completed",
    );
    // Record metrics for Prometheus (skip /metrics itself to avoid noise)
    if (req.url !== "/metrics") {
      const durationSeconds = duration / 1000;
      recordHttpRequest(req.method, req.url, reply.statusCode, durationSeconds);
    }
  });

  // Register routes — pass userStore for RBAC support
  const feishuClient = createFeishuReplyClient(config.feishu);
  registerTaskRoutes(server, store, config.personalToken, feishuClient, auditStore, userStore, webhookStore, apiKeyStore);
  registerFeishuRoutes(server, store, config.feishu, auditStore, webhookStore, feishuClient);
  registerDashboardRoutes(server, store, config.personalToken, config.publicBaseUrl, userStore, apiKeyStore);
  registerDeviceRoutes(server, deviceStore, config.personalToken, userStore, apiKeyStore);
  registerAuditRoutes(server, auditStore, config.personalToken, userStore, apiKeyStore);
  registerUserRoutes(server, userStore, config.personalToken, apiKeyStore);
  registerApiKeyRoutes(server, apiKeyStore, config.personalToken, userStore, auditStore);
  registerWebhookRoutes(server, webhookStore, config.personalToken, userStore, apiKeyStore);
  registerScheduledTaskRoutes(server, store, config.personalToken, auditStore);
  registerStatsRoutes(server, store, config.personalToken);
  registerSseRoutes(server, config.personalToken);
  registerMetricsRoutes(server, store);

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
  const shutdown = async () => {
    log.info({}, "Shutting down...");
    stopScheduler();
    stopRetryWorker();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
