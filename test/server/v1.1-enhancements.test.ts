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
import { registerOpenApiRoutes } from "../../src/server/openapi/routes.js";
import { TASK_SCHEMA_VERSION } from "../../src/server/tasks/repos/schema.js";

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
