import { describe, it, expect, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Fastify from "fastify";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { registerMcpTools } from "../../src/mcp-server/tools.js";
import { createTaskApiClient, type TaskApiClient } from "../../src/mcp-server/client.js";
import {
  MCP_TOOLSET_TOOLS,
  parseToolsets,
  shouldRegisterTool,
  getToolsetForTool,
} from "../../src/mcp-server/toolsets.js";
import { loadServerConfig } from "../../src/server/config.js";
import { loadMcpConfig } from "../../src/mcp-server/config.js";
import { createTaskStore } from "../../src/server/tasks/store.js";
import { registerTaskRoutes } from "../../src/server/tasks/routes.js";
import { registerStatsRoutes } from "../../src/server/stats/routes.js";

const TMP_DIR = "/tmp/harness-remote-wave2-test";

function freshDir(): string {
  const dir = `${TMP_DIR}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("Wave 2 Optimizations: MCP Toolsets, Resilient Client, Env Config & SQL Projection", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    // Restore environment variables cleanly
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, val] of Object.entries(savedEnv)) {
      process.env[key] = val;
    }
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  // ── 1. MCP Toolset Filtering ─────────────────────────────────────────────

  describe("MCP toolsets", () => {
    function collectRegisteredTools(toolsets?: Parameters<typeof registerMcpTools>[2]) {
      const registered: string[] = [];
      const fakeServer = {
        registerTool(name: string) {
          registered.push(name);
        },
      } as unknown as McpServer;
      registerMcpTools(fakeServer, {} as TaskApiClient, toolsets);
      return registered;
    }

    it("registers all 161 tools by default and explicitly categorizes every tool", () => {
      const all = collectRegisteredTools();
      expect(all.length).toBe(161);

      // Verify every single registered tool is explicitly listed in MCP_TOOLSET_TOOLS (no silent drift)
      const categorized = new Set(Object.values(MCP_TOOLSET_TOOLS).flat());
      const missing = all.filter((name) => !categorized.has(name));
      expect(missing).toEqual([]);
    });

    it("registers only the 21 core tools when toolsets: ['core']", () => {
      const core = collectRegisteredTools({ toolsets: ["core"] });
      expect(core.length).toBe(21);
      expect(core).toContain("list_tasks");
      expect(core).toContain("update_task");
      expect(core).toContain("report_task_result");
      expect(core).toContain("reply_feishu");
      expect(core).not.toContain("create_user");
      expect(core).not.toContain("create_sla_policy");
      expect(core).not.toContain("create_cycle");
    });

    it("supports combining multiple toolsets (e.g. core + sla)", () => {
      const combined = collectRegisteredTools({ toolsets: ["core", "sla"] });
      expect(combined.length).toBe(30);
      expect(combined).toContain("list_tasks");
      expect(combined).toContain("create_sla_policy");
      expect(combined).not.toContain("delete_user");
    });

    it("parses CSV toolsets and rejects unknown toolset names", () => {
      expect(parseToolsets("core, planning, core")).toEqual(["core", "planning"]);
      expect(parseToolsets("")).toBeUndefined();
      expect(() => parseToolsets("core,nonexistent")).toThrow(/Invalid MCP toolset/);
      expect(getToolsetForTool("create_webhook")).toBe("admin");
      expect(shouldRegisterTool("create_webhook", ["core"])).toBe(false);
      expect(shouldRegisterTool("create_webhook", ["all"])).toBe(true);
    });
  });

  // ── 2. Resilient MCP HTTP Client ─────────────────────────────────────────

  describe("TaskApiClient resilient fetch", () => {
    it("retries idempotent GET requests on 503 and succeeds", async () => {
      let calls = 0;
      const mockFetch: typeof globalThis.fetch = async () => {
        calls++;
        if (calls < 3) {
          return new Response("Service Unavailable", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "content-type": "text/plain" },
          });
        }
        return new Response(JSON.stringify({ tasks: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const client = createTaskApiClient("http://localhost:8787", "tok_test", undefined, {
        maxRetries: 2,
        retryBaseDelayMs: 5,
        fetchFn: mockFetch,
      });

      const tasks = await client.listTasks();
      expect(tasks).toEqual([]);
      expect(calls).toBe(3);
    });

    it("does NOT retry non-idempotent POST requests on 503", async () => {
      let calls = 0;
      const mockFetch: typeof globalThis.fetch = async () => {
        calls++;
        return new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "content-type": "text/html" },
        });
      };

      const client = createTaskApiClient("http://localhost:8787", "tok_test", undefined, {
        maxRetries: 2,
        retryBaseDelayMs: 5,
        fetchFn: mockFetch,
      });

      // Should NOT throw SyntaxError: Unexpected token '<' — should convert HTML proxy error cleanly
      await expect(client.createTask({ commandText: "hello" })).rejects.toThrow(/502.*Bad Gateway/);
      expect(calls).toBe(1);
    });
  });

  // ── 3. 12-Factor Environment Variable Config ─────────────────────────────

  describe("12-Factor env var configuration", () => {
    it("overrides server JSON config values via environment variables", () => {
      const dir = freshDir();
      const cfgPath = `${dir}/server.json`;
      writeFileSync(
        cfgPath,
        JSON.stringify({
          port: 8787,
          publicBaseUrl: "http://localhost:8787",
          personalToken: "json-token-at-least-24-chars-long",
          storagePath: "./data/tasks.sqlite",
          feishu: {
            appId: "cli_json",
            appSecret: "sec_json",
            verificationToken: "ver_json",
            encryptKey: "",
            allowedUserIds: ["ou_json"],
          },
        }),
      );

      process.env["HARNESS_PORT"] = "9999";
      process.env["HARNESS_PERSONAL_TOKEN"] = "env-override-token-at-least-24-chars";
      process.env["FEISHU_ALLOWED_USER_IDS"] = "ou_env_1, ou_env_2";
      process.env["HARNESS_WEBHOOK_TIMEOUT_MS"] = "4500";

      const cfg = loadServerConfig(cfgPath);
      expect(cfg.port).toBe(9999);
      expect(cfg.personalToken).toBe("env-override-token-at-least-24-chars");
      expect(cfg.feishu.allowedUserIds).toEqual(["ou_env_1", "ou_env_2"]);
      expect(cfg.webhookTimeoutMs).toBe(4500);
    });

    it("loads MCP config with toolsets and timeoutMs from environment variables", () => {
      const dir = freshDir();
      const cfgPath = `${dir}/mcp.json`;
      writeFileSync(
        cfgPath,
        JSON.stringify({
          serverBaseUrl: "http://localhost:8787",
          personalToken: "tok_json",
        }),
      );

      process.env["HARNESS_MCP_TOOLSETS"] = "core,sla";
      process.env["HARNESS_MCP_TIMEOUT_MS"] = "12000";

      const cfg = loadMcpConfig(cfgPath);
      expect(cfg.toolsets).toEqual(["core", "sla"]);
      expect(cfg.timeoutMs).toBe(12000);
    });
  });

  // ── 4. Processing Stats SQL Projection & Transactional Bulk Clone ────────

  describe("SQL processing stats projection & transactional operations", () => {
    it("computes /api/stats/processing using lightweight getCompletedTaskTimings", async () => {
      const dir = freshDir();
      const store = createTaskStore(`${dir}/tasks.sqlite`);
      const t0 = new Date("2026-06-01T10:00:00.000Z").toISOString();

      await store.createTask({
        id: "task_stat_1",
        source: "feishu",
        feishuMessageId: "msg_stat_1",
        feishuChatId: "oc_1",
        feishuUserId: "ou_1",
        commandText: "compute stats",
        status: "pending",
        priority: "normal",
        createdAt: t0,
        updatedAt: t0,
      });
      await store.updateTaskStatus("task_stat_1", "picked");
      await store.updateTaskStatus("task_stat_1", "running");
      await store.saveTaskResult("task_stat_1", true, "all good");

      const timings = await store.getCompletedTaskTimings!();
      expect(timings).toHaveLength(1);
      expect(timings[0].status).toBe("done");
      expect(timings[0].completedAt).toBeTruthy();

      const token = "stats-test-personal-token-123456";
      const server = Fastify({ logger: false });
      registerTaskRoutes(server, store, token);
      registerStatsRoutes(server, store, token);
      await server.ready();

      const res = await server.inject({
        method: "GET",
        url: "/api/stats/processing",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { totalCompleted: number; byStatus: { done: number; failed: number } };
      expect(body.totalCompleted).toBe(1);
      expect(body.byStatus.done).toBe(1);
      expect(body.byStatus.failed).toBe(0);

      // Verify transactional bulkCloneTasks clones cleanly without feishu_message_id collision
      const cloneRes = await store.bulkCloneTasks(["task_stat_1", "task_stat_1"]);
      expect(cloneRes.cloned).toBe(2);
      expect(cloneRes.errors).toEqual([]);

      await server.close();
      store.close?.();
    });
  });
});
