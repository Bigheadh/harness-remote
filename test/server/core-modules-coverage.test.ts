import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyReply } from "fastify";
import { mkdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTaskStore } from "../../src/server/tasks/store.js";
import { TASK_SCHEMA_VERSION } from "../../src/server/tasks/repos/schema.js";
import { buildFtsTrigramQuery } from "../../src/server/tasks/repos/db-helpers.js";
import { createWebhookStore } from "../../src/server/webhooks/store.js";
import {
  signPayload,
  calculateBackoffDelay,
  dispatchWebhook,
  setWebhookTimeoutMs,
} from "../../src/server/webhooks/dispatcher.js";
import { calculateNextRun, startScheduler } from "../../src/server/scheduler/index.js";
import { createAuditLogStore } from "../../src/server/audit/store.js";
import { registerAuditRoutes } from "../../src/server/audit/routes.js";
import { createApiUsageStore } from "../../src/server/apiusage/store.js";
import { registerUsageRoutes } from "../../src/server/apiusage/routes.js";
import { createApiKeyStore } from "../../src/server/auth/apikeys/store.js";
import { createUserStore } from "../../src/server/auth/store.js";
import {
  addClient,
  removeClient,
  closeAllClients,
  getClientCount,
  broadcast,
  broadcastTaskCreated,
  broadcastTaskUpdated,
} from "../../src/server/sse/broadcaster.js";
import { registerMcpTools } from "../../src/mcp-server/tools.js";
import type { TaskApiClient } from "../../src/mcp-server/client.js";
import type { Task } from "../../src/shared/types.js";

const TMP_DIR = "/tmp/harness-remote-core-coverage-test";
const ADMIN_TOKEN = "coverage-admin-token-123456";

