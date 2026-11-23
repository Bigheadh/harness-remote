import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTaskStore } from "../../src/server/tasks/store.js";
import { registerTaskRoutes } from "../../src/server/tasks/routes.js";
import { registerDashboardRoutes } from "../../src/server/dashboard/routes.js";
import {
  DASHBOARD_JS_MODULES,
  getDashboardJsModule,
} from "../../src/server/dashboard/templates/dashboard.js";
import { registerOpenApiRoutes } from "../../src/server/openapi/routes.js";

const TMP_DIR = "/tmp/harness-remote-ops-openapi-e2e-test";
const ADMIN_TOKEN = "e2e-admin-secret-token-987654";

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
      // retry until listening
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not become healthy at ${baseUrl} within ${timeoutMs}ms`);
}

describe("Ops, OpenAPI, Zod Validation, Modular Dashboard & Live E2E Suite", () => {
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

  // ── 1. OpenAPI 3.1 Spec & Offline Docs UI ────────────────────────────────

  describe("OpenAPI 3.1 & Zod request validation", () => {
    it("serves /api/openapi.json and /api/docs without requiring auth, and validates write bodies with Zod", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);
      const server = Fastify({ logger: false });

      registerTaskRoutes(server, store, ADMIN_TOKEN);
      registerDashboardRoutes(server, store, ADMIN_TOKEN, "http://localhost:3000");
      registerOpenApiRoutes(server, "https://inbox.example.com");
      await server.ready();

      // OpenAPI JSON spec is public & valid OpenAPI 3.1.0
      const specRes = await server.inject({ method: "GET", url: "/api/openapi.json" });
      expect(specRes.statusCode).toBe(200);
      const spec = specRes.json();
      expect(spec.openapi).toBe("3.1.0");
      expect(spec.servers[0].url).toBe("https://inbox.example.com");
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.sessionCookie).toBeDefined();
      expect(spec.components.schemas.CreateTaskBody).toBeDefined();
      expect(spec.paths["/api/tasks"]).toBeDefined();
      expect(spec.paths["/dashboard/login"]).toBeDefined();

      // Offline HTML docs page
      const docsRes = await server.inject({ method: "GET", url: "/api/docs" });
      expect(docsRes.statusCode).toBe(200);
      expect(docsRes.headers["content-type"]).toContain("text/html");
      expect(docsRes.headers["x-frame-options"]).toBe("DENY");
      expect(docsRes.body).toContain("/api/openapi.json");

      // Zod validation on POST /api/tasks rejects empty commandText and invalid priority
      const badCmd = await server.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { commandText: "   " },
      });
      expect(badCmd.statusCode).toBe(400);
      expect(badCmd.json().error.code).toBe("invalid_request");
      expect(Array.isArray(badCmd.json().error.details)).toBe(true);

      const badPrio = await server.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { commandText: "Valid task", priority: "super-critical" },
      });
      expect(badPrio.statusCode).toBe(400);
      expect(badPrio.json().error.code).toBe("invalid_request");

      const okCreate = await server.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { commandText: "Deploy v1.0", priority: "high", tags: ["release"] },
      });
      expect(okCreate.statusCode).toBe(201);
      expect(okCreate.json().task.priority).toBe("high");

      // Zod validation on POST /dashboard/login rejects missing token
      const badLogin = await server.inject({
        method: "POST",
        url: "/dashboard/login",
        payload: {},
      });
      expect(badLogin.statusCode).toBe(400);
      expect(badLogin.json().error.code).toBe("invalid_request");

      await server.close();
      store.close?.();
    });
  });

  // ── 2. Modular Dashboard JS Assets ───────────────────────────────────────

  describe("Modular dashboard JS assets", () => {
    it("serves each allowlisted JS module with valid syntax and blocks traversal", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);
      const server = Fastify({ logger: false });
      registerDashboardRoutes(server, store, ADMIN_TOKEN, "http://localhost:3000");
      await server.ready();

      for (const file of DASHBOARD_JS_MODULES) {
        const res = await server.inject({ method: "GET", url: `/dashboard/assets/js/${file}` });
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("application/javascript");
        expect(() => new Function(res.body)).not.toThrow();
      }

      // Unknown or traversal names must return 404 / undefined
      expect(getDashboardJsModule("../session.ts")).toBeUndefined();
      const missingRes = await server.inject({
        method: "GET",
        url: "/dashboard/assets/js/nonexistent.js",
      });
      expect(missingRes.statusCode).toBe(404);

      await server.close();
      store.close?.();
    });
  });

  // ── 3. Online SQLite Hot Backup Script ───────────────────────────────────

  describe("scripts/backup-sqlite.sh", () => {
    it("creates a consistent hot backup via VACUUM INTO for live WAL-mode SQLite DBs", async () => {
      const dir = freshDir();
      const dataDir = join(dir, "data");
      const backupRoot = join(dir, "backups");
      const store = createTaskStore(join(dataDir, "tasks.sqlite"));

      await store.createTask({
        id: "backup_task_1",
        source: "web",
        feishuMessageId: "msg_bak_1",
        feishuChatId: "",
        feishuUserId: "admin",
        commandText: "Verify hot SQLite backup",
        status: "pending",
        priority: "urgent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Run backup script while the WAL-mode DB is still open
      execFileSync("bash", ["scripts/backup-sqlite.sh", dataDir, backupRoot, "7"], {
        stdio: "pipe",
      });

      const snapshots = readdirSync(backupRoot);
      expect(snapshots.length).toBe(1);
      const backedUpDbPath = join(backupRoot, snapshots[0], "tasks.sqlite");
      expect(existsSync(backedUpDbPath)).toBe(true);

      const verifyDb = new DatabaseSync(backedUpDbPath, { readOnly: true });
      const row = verifyDb
        .prepare("SELECT id, command_text, priority FROM tasks WHERE id = ?")
        .get("backup_task_1") as { id: string; command_text: string; priority: string } | undefined;
      verifyDb.close();

      expect(row).toEqual({
        id: "backup_task_1",
        command_text: "Verify hot SQLite backup",
        priority: "urgent",
      });

      store.close?.();
    });
  });

  // ── 4. Live Compiled Server + MCP Stdio E2E Smoke Test ───────────────────

  const distReady =
    existsSync("dist/server/index.js") && existsSync("dist/mcp-server/index.js");

  describe.skipIf(!distReady)("Compiled dist/ live E2E smoke test", () => {
    it("boots server from env vars, serves OpenAPI + cookie dashboard, and responds over MCP stdio", async () => {
      const dir = freshDir();
      const port = 34000 + Math.floor(Math.random() * 5000);
      const baseUrl = `http://127.0.0.1:${port}`;

      // 1. Spawn compiled server with pure 12-Factor env vars (zero config file!)
      const srv = spawn(process.execPath, ["dist/server/index.js"], {
        env: {
          ...process.env,
          HARNESS_PORT: String(port),
          HARNESS_PUBLIC_BASE_URL: baseUrl,
          HARNESS_PERSONAL_TOKEN: ADMIN_TOKEN,
          HARNESS_STORAGE_PATH: join(dir, "tasks.sqlite"),
          FEISHU_APP_ID: "cli_e2e",
          FEISHU_APP_SECRET: "sec_e2e",
          FEISHU_VERIFICATION_TOKEN: "vtok_e2e",
          FEISHU_ALLOWED_USER_IDS: "ou_e2e",
        },
        stdio: "pipe",
      });
      spawned.push(srv);

      await waitForHealth(baseUrl);

      // 2. Verify /api/openapi.json
      const oaRes = await fetch(`${baseUrl}/api/openapi.json`);
      expect(oaRes.status).toBe(200);
      const oaJson = (await oaRes.json()) as { openapi: string };
      expect(oaJson.openapi).toBe("3.1.0");

      // 3. Login via POST /dashboard/login to obtain HttpOnly session cookie
      const loginRes = await fetch(`${baseUrl}/dashboard/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ADMIN_TOKEN }),
      });
      expect(loginRes.status).toBe(200);
      const setCookie = loginRes.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("harness_session=");
      const cookiePair = setCookie.split(";")[0];

      // 4. Load /dashboard and modular JS asset using the cookie
      const dashRes = await fetch(`${baseUrl}/dashboard`, { headers: { cookie: cookiePair } });
      expect(dashRes.status).toBe(200);
      const dashHtml = await dashRes.text();
      expect(dashHtml).toContain("/dashboard/assets/js/core.js");
      expect(dashHtml).not.toContain(ADMIN_TOKEN);

      const coreJsRes = await fetch(`${baseUrl}/dashboard/assets/js/core.js`);
      expect(coreJsRes.status).toBe(200);

      // 5. Create and list a task using ONLY the HttpOnly cookie
      const createRes = await fetch(`${baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookiePair },
        body: JSON.stringify({ commandText: "E2E smoke task", priority: "high" }),
      });
      expect(createRes.status).toBe(201);

      // 6. Spawn compiled MCP server over stdio (--toolsets core) and list tools via JSON-RPC
      const mcp = spawn(process.execPath, ["dist/mcp-server/index.js", "--toolsets", "core"], {
        env: {
          ...process.env,
          HARNESS_SERVER_BASE_URL: baseUrl,
          HARNESS_PERSONAL_TOKEN: ADMIN_TOKEN,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      spawned.push(mcp);

      const responses = new Map<number, Record<string, unknown>>();
      let buffer = "";
      mcp.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as { id?: number };
            if (typeof msg.id === "number") {
              responses.set(msg.id, msg);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      });

      const sendRpc = (payload: Record<string, unknown>) => {
        mcp.stdin.write(JSON.stringify(payload) + "\n");
      };

      const waitRpc = async (id: number, timeoutMs = 5000): Promise<Record<string, unknown>> => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const found = responses.get(id);
          if (found) return found;
          await new Promise((r) => setTimeout(r, 30));
        }
        throw new Error(`Timed out waiting for MCP JSON-RPC response id=${id}`);
      };

      sendRpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e2e-smoke", version: "1.0.0" },
        },
      });
      const initResp = await waitRpc(1);
      expect(initResp["result"]).toBeDefined();

      sendRpc({ jsonrpc: "2.0", method: "notifications/initialized" });
      sendRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

      const listResp = await waitRpc(2);
      const tools = ((listResp["result"] as { tools: Array<{ name: string }> }).tools ?? []).map(
        (t) => t.name,
      );
      expect(tools.length).toBe(21);
      expect(tools).toContain("list_tasks");
      expect(tools).toContain("update_task");
      expect(tools).not.toContain("delete_user");
    }, 15_000);
  });
});
