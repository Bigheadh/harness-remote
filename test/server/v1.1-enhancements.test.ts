import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { createTaskStore } from "../../src/server/tasks/store.js";
import { registerTaskRoutes } from "../../src/server/tasks/routes.js";
import { createUserStore } from "../../src/server/auth/store.js";
import { registerUserRoutes } from "../../src/server/auth/routes.js";
import { createApiKeyStore } from "../../src/server/auth/apikeys/store.js";
import { registerApiKeyRoutes } from "../../src/server/auth/apikeys/routes.js";
import { createDeviceStore } from "../../src/server/devices/store.js";
import { registerDeviceRoutes } from "../../src/server/devices/routes.js";
import { createWebhookStore } from "../../src/server/webhooks/store.js";
import { registerWebhookRoutes } from "../../src/server/webhooks/routes.js";
import { createApiUsageStore } from "../../src/server/apiusage/store.js";
import { requireAuthz, type AuthContext } from "../../src/server/auth/middleware.js";
import { registerOpenApiRoutes } from "../../src/server/openapi/routes.js";
import { TASK_SCHEMA_VERSION } from "../../src/server/tasks/repos/schema.js";
import { createTaskApiClient } from "../../src/mcp-server/client.js";

const TMP_DIR = "/tmp/harness-remote-v11-enhancements-test";
const ADMIN_TOKEN = "v11-admin-secret-token-12345678";

function freshDir(): string {
  const dir = `${TMP_DIR}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function waitForHealth(baseUrl: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not become healthy at ${baseUrl}`);
}

