import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadMcpConfig } from "./config.js";
import { createTaskApiClient } from "./client.js";
import { registerMcpTools } from "./tools.js";
import { parseToolsets, type McpToolset } from "./toolsets.js";

const configPath = process.argv.includes("--config")
  ? process.argv[process.argv.indexOf("--config") + 1]
  : undefined;

const cliToolsetsArg = process.argv.includes("--toolsets")
  ? process.argv[process.argv.indexOf("--toolsets") + 1]
  : undefined;

const isDoctorMode = process.argv.includes("--doctor");
const isJsonOutput = process.argv.includes("--json");

export interface DoctorCheckResult {
  ok: boolean;
  serverBaseUrl?: string;
  toolsets: readonly McpToolset[];
  toolCount: number;
  checks: {
    config: { ok: boolean; error?: string };
    health: { ok: boolean; status?: number; latencyMs?: number; error?: string };
    auth: { ok: boolean; status?: number; latencyMs?: number; error?: string };
  };
}

/**
 * Run self-diagnostics against the configured server without exposing raw tokens.
 */
export async function runMcpDoctor(
  cfgPath?: string,
  toolsetsOverride?: string,
): Promise<DoctorCheckResult> {
  const result: DoctorCheckResult = {
    ok: false,
    toolsets: ["all"],
    toolCount: 0,
    checks: {
      config: { ok: false },
      health: { ok: false },
      auth: { ok: false },
    },
  };

  let config: ReturnType<typeof loadMcpConfig>;
  let toolsets: McpToolset[] | undefined;
  try {
    config = loadMcpConfig(cfgPath);
    toolsets = toolsetsOverride ? parseToolsets(toolsetsOverride) : config.toolsets;
    result.serverBaseUrl = config.serverBaseUrl;
    result.toolsets = toolsets && toolsets.length > 0 ? toolsets : ["all"];
    result.checks.config = { ok: true };
  } catch (err) {
    result.checks.config = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    return result;
  }

  // Count tools that would be registered for the selected toolsets
  let count = 0;
  const countingServer = {
    registerTool() {
      count++;
    },
  } as unknown as McpServer;
  const client = createTaskApiClient(config.serverBaseUrl, config.personalToken, config.deviceId, {
    timeoutMs: config.timeoutMs,
  });
  registerMcpTools(countingServer, client, { toolsets });
  result.toolCount = count;

  const timeoutMs = config.timeoutMs ?? 10_000;

  // Check /health
  const t0 = Date.now();
  try {
    const res = await fetch(`${config.serverBaseUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    result.checks.health = {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - t0,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    result.checks.health = {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Check authenticated API access (/api/tasks?limit=1)
  const t1 = Date.now();
  try {
    const res = await fetch(`${config.serverBaseUrl}/api/tasks?limit=1`, {
      headers: { Authorization: `Bearer ${config.personalToken}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    result.checks.auth = {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - t1,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    result.checks.auth = {
      ok: false,
      latencyMs: Date.now() - t1,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  result.ok =
    result.checks.config.ok && result.checks.health.ok && result.checks.auth.ok;
  return result;
}

export async function startMcpServer(): Promise<void> {
  if (isDoctorMode) {
    const report = await runMcpDoctor(configPath, cliToolsetsArg);
    if (isJsonOutput) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      const icon = (ok: boolean) => (ok ? "PASS" : "FAIL");
      process.stdout.write(
        [
          `harness-remote MCP doctor`,
          `  Server:   ${report.serverBaseUrl ?? "(unconfigured)"}`,
          `  Toolsets: ${report.toolsets.join(", ")} (${report.toolCount} tools)`,
          `  Config:   [${icon(report.checks.config.ok)}]${report.checks.config.error ? " " + report.checks.config.error : ""}`,
          `  Health:   [${icon(report.checks.health.ok)}]${report.checks.health.status ? ` HTTP ${report.checks.health.status} (${report.checks.health.latencyMs}ms)` : ""}${report.checks.health.error ? " " + report.checks.health.error : ""}`,
          `  Auth:     [${icon(report.checks.auth.ok)}]${report.checks.auth.status ? ` HTTP ${report.checks.auth.status} (${report.checks.auth.latencyMs}ms)` : ""}${report.checks.auth.error ? " " + report.checks.auth.error : ""}`,
        ].join("\n") + "\n",
      );
    }
    process.exit(report.ok ? 0 : 1);
  }

  const config = loadMcpConfig(configPath);
  const toolsets = cliToolsetsArg ? parseToolsets(cliToolsetsArg) : config.toolsets;

  const client = createTaskApiClient(config.serverBaseUrl, config.personalToken, config.deviceId, {
    timeoutMs: config.timeoutMs,
  });

  const server = new McpServer({
    name: "harness-remote",
    version: "1.0.0",
  });

  registerMcpTools(server, client, { toolsets });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

startMcpServer();
