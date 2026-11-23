import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { mkdirSync, rmSync } from "node:fs";
import { createTaskStore } from "../../src/server/tasks/store.js";
import { registerTaskRoutes } from "../../src/server/tasks/routes.js";
import { registerFeishuRoutes } from "../../src/server/feishu/events.js";
import { registerDashboardRoutes } from "../../src/server/dashboard/routes.js";
import {
  renderDashboardHTML,
  getDashboardJs,
} from "../../src/server/dashboard/templates/dashboard.js";
import { registerWebhookRoutes } from "../../src/server/webhooks/routes.js";
import { createWebhookStore } from "../../src/server/webhooks/store.js";
import { validateWebhookUrl, isBlockedIp } from "../../src/server/webhooks/url-validator.js";
import { createUserStore } from "../../src/server/auth/store.js";
import { createApiKeyStore } from "../../src/server/auth/apikeys/store.js";
import { authenticate } from "../../src/server/auth/middleware.js";
import { RateLimiter } from "../../src/server/ratelimit/limiter.js";
import { deriveKey } from "../../src/server/ratelimit/middleware.js";
import {
  recordHttpRequest,
  formatMetrics,
  normalizePath,
  resetHttpMetrics,
} from "../../src/server/metrics/collector.js";
import { registerSseRoutes } from "../../src/server/sse/routes.js";
import { calculateNextRun } from "../../src/server/scheduler/index.js";

const TMP_DIR = "/tmp/harness-remote-security-bugs-test";
const PERSONAL_TOKEN = "super-secret-admin-personal-token-123456";