describe("v1.1 Enhancements: Expanded Zod Validation, Health Details, Deploy Templates, X-Request-Id & MCP Doctor", () => {
  const spawned: ChildProcess[] = [];

  afterEach(() => {
    while (spawned.length > 0) {
      const proc = spawned.pop();
      try {
        proc?.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("validates write payloads with Zod across users, devices, keys, webhooks, bulk, templates, cycles, modules, and SLA", async () => {
    const dir = freshDir();
    const store = createTaskStore(`${dir}/tasks.sqlite`);
    const userStore = createUserStore(`${dir}/users.sqlite`);
    const apiKeyStore = createApiKeyStore(`${dir}/apikeys.sqlite`);
    const deviceStore = createDeviceStore(`${dir}/devices.sqlite`);
    const webhookStore = createWebhookStore(`${dir}/webhooks.sqlite`);

    const server = Fastify({ logger: false });
    registerTaskRoutes(server, store, ADMIN_TOKEN, undefined, undefined, userStore, webhookStore, apiKeyStore);
    registerUserRoutes(server, userStore, ADMIN_TOKEN, apiKeyStore);
    registerApiKeyRoutes(server, apiKeyStore, ADMIN_TOKEN, userStore);
    registerDeviceRoutes(server, deviceStore, ADMIN_TOKEN, userStore, apiKeyStore);
    registerWebhookRoutes(server, webhookStore, ADMIN_TOKEN, userStore, apiKeyStore);
    registerOpenApiRoutes(server);
    await server.ready();

    const auth = { authorization: `Bearer ${ADMIN_TOKEN}` };

    // Expanded OpenAPI 3.1 includes all new schemas and /api/health/details
    const spec = (await server.inject({ method: "GET", url: "/api/openapi.json" })).json();
    expect(spec.components.schemas.BulkStatusBody).toBeDefined();
    expect(spec.components.schemas.CreateUserBody).toBeDefined();
    expect(spec.components.schemas.CreateSlaPolicyBody).toBeDefined();
    expect(spec.paths["/api/health/details"]).toBeDefined();

    // Invalid payloads return structured 400 with details[]
    const invalidCases: Array<{ url: string; payload: Record<string, unknown> }> = [
      { url: "/api/users", payload: { username: "  ", role: "admin" } },
      { url: "/api/users", payload: { username: "bob", role: "supergod" } },
      { url: "/api/devices", payload: { name: "" } },
      { url: "/api/keys", payload: { name: "" } },
      { url: "/api/webhooks", payload: { url: "" } },
      { url: "/api/tasks/bulk/status", payload: { ids: [], status: "done" } },
      { url: "/api/tasks/bulk/status", payload: { ids: ["t1"], status: "invalid_status" } },
      { url: "/api/tasks/bulk/assign", payload: { ids: ["t1"], deviceId: "" } },
      { url: "/api/tasks/bulk/delete", payload: { ids: [] } },
      { url: "/api/templates", payload: { name: "tpl", commandText: "" } },
      { url: "/api/cycles", payload: { name: "S1", startDate: "", endDate: "2026-12-01" } },
      { url: "/api/modules", payload: { name: "   " } },
      { url: "/api/sla/policies", payload: { name: "P1", targetMinutes: -5 } },
    ];

    for (const c of invalidCases) {
      const res = await server.inject({ method: "POST", url: c.url, headers: auth, payload: c.payload });
      expect(res.statusCode, `Expected 400 for ${c.url}`).toBe(400);
      const body = res.json();
      expect(body.error.code).toBe("invalid_request");
      expect(Array.isArray(body.error.details)).toBe(true);
    }

    // Authenticated /api/health/details returns full diagnostics; unauthenticated gets 401
    const unauthHealth = await server.inject({ method: "GET", url: "/api/health/details" });
    expect(unauthHealth.statusCode).toBe(401);

    const authHealth = await server.inject({ method: "GET", url: "/api/health/details", headers: auth });
    expect(authHealth.statusCode).toBe(200);
    const details = authHealth.json();
    expect(details.ok).toBe(true);
    expect(details.schemaVersion).toBe(TASK_SCHEMA_VERSION);
    expect(typeof details.uptimeSeconds).toBe("number");
    expect(typeof details.memoryMb.rss).toBe("number");
    expect(typeof details.sseClients).toBe("number");

    await server.close();
    store.close?.();
    userStore.close?.();
    apiKeyStore.close?.();
    deviceStore.close?.();
    webhookStore.close?.();
  });

  it("ships production deploy templates with SSE streaming and hot backup timer configs", () => {
    const caddy = readFileSync("deploy/Caddyfile", "utf8");
    expect(caddy).toContain("/api/tasks/stream");
    expect(caddy).toContain("flush_interval -1");

    const nginx = readFileSync("deploy/nginx.conf", "utf8");
    expect(nginx).toContain("proxy_buffering off;");
    expect(nginx).toContain("/api/tasks/stream");

    const timer = readFileSync("deploy/harness-backup.timer", "utf8");
    expect(timer).toContain("OnCalendar=");
    const svc = readFileSync("deploy/harness-backup.service", "utf8");
    expect(svc).toContain("backup-sqlite.sh");
  });

  it("enforces auth context & RBAC permissions via requireAuthz helper", () => {
    const makeReply = () => {
      let status = 200;
      let payload: unknown;
      return {
        code(s: number) {
          status = s;
          return {
            send(p: unknown) {
              payload = p;
              return p;
            },
          };
        },
        getStatus: () => status,
        getPayload: () => payload,
      };
    };

    // 1. Missing authCtx -> 401
    const r401 = makeReply();
    expect(requireAuthz({}, r401, "tasks.read")).toBeUndefined();
    expect(r401.getStatus()).toBe(401);

    // 2. Insufficient role (viewer requesting users.delete) -> 403
    const viewerCtx: AuthContext = { role: "viewer", isSuperAdmin: false };
    const r403 = makeReply();
    expect(requireAuthz({ authCtx: viewerCtx }, r403, "users.delete")).toBeUndefined();
    expect(r403.getStatus()).toBe(403);

    // 3. Permitted role (admin requesting users.delete) -> returns authCtx
    const adminCtx: AuthContext = { role: "admin", isSuperAdmin: true };
    const r200 = makeReply();
    expect(requireAuthz({ authCtx: adminCtx }, r200, "users.delete")).toBe(adminCtx);
    expect(r200.getStatus()).toBe(200);
  });

  it("cleans up old API usage entries and webhook deliveries via retention cleanup methods", async () => {
    const dir = freshDir();

    // API usage store cleanup
    const usageStore = createApiUsageStore(`${dir}/usage.sqlite`);
    usageStore.recordRequest("admin", "GET", "/api/tasks", 200, 12);
    usageStore.recordRequest("admin", "POST", "/api/tasks", 201, 25);
    expect(usageStore.getCount()).toBe(2);
    // 30-day retention keeps fresh records
    expect(usageStore.cleanup(30)).toBe(0);
    expect(usageStore.getCount()).toBe(2);
    // 0-day retention removes all records
    expect(usageStore.cleanup(0)).toBe(2);
    expect(usageStore.getCount()).toBe(0);
    usageStore.close?.();

    // Webhook delivery store cleanup
    const webhookStore = createWebhookStore(`${dir}/webhooks.sqlite`);
    const sub = await webhookStore.createSubscription({
      url: "https://example.com/hook",
      events: ["task.created"],
      enabled: true,
    });
    await webhookStore.logDelivery({
      webhookId: sub.id,
      event: "task.created",
      url: sub.url,
      statusCode: 200,
      success: true,
      durationMs: 42,
      retryCount: 1,
    });
    expect((await webhookStore.getDeliveries(sub.id)).length).toBe(1);
    // 30-day retention keeps fresh delivery
    expect(await webhookStore.cleanupDeliveries(30)).toBe(0);
    expect((await webhookStore.getDeliveries(sub.id)).length).toBe(1);
    // 0-day retention removes all deliveries
    expect(await webhookStore.cleanupDeliveries(0)).toBe(1);
    expect((await webhookStore.getDeliveries(sub.id)).length).toBe(0);
    webhookStore.close?.();
  });

  it("URL-encodes dynamic path segments, strips trailing baseUrl slashes, and omits Content-Type on bodyless requests", async () => {
    const captured: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const headersObj = (init?.headers ?? {}) as Record<string, string>;
      captured.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: headersObj,
      });
      return new Response(JSON.stringify({ task: { id: "t1", tags: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createTaskApiClient("http://example.test///", "tok_test", undefined, {
      fetchFn: mockFetch,
    });

    await client.getTask("task/special id");
    await client.removeTag("task/1", "area/backend");
    await client.pinTask("task/1");
    await client.addTags("task/1", ["area/backend"]);

    expect(captured[0].url).toBe("http://example.test/api/tasks/task%2Fspecial%20id");
    expect(captured[0].headers["Content-Type"]).toBeUndefined();

    expect(captured[1].url).toBe("http://example.test/api/tasks/task%2F1/tags/area%2Fbackend");
    expect(captured[1].method).toBe("DELETE");
    expect(captured[1].headers["Content-Type"]).toBeUndefined();

    expect(captured[2].url).toBe("http://example.test/api/tasks/task%2F1/pin");
    expect(captured[2].method).toBe("POST");
    expect(captured[2].headers["Content-Type"]).toBeUndefined();

    expect(captured[3].url).toBe("http://example.test/api/tasks/task%2F1/tags");
    expect(captured[3].method).toBe("POST");
    expect(captured[3].headers["Content-Type"]).toBe("application/json");
  });

  it("executes bodyless POST and DELETE MCP client operations cleanly against a live Fastify server", async () => {
    const dir = freshDir();
    const store = createTaskStore(`${dir}/tasks.sqlite`);
    const server = Fastify({ logger: false });
    registerTaskRoutes(server, store, ADMIN_TOKEN);
    const address = await server.listen({ port: 0, host: "127.0.0.1" });

    try {
      const client = createTaskApiClient(address, ADMIN_TOKEN);
      const created = await client.createTask({
        commandText: "Verify bodyless POST/DELETE against Fastify",
        tags: ["area/backend", "v1.1"],
      });

      const pinned = await client.pinTask(created.id);
      expect(pinned.pinned).toBe(true);

      const unpinned = await client.unpinTask(created.id);
      expect(unpinned.pinned).toBe(false);

      const afterTagRemove = await client.removeTag(created.id, "v1.1");
      expect(afterTagRemove.tags).toEqual(["area/backend"]);

      const archived = await client.archiveTask(created.id);
      expect(archived.archivedAt).toBeTruthy();

      const restored = await client.unarchiveTask(created.id);
      expect(restored.archivedAt).toBeFalsy();
    } finally {
      await server.close();
      store.close?.();
    }
  });

  const distReady =
    existsSync("dist/server/index.js") && existsSync("dist/mcp-server/index.js");

  describe.skipIf(!distReady)("Live X-Request-Id tracing and MCP --doctor CLI", () => {
    it("echoes/generates X-Request-Id and passes/fails MCP --doctor accurately", async () => {
      const dir = freshDir();
      const port = 36000 + Math.floor(Math.random() * 4000);
      const baseUrl = `http://127.0.0.1:${port}`;

      const srv = spawn(process.execPath, ["dist/server/index.js"], {
        env: {
          ...process.env,
          HARNESS_PORT: String(port),
          HARNESS_PUBLIC_BASE_URL: baseUrl,
          HARNESS_PERSONAL_TOKEN: ADMIN_TOKEN,
          HARNESS_STORAGE_PATH: join(dir, "tasks.sqlite"),
          FEISHU_APP_ID: "cli_doc",
          FEISHU_APP_SECRET: "sec_doc",
          FEISHU_VERIFICATION_TOKEN: "vtok_doc",
          FEISHU_ALLOWED_USER_IDS: "ou_doc",
        },
        stdio: "pipe",
      });
      spawned.push(srv);
      await waitForHealth(baseUrl);

      // 1. Server generates X-Request-Id when omitted and echoes incoming X-Request-Id
      const genRes = await fetch(`${baseUrl}/health`);
      expect(genRes.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);

      const customRes = await fetch(`${baseUrl}/health`, {
        headers: { "X-Request-Id": "trace-custom-42" },
      });
      expect(customRes.headers.get("x-request-id")).toBe("trace-custom-42");

      // 2. MCP --doctor --json succeeds with valid credentials and reports 21 core tools
      const okOut = execFileSync(
        process.execPath,
        ["dist/mcp-server/index.js", "--doctor", "--json", "--toolsets", "core"],
        {
          env: {
            ...process.env,
            HARNESS_SERVER_BASE_URL: baseUrl,
            HARNESS_PERSONAL_TOKEN: ADMIN_TOKEN,
          },
          encoding: "utf8",
        },
      );
      const okReport = JSON.parse(okOut);
      expect(okReport.ok).toBe(true);
      expect(okReport.toolCount).toBe(21);
      expect(okReport.checks.config.ok).toBe(true);
      expect(okReport.checks.health.ok).toBe(true);
      expect(okReport.checks.auth.ok).toBe(true);
      expect(okOut).not.toContain(ADMIN_TOKEN);

      // 3. MCP --doctor fails cleanly with exit code 1 on invalid token
      let failExitCode = 0;
      let failStdout = "";
      try {
        execFileSync(
          process.execPath,
          ["dist/mcp-server/index.js", "--doctor", "--json", "--toolsets", "core"],
          {
            env: {
              ...process.env,
              HARNESS_SERVER_BASE_URL: baseUrl,
              HARNESS_PERSONAL_TOKEN: "wrong-token-that-should-fail-auth",
            },
            encoding: "utf8",
          },
        );
      } catch (err) {
        const e = err as { status?: number; stdout?: string };
        failExitCode = e.status ?? 0;
        failStdout = e.stdout ?? "";
      }
      expect(failExitCode).toBe(1);
      const failReport = JSON.parse(failStdout);
      expect(failReport.ok).toBe(false);
      expect(failReport.checks.health.ok).toBe(true);
      expect(failReport.checks.auth.ok).toBe(false);
      expect(failReport.checks.auth.status).toBe(401);
    }, 15_000);
  });
});
