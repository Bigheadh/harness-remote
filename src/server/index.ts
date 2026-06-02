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
import { createWebhookStore } from "./webhooks/store.js";
import { registerWebhookRoutes } from "./webhooks/routes.js";
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

  const server = Fastify({
    logger: false, // We use our own redacting logger
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
  });

  // Register routes — pass userStore for RBAC support
  const feishuClient = createFeishuReplyClient(config.feishu);
  registerTaskRoutes(server, store, config.personalToken, feishuClient, auditStore, userStore, webhookStore);
  registerFeishuRoutes(server, store, config.feishu, auditStore, webhookStore);
  registerDashboardRoutes(server, store, config.personalToken, config.publicBaseUrl, userStore);
  registerDeviceRoutes(server, deviceStore, config.personalToken, userStore);
  registerAuditRoutes(server, auditStore, config.personalToken, userStore);
  registerUserRoutes(server, userStore, config.personalToken);
  registerWebhookRoutes(server, webhookStore, config.personalToken, userStore);

  // Start listening
  try {
    await server.listen({ port: config.port, host: "0.0.0.0" });
    log.info({ port: config.port }, "Server listening");
  } catch (err) {
    log.error({ err }, "Failed to start server");
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    log.info({}, "Shutting down...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