function freshDir(): string {
  const dir = `${TMP_DIR}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("P0/P1 Security & Bug Regression Suite", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  // ── 1. Dashboard token leak & JS syntax ──────────────────────────────────

  describe("Dashboard security & template integrity", () => {
    it("issues HttpOnly encrypted session cookie with ZERO raw tokens in HTML and enforces viewer RBAC", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);
      const userStore = createUserStore(`${dir}/users.sqlite`);
      const viewer = await userStore.createUser("alice_viewer", "viewer");

      const server = Fastify({ logger: false });
      registerTaskRoutes(server, store, PERSONAL_TOKEN, undefined, undefined, userStore);
      registerDashboardRoutes(server, store, PERSONAL_TOKEN, "http://localhost:3000", userStore);
      await server.ready();

      // 1. Query token exchange sets HttpOnly cookie and never embeds either token in HTML
      const res = await server.inject({
        method: "GET",
        url: `/dashboard?token=${encodeURIComponent(viewer.token)}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain(viewer.token);
      expect(res.body).not.toContain(PERSONAL_TOKEN);
      expect(res.body).toContain("/dashboard/assets/dashboard.js");
      expect(res.body).toContain("/dashboard/assets/dashboard.css");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(String(res.headers["content-security-policy"])).toContain("frame-ancestors 'none'");

      const setCookie = String(res.headers["set-cookie"] ?? "");
      expect(setCookie).toContain("harness_session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
      const cookiePair = setCookie.split(";")[0];

      // 2. Cookie authenticates /api/tasks as viewer (read allowed, write forbidden => no privilege escalation)
      const listRes = await server.inject({
        method: "GET",
        url: "/api/tasks",
        headers: { cookie: cookiePair },
      });
      expect(listRes.statusCode).toBe(200);

      const writeRes = await server.inject({
        method: "POST",
        url: "/api/tasks/bulk/tags/add",
        headers: { cookie: cookiePair },
        payload: { taskIds: ["t1"], tags: ["x"] },
      });
      expect(writeRes.statusCode).toBe(403);

      // 3. Static asset routes serve CSS and JS cleanly
      const cssRes = await server.inject({ method: "GET", url: "/dashboard/assets/dashboard.css" });
      expect(cssRes.statusCode).toBe(200);
      expect(cssRes.headers["content-type"]).toContain("text/css");

      const jsRes = await server.inject({ method: "GET", url: "/dashboard/assets/dashboard.js" });
      expect(jsRes.statusCode).toBe(200);
      expect(jsRes.headers["content-type"]).toContain("application/javascript");

      // 4. POST /dashboard/login & POST /dashboard/logout work properly
      const loginRes = await server.inject({
        method: "POST",
        url: "/dashboard/login",
        payload: { token: viewer.token },
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.json()).toEqual({ ok: true, role: "viewer" });
      expect(String(loginRes.headers["set-cookie"])).toContain("harness_session=");

      const logoutRes = await server.inject({ method: "POST", url: "/dashboard/logout" });
      expect(logoutRes.statusCode).toBe(200);
      expect(String(logoutRes.headers["set-cookie"])).toContain("Max-Age=0");

      // 5. Unauthenticated HTML browser gets login page; non-HTML gets 401
      const browserRes = await server.inject({
        method: "GET",
        url: "/dashboard",
        headers: { accept: "text/html" },
      });
      expect(browserRes.statusCode).toBe(200);
      expect(browserRes.body).toContain("/dashboard/login");

      const apiRes = await server.inject({
        method: "GET",
        url: "/dashboard",
        headers: { accept: "application/json" },
      });
      expect(apiRes.statusCode).toBe(401);

      await server.close();
      store.close?.();
      userStore.close?.();
    });

    it("loads syntactically valid client JavaScript asset with no embedded secrets", () => {
      const html = renderDashboardHTML("http://localhost:3000");
      expect(html).toContain("/dashboard/assets/dashboard.js");
      expect(html).not.toContain(PERSONAL_TOKEN);
      const js = getDashboardJs();
      expect(js.length).toBeGreaterThan(1000);
      // Parsing with new Function catches syntax errors like the old stray `const _acls`
      expect(() => new Function(js)).not.toThrow();
    });
  });

  // ── 2. Task links XSS protection ─────────────────────────────────────────

  describe("Task links protocol validation", () => {
    it("rejects javascript: and data: URLs while allowing https://", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);
      const now = new Date().toISOString();
      await store.createTask({
        id: "task_link_test",
        source: "feishu",
        feishuMessageId: "msg_link_1",
        feishuChatId: "chat_1",
        feishuUserId: "ou_1",
        commandText: "check links",
        status: "pending",
        priority: "normal",
        createdAt: now,
        updatedAt: now,
      });

      const server = Fastify({ logger: false });
      registerTaskRoutes(server, store, PERSONAL_TOKEN);
      await server.ready();

      for (const badUrl of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd"]) {
        const res = await server.inject({
          method: "POST",
          url: "/api/tasks/task_link_test/links",
          headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
          payload: { title: "Evil", url: badUrl },
        });
        expect(res.statusCode).toBe(400);
      }

      const goodRes = await server.inject({
        method: "POST",
        url: "/api/tasks/task_link_test/links",
        headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
        payload: { title: "Docs", url: "https://example.com/docs" },
      });
      expect(goodRes.statusCode).toBe(201);

      await server.close();
      store.close?.();
    });
  });

  // ── 3. Feishu webhook auth bypass & card-action authorization ────────────

  describe("Feishu webhook strict verification & card actions", () => {
    const feishuConfig = {
      appId: "cli_test",
      appSecret: "secret",
      verificationToken: "strict_verify_tok_123",
      encryptKey: "",
      allowedUserIds: ["ou_allowed_1"],
    };

    it("rejects /feishu/events when header.token is omitted", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);
      const server = Fastify({ logger: false });
      registerFeishuRoutes(server, store, feishuConfig);
      await server.ready();

      const res = await server.inject({
        method: "POST",
        url: "/feishu/events",
        payload: {
          schema: "2.0",
          header: {
            event_id: "evt_no_token",
            event_type: "im.message.receive_v1",
            // token intentionally omitted
          },
          event: {
            sender: { sender_id: { open_id: "ou_allowed_1" } },
            message: {
              message_id: "msg_no_token",
              chat_id: "oc_1",
              chat_type: "p2p",
              content: JSON.stringify({ text: "bypass attempt" }),
            },
          },
        },
      });

      expect(res.statusCode).toBe(401);
      await server.close();
      store.close?.();
    });

    it("rejects /feishu/card-action without token or from non-allowed user, and completes pending task for allowed user", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);
      const now = new Date().toISOString();
      await store.createTask({
        id: "task_card_1",
        source: "feishu",
        feishuMessageId: "msg_card_1",
        feishuChatId: "oc_1",
        feishuUserId: "ou_allowed_1",
        commandText: "card test",
        status: "pending",
        priority: "normal",
        createdAt: now,
        updatedAt: now,
      });

      const server = Fastify({ logger: false });
      registerFeishuRoutes(server, store, feishuConfig);
      await server.ready();

      // Missing token -> 401
      const noTok = await server.inject({
        method: "POST",
        url: "/feishu/card-action",
        payload: {
          header: {},
          event: {
            operator: { open_id: "ou_allowed_1" },
            action: { value: { action: "complete_task", taskId: "task_card_1" } },
          },
        },
      });
      expect(noTok.statusCode).toBe(401);

      // Non-allowed user -> 403
      const badUser = await server.inject({
        method: "POST",
        url: "/feishu/card-action",
        payload: {
          header: { token: feishuConfig.verificationToken },
          event: {
            operator: { open_id: "ou_intruder" },
            action: { value: { action: "complete_task", taskId: "task_card_1" } },
          },
        },
      });
      expect(badUser.statusCode).toBe(403);

      // Allowed user completing pending task -> 200 & done
      const okRes = await server.inject({
        method: "POST",
        url: "/feishu/card-action",
        payload: {
          header: { token: feishuConfig.verificationToken },
          event: {
            operator: { open_id: "ou_allowed_1" },
            action: { value: { action: "complete_task", taskId: "task_card_1" } },
          },
        },
      });
      expect(okRes.statusCode).toBe(200);
      const updated = await store.getTask("task_card_1");
      expect(updated?.status).toBe("done");

      await server.close();
      store.close?.();
    });
  });

  // ── 4. Webhook SSRF protection ───────────────────────────────────────────

  describe("Webhook SSRF protection", () => {
    it("blocks private, loopback, link-local, metadata, and non-HTTP URLs", () => {
      const blocked = [
        "http://localhost:8080/hook",
        "http://127.0.0.1:3000/hook",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/internal",
        "http://172.16.0.1/internal",
        "http://192.168.1.10/internal",
        "http://[::1]:8080/hook",
        "http://[::ffff:127.0.0.1]/hook",
        "http://metadata.google.internal/computeMetadata/v1/",
        "file:///etc/passwd",
        "javascript:alert(1)",
      ];
      for (const u of blocked) {
        expect(() => validateWebhookUrl(u), `expected ${u} to be blocked`).toThrow();
      }
      expect(isBlockedIp("8.8.8.8")).toBe(false);
      expect(isBlockedIp("169.254.169.254")).toBe(true);
      expect(() => validateWebhookUrl("https://hooks.example.com/events")).not.toThrow();
    });

    it("rejects SSRF URL in POST /api/webhooks with 400", async () => {
      const dir = freshDir();
      const webhookStore = createWebhookStore(`${dir}/webhooks.sqlite`);
      const server = Fastify({ logger: false });
      registerWebhookRoutes(server, webhookStore, PERSONAL_TOKEN);
      await server.ready();

      const res = await server.inject({
        method: "POST",
        url: "/api/webhooks",
        headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
        payload: {
          url: "http://169.254.169.254/latest/meta-data",
          events: ["task.created"],
        },
      });
      expect(res.statusCode).toBe(400);

      await server.close();
      webhookStore.close?.();
    });
  });

  // ── 5. API Key expiration cleanup bug ────────────────────────────────────

  describe("API key rotation & expired previous key cleanup", () => {
    it("clears expired previous_key WITHOUT deleting the active API key", async () => {
      const dir = freshDir();
      const apiKeyStore = createApiKeyStore(`${dir}/apikeys.sqlite`);
      const created = await apiKeyStore.createApiKey("ci-bot", "usr_1", "operator");
      const oldKey = created.key;

      // Rotate with already-expired grace period (-1000ms)
      const rotated = await apiKeyStore.rotateApiKey(created.id, -1000);
      expect(rotated.key).not.toBe(oldKey);
      expect(rotated.key).toMatch(/^ak_/);
      expect(rotated.previousKey).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(rotated.previousKey).not.toBe(oldKey);

      const cleaned = await apiKeyStore.deleteExpiredPreviousKeys();
      expect(cleaned).toBe(1);

      // Active key MUST still exist (stored hashed) and authenticate with raw key!
      const after = await apiKeyStore.getApiKeyById(created.id);
      expect(after).toBeDefined();
      expect(after!.key).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(after!.key).not.toBe(rotated.key);
      expect(after!.previousKey).toBeNull();
      expect(after!.previousKeyExpiresAt).toBeNull();

      const ctx = await authenticate(`Bearer ${rotated.key}`, PERSONAL_TOKEN, undefined, apiKeyStore);
      expect(ctx.role).toBe("operator");

      await expect(
        authenticate(`Bearer ${oldKey}`, PERSONAL_TOKEN, undefined, apiKeyStore),
      ).rejects.toThrow();

      apiKeyStore.close?.();
    });

    it("authenticates valid previous key within grace period via indexed lookup", async () => {
      const dir = freshDir();
      const apiKeyStore = createApiKeyStore(`${dir}/apikeys.sqlite`);
      const created = await apiKeyStore.createApiKey("deploy-bot", "usr_2", "operator");
      const oldKey = created.key;

      await apiKeyStore.rotateApiKey(created.id, 60_000);
      const ctx = await authenticate(`Bearer ${oldKey}`, PERSONAL_TOKEN, undefined, apiKeyStore);
      expect(ctx.role).toBe("operator");
      expect(ctx.user?.id).toBe("usr_2");

      apiKeyStore.close?.();
    });
  });

  // ── 6. Rate limit bypass & maxEntries ────────────────────────────────────

  describe("Rate limit security", () => {
    it("does not allow ?deviceId= query parameter to override caller identity", () => {
      const req1 = {
        query: { deviceId: "random-1" },
        headers: {},
        ip: "1.2.3.4",
      } as unknown as Parameters<typeof deriveKey>[0];
      const req2 = {
        query: { deviceId: "random-2" },
        headers: {},
        ip: "1.2.3.4",
      } as unknown as Parameters<typeof deriveKey>[0];

      expect(deriveKey(req1)).toBe("ip:1.2.3.4");
      expect(deriveKey(req2)).toBe("ip:1.2.3.4");
      expect(deriveKey(req1, { user: { id: "usr_alice" }, isSuperAdmin: false })).toBe("user:usr_alice");
    });

    it("enforces maxEntries memory bound", () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000, maxEntries: 3 });
      limiter.consume("k1");
      limiter.consume("k2");
      limiter.consume("k3");
      limiter.consume("k4");
      expect(limiter.size).toBeLessThanOrEqual(3);
      limiter.destroy();
    });
  });

  // ── 7. Prometheus metrics collector ──────────────────────────────────────

  describe("Prometheus metrics accuracy & label escaping", () => {
    beforeEach(() => {
      resetHttpMetrics();
    });

    it("preserves :id in path labels and reports actual duration sum instead of request count", () => {
      recordHttpRequest("GET", "/api/tasks/task_123_abc", 200, 0.25);
      recordHttpRequest("GET", "/api/tasks/task_456_def", 200, 0.75);

      const output = formatMetrics();
      expect(output).toContain(
        'harness_remote_http_requests_total{method="GET",path="/api/tasks/:id",status="200"} 2',
      );
      expect(output).toContain(
        'harness_remote_http_request_duration_seconds_sum{method="GET",path="/api/tasks/:id"} 1.000000',
      );
      expect(output).toContain(
        'harness_remote_http_request_duration_seconds_count{method="GET",path="/api/tasks/:id"} 2',
      );
    });

    it("normalizes all entity ID prefixes", () => {
      expect(normalizePath("/api/users/usr_123_abcd")).toBe("/api/users/:id");
      expect(normalizePath("/api/keys/apikey_123_abcd/rotate")).toBe("/api/keys/:id/rotate");
      expect(normalizePath("/api/cycles/cyc_123_abcd/tasks")).toBe("/api/cycles/:id/tasks");
      expect(normalizePath("/api/tasks/task_123/comments/42")).toBe("/api/tasks/:id/comments/:id");
    });
  });

  // ── 8. SQLite schema order, task source, and foreign keys ────────────────

  describe("TaskStore schema & data integrity", () => {
    it("supports addRelationship on a brand-new DB and preserves task.source", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);
      const now = new Date().toISOString();

      await store.createTask({
        id: "task_src_1",
        source: "api" as unknown as "feishu",
        feishuMessageId: "api_msg_1",
        feishuChatId: "",
        feishuUserId: "usr_1",
        commandText: "first",
        status: "pending",
        priority: "normal",
        createdAt: now,
        updatedAt: now,
      });
      await store.createTask({
        id: "task_src_2",
        source: "feishu",
        feishuMessageId: "feishu_msg_2",
        feishuChatId: "oc_1",
        feishuUserId: "ou_1",
        commandText: "second",
        status: "pending",
        priority: "normal",
        createdAt: now,
        updatedAt: now,
      });

      // Verify source is preserved instead of hardcoded "feishu"
      const fetched = await store.getTask("task_src_1");
      expect(fetched?.source).toBe("api");

      // Verify task_dependencies has relationship_type & created_at on first run
      await store.addRelationship("task_src_1", "task_src_2", "blocks");
      const rels = await store.listRelationships("task_src_1");
      expect(rels).toHaveLength(1);
      expect(rels[0].relationshipType).toBe("blocks");

      store.close?.();
    });
  });

  // ── 9. SSE auth coexistence with /api/ hook ──────────────────────────────

  describe("SSE auth coexistence", () => {
    it("allows /api/tasks/stream?token=... to pass global /api/ hook and rejects bad tokens with 401", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);
      const userStore = createUserStore(`${dir}/users.sqlite`);

      const server = Fastify({ logger: false });
      registerTaskRoutes(server, store, PERSONAL_TOKEN, undefined, undefined, userStore);
      registerSseRoutes(server, PERSONAL_TOKEN, userStore);
      await server.ready();

      const badRes = await server.inject({
        method: "GET",
        url: "/api/tasks/stream?token=invalid-token",
      });
      expect(badRes.statusCode).toBe(401);

      await server.close();
      store.close?.();
      userStore.close?.();
    });
  });

  // ── 10. Scheduler calculateNextRun ───────────────────────────────────────

  describe("Scheduler calculateNextRun", () => {
    it("preserves midnight hour for daily schedules instead of jumping to 9 AM", () => {
      const base = new Date(2026, 5, 10, 0, 15, 0, 0); // local 00:15
      const next = new Date(calculateNextRun("daily", base.toISOString()));
      expect(next.getDate()).toBe(11);
      expect(next.getHours()).toBe(0);
      expect(next.getMinutes()).toBe(15);
    });
  });
});