function freshDir(): string {
  const dir = `${TMP_DIR}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    source: "feishu",
    feishuMessageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    feishuChatId: "chat_cov",
    feishuUserId: "ou_cov",
    commandText: "deploy production cluster",
    status: "pending",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Core Modules Coverage Suite", () => {
  afterEach(() => {
    closeAllClients();
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  // ── 1. Webhook Dispatcher ────────────────────────────────────────────────

  describe("webhooks/dispatcher", () => {
    it("computes deterministic HMAC-SHA256 signatures and bounded exponential backoff", () => {
      const sig1 = signPayload('{"event":"task.created"}', "my-secret");
      const sig2 = signPayload('{"event":"task.created"}', "my-secret");
      const sig3 = signPayload('{"event":"task.created"}', "other-secret");

      expect(sig1).toBe(sig2);
      expect(sig1).toHaveLength(64);
      expect(sig1).not.toBe(sig3);

      // attempt 1 ~ 1000ms ±25% (750..1250), attempt 10 capped at 30000ms ±25% (22500..37500)
      const d1 = calculateBackoffDelay(1);
      expect(d1).toBeGreaterThanOrEqual(750);
      expect(d1).toBeLessThanOrEqual(1250);

      const dCap = calculateBackoffDelay(10);
      expect(dCap).toBeGreaterThanOrEqual(22500);
      expect(dCap).toBeLessThanOrEqual(37500);

      setWebhookTimeoutMs(5000);
    });

    it("blocks SSRF private targets during dispatchWebhook and records failed delivery", async () => {
      const dir = freshDir();
      const webhookStore = createWebhookStore(`${dir}/webhooks.sqlite`);
      const sub = await webhookStore.createSubscription({
        url: "http://127.0.0.1:9999/internal-hook",
        events: ["task.created"],
        enabled: true,
      });

      await dispatchWebhook(webhookStore, "task.created", makeTask());

      // Wait briefly for async fire-and-forget delivery rejection to log
      await new Promise((r) => setTimeout(r, 100));

      const deliveries = await webhookStore.getDeliveries(sub.id);
      expect(deliveries.length).toBe(1);
      expect(deliveries[0].success).toBe(false);
      expect(deliveries[0].error).toMatch(/loopback|private|blocked|not allowed/i);

      webhookStore.close?.();
    });
  });

  // ── 2. Task Scheduler ────────────────────────────────────────────────────

  describe("scheduler", () => {
    it("calculates next run accurately across all schedule frequencies", () => {
      const ref = "2026-06-15T10:30:00.000Z";
      expect(calculateNextRun("once", ref)).toBe("9999-12-31T23:59:59.999Z");
      expect(calculateNextRun("hourly", ref)).toBe("2026-06-15T11:30:00.000Z");
      expect(calculateNextRun("daily", ref)).toBe("2026-06-16T10:30:00.000Z");
      expect(calculateNextRun("weekly", ref)).toBe("2026-06-22T10:30:00.000Z");
      expect(calculateNextRun("monthly", ref)).toBe("2026-07-15T10:30:00.000Z");
    });

    it("fires due scheduled tasks via startScheduler and advances nextRunAt", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);

      const pastIso = new Date(Date.now() - 60_000).toISOString();
      const sched = await store.createScheduledTask({
        commandText: "Nightly backup job",
        frequency: "daily",
        priority: "high",
        tags: ["ops"],
        nextRunAt: pastIso,
        enabled: true,
        createdBy: "admin",
      });

      const stop = startScheduler(store, 30);
      try {
        await new Promise((r) => setTimeout(r, 150));
      } finally {
        stop();
      }

      const tasks = await store.listTasks("pending", 10);
      expect(tasks.some((t) => t.commandText === "Nightly backup job" && t.priority === "high")).toBe(true);

      const updatedSched = await store.getScheduledTask(sched.id);
      expect(updatedSched?.lastTaskId).toBeTruthy();
      expect(new Date(updatedSched!.nextRunAt).getTime()).toBeGreaterThan(Date.now());

      store.close?.();
    });
  });

  // ── 3. Audit Log Store & Routes ──────────────────────────────────────────

  describe("audit store & routes", () => {
    it("logs, filters, counts, cleans up audit entries and enforces route RBAC", async () => {
      const dir = freshDir();
      const auditStore = createAuditLogStore(`${dir}/audit.sqlite`);
      const userStore = createUserStore(`${dir}/users.sqlite`);
      const viewer = await userStore.createUser("audit_viewer", "viewer");

      await auditStore.log({
        action: "task.created",
        taskId: "t_1",
        actor: "alice",
        actorType: "api",
        details: { priority: "high" },
      });
      await auditStore.log({
        action: "task.completed",
        taskId: "t_2",
        actor: "dev_1",
        actorType: "device",
      });

      expect(await auditStore.count()).toBe(2);
      const filtered = await auditStore.query({ action: "task.created", actorType: "api" });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].details).toEqual({ priority: "high" });

      const server = Fastify({ logger: false });
      registerAuditRoutes(server, auditStore, ADMIN_TOKEN, userStore);
      await server.ready();

      const listRes = await server.inject({
        method: "GET",
        url: "/api/audit?action=task.created",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().count).toBe(1);

      const badActionRes = await server.inject({
        method: "GET",
        url: "/api/audit?action=not.a.real.action",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(badActionRes.statusCode).toBe(400);

      const countRes = await server.inject({
        method: "GET",
        url: "/api/audit/count",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(countRes.statusCode).toBe(200);
      expect(countRes.json().count).toBe(2);

      // Viewer cannot run cleanup
      const viewerCleanupRes = await server.inject({
        method: "POST",
        url: "/api/audit/cleanup",
        headers: { authorization: `Bearer ${viewer.token}` },
        payload: { retentionDays: 0 },
      });
      expect(viewerCleanupRes.statusCode).toBe(403);

      // Admin can run cleanup
      const adminCleanupRes = await server.inject({
        method: "POST",
        url: "/api/audit/cleanup",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { retentionDays: 0 },
      });
      expect(adminCleanupRes.statusCode).toBe(200);
      expect(adminCleanupRes.json().ok).toBe(true);

      await server.close();
      auditStore.close?.();
      userStore.close?.();
    });
  });

  // ── 4. API Usage Analytics Store & Routes ────────────────────────────────

  describe("apiusage store & routes", () => {
    it("records requests, aggregates per-caller stats, and serves usage endpoints", async () => {
      const dir = freshDir();
      const usageStore = createApiUsageStore(`${dir}/usage.sqlite`);
      const apiKeyStore = createApiKeyStore(`${dir}/apikeys.sqlite`);

      usageStore.recordRequest("caller_a", "GET", "/api/tasks", 200, 12);
      usageStore.recordRequest("caller_a", "POST", "/api/tasks", 500, 48);
      usageStore.recordRequest("caller_b", "GET", "/api/tasks", 200, 10);

      expect(usageStore.getCount()).toBe(3);
      const stats = usageStore.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.callers).toHaveLength(2);
      expect(stats.callers[0].callerId).toBe("caller_a");
      expect(stats.callers[0].totalRequests).toBe(2);
      expect(stats.callers[0].errorRequests).toBe(1);

      const entries = usageStore.getEntriesForCaller("caller_a", 10);
      expect(entries).toHaveLength(2);

      const server = Fastify({ logger: false });
      registerUsageRoutes(server, usageStore, ADMIN_TOKEN, undefined, apiKeyStore);
      await server.ready();

      const statsRes = await server.inject({
        method: "GET",
        url: "/api/usage/stats",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(statsRes.statusCode).toBe(200);
      expect(statsRes.json().stats.totalRequests).toBe(3);

      const callerRes = await server.inject({
        method: "GET",
        url: "/api/usage/entries/caller_a",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(callerRes.statusCode).toBe(200);
      expect(callerRes.json().count).toBe(2);

      await server.close();
      usageStore.close?.();
      apiKeyStore.close?.();
    });
  });

  // ── 5. SSE Broadcaster ───────────────────────────────────────────────────

  describe("sse/broadcaster", () => {
    function createFakeReply(shouldFailWrite = false) {
      const chunks: string[] = [];
      let ended = false;
      const reply = {
        raw: {
          writeHead: () => {},
          flushHeaders: () => {},
          write: (chunk: string) => {
            if (shouldFailWrite) return false;
            chunks.push(chunk);
            return true;
          },
          end: () => {
            ended = true;
          },
        },
      } as unknown as FastifyReply;
      return { reply, chunks, isEnded: () => ended };
    }

    it("delivers filtered events, removes dead clients, and cleans up on closeAllClients", () => {
      const c1 = createFakeReply();
      const c2 = createFakeReply();
      const dead = createFakeReply(true);

      const id1 = addClient(c1.reply);
      const id2 = addClient(c2.reply, ["task.updated"]);
      addClient(dead.reply);

      expect(getClientCount()).toBe(3);

      const task = makeTask();
      broadcastTaskCreated(task);
      // Dead client should be pruned during broadcast
      expect(getClientCount()).toBe(2);
      expect(c1.chunks.some((c) => c.includes("event: task.created"))).toBe(true);
      // c2 subscribed only to task.updated
      expect(c2.chunks.some((c) => c.includes("event: task.created"))).toBe(false);

      broadcastTaskUpdated(task);
      expect(c2.chunks.some((c) => c.includes("event: task.updated"))).toBe(true);

      broadcast({ event: "heartbeat", data: { ts: "now" } });
      expect(c1.chunks.some((c) => c.includes("event: heartbeat"))).toBe(true);

      removeClient(id1);
      expect(getClientCount()).toBe(1);

      closeAllClients();
      expect(getClientCount()).toBe(0);
      expect(c2.isEnded()).toBe(true);
      expect(id2).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 6. SQLite Versioned Schema Migrations & FTS5 Trigram Search ──────────

  describe("tasks/store FTS5 search & schema migrations", () => {
    it("sets PRAGMA user_version, indexes ASCII/CJK substrings via FTS5, and stays synced on update/delete", async () => {
      const dir = freshDir();
      const dbPath = `${dir}/tasks.sqlite`;
      const store = createTaskStore(dbPath);

      // Verify schema version persisted via PRAGMA user_version
      const rawDb = new DatabaseSync(dbPath);
      const versionRow = rawDb.prepare("PRAGMA user_version").get() as { user_version: number };
      expect(versionRow.user_version).toBe(TASK_SCHEMA_VERSION);
      rawDb.close();

      expect(buildFtsTrigramQuery("prod")).toBe('"prod"');
      expect(buildFtsTrigramQuery("生产环")).toBe('"生产环"');
      expect(buildFtsTrigramQuery("任务")).toBeNull(); // < 3 chars falls back to LIKE
      expect(buildFtsTrigramQuery("foo%bar")).toBeNull(); // LIKE wildcard falls back to LIKE

      const t1 = await store.createTask(
        makeTask({
          id: "fts_1",
          commandText: "deploy production cluster",
          description: "zero-downtime rollout",
        }),
      );
      await store.createTask(
        makeTask({
          id: "fts_2",
          commandText: "部署生产环境任务",
        }),
      );

      // ASCII mid-word substring via FTS5 trigram
      const r1 = await store.searchTasks({ q: "duct" });
      expect(r1.map((t) => t.id)).toEqual(["fts_1"]);

      // Description match via FTS5 trigram
      const r2 = await store.searchTasks({ q: "rollout" });
      expect(r2.map((t) => t.id)).toEqual(["fts_1"]);

      // CJK 3-char substring via FTS5 trigram
      const r3 = await store.searchTasks({ q: "生产环" });
      expect(r3.map((t) => t.id)).toEqual(["fts_2"]);

      // CJK 2-char fallback via LIKE
      const r4 = await store.searchTasks({ q: "任务" });
      expect(r4.map((t) => t.id)).toEqual(["fts_2"]);

      // Update trigger keeps FTS5 index synced
      await store.setTaskCommandText(t1.id, "rollback staging service");
      expect((await store.searchTasks({ q: "production" })).map((t) => t.id)).toEqual([]);
      expect((await store.searchTasks({ q: "staging" })).map((t) => t.id)).toEqual(["fts_1"]);

      // Delete trigger removes deleted rows from FTS5 index
      await store.bulkDelete([t1.id]);
      expect((await store.searchTasks({ q: "staging" })).map((t) => t.id)).toEqual([]);

      store.close?.();
    });
  });

  // ── 7. Composite update_task MCP Tool ────────────────────────────────────

  describe("MCP composite update_task tool", () => {
    it("updates multiple fields in a single MCP call and rejects empty updates", async () => {
      const calls: Array<{ method: string; args: unknown[] }> = [];
      const baseTask = makeTask({ id: "task_comp_1" });
      const stub = (method: string) => async (...args: unknown[]) => {
        calls.push({ method, args });
        return { ...baseTask };
      };
      const fakeClient = {
        setTaskCommandText: stub("setTaskCommandText"),
        setTaskDescription: stub("setTaskDescription"),
        setPriority: stub("setPriority"),
        setDueDate: stub("setDueDate"),
        setReminder: stub("setReminder"),
        setEstimatedMinutes: stub("setEstimatedMinutes"),
        assignTask: stub("assignTask"),
        unassignTask: stub("unassignTask"),
        addTags: stub("addTags"),
        removeTag: stub("removeTag"),
        pinTask: stub("pinTask"),
        unpinTask: stub("unpinTask"),
        archiveTask: stub("archiveTask"),
        unarchiveTask: stub("unarchiveTask"),
      } as unknown as TaskApiClient;

      let updateHandler: ((args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>) | undefined;
      const fakeServer = {
        registerTool(name: string, _cfg: unknown, handler: typeof updateHandler) {
          if (name === "update_task") updateHandler = handler;
        },
      } as unknown as McpServer;

      registerMcpTools(fakeServer, fakeClient, { toolsets: ["core"] });
      expect(updateHandler).toBeDefined();

      // Empty update returns error
      const emptyRes = await updateHandler!({ taskId: "task_comp_1" });
      expect(emptyRes.isError).toBe(true);

      // Multi-field composite update
      const res = await updateHandler!({
        taskId: "task_comp_1",
        commandText: "Updated title",
        description: "New desc",
        priority: "urgent",
        dueDate: "2026-12-31T00:00:00.000Z",
        assignedDeviceId: "dev_42",
        addTags: ["p0", "ops"],
        removeTags: ["old"],
        pinned: true,
        archived: false,
      });

      expect(res.isError).toBeUndefined();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.ok).toBe(true);
      expect(parsed.updatedFields).toEqual([
        "commandText",
        "description",
        "priority",
        "dueDate",
        "assignedDeviceId",
        "addTags",
        "removeTags",
        "pinned",
        "archived",
      ]);
      expect(calls.map((c) => c.method)).toEqual([
        "setTaskCommandText",
        "setTaskDescription",
        "setPriority",
        "setDueDate",
        "assignTask",
        "addTags",
        "removeTag",
        "pinTask",
        "unarchiveTask",
      ]);

      // Null assignedDeviceId unassigns the task
      calls.length = 0;
      const unassignRes = await updateHandler!({
        taskId: "task_comp_1",
        assignedDeviceId: null,
      });
      expect(unassignRes.isError).toBeUndefined();
      expect(calls[0]).toEqual({ method: "unassignTask", args: ["task_comp_1"] });
    });
  });
});
