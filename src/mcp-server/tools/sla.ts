import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { TaskApiClient } from "../client.js";

export function registerSlaTools(server: McpServer, client: TaskApiClient): void {
  // list_sla_policies tool
  server.registerTool(
    "list_sla_policies",
    {
      description: "List all SLA (Service Level Agreement) policies. Each policy defines a time target for tasks based on priority and tags.",
      inputSchema: {},
    },
    async () => {
      try {
        const policies = await client.listSlaPolicies();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ policies, count: policies.length }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // get_sla_policy tool
  server.registerTool(
    "get_sla_policy",
    {
      description: "Get details of a specific SLA policy by ID.",
      inputSchema: {
        policyId: z.string().describe("The SLA policy ID to retrieve"),
      },
    },
    async (args) => {
      try {
        const policy = await client.getSlaPolicy(args.policyId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ policy }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // create_sla_policy tool
  server.registerTool(
    "create_sla_policy",
    {
      description:
        "Create a new SLA policy. Policies match tasks by priority and/or tags, and define a time target in minutes. Tasks matching a policy that exceed the target trigger warnings and breaches.",
      inputSchema: {
        name: z.string().describe("Policy name (must be unique)"),
        description: z.string().optional().describe("Human-readable description"),
        targetMinutes: z.number().int().min(1).describe("Target time in minutes for task completion"),
        warningThresholdPercent: z
          .number()
          .int()
          .min(1)
          .max(99)
          .optional()
          .describe("Percentage of target time to trigger warning (default: 80)"),
        matchPriorities: z
          .array(z.enum(["low", "normal", "high", "urgent"]))
          .optional()
          .describe("Priorities this policy applies to. Empty = all priorities"),
        matchTags: z
          .array(z.string())
          .optional()
          .describe("Tags this policy applies to. Empty = all tags"),
        enabled: z.boolean().optional().describe("Whether the policy is active (default: true)"),
      },
    },
    async (args) => {
      try {
        const policy = await client.createSlaPolicy(args);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ policy, message: `SLA policy '${policy.name}' created (id: ${policy.id})` }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // update_sla_policy tool
  server.registerTool(
    "update_sla_policy",
    {
      description: "Update an existing SLA policy. Only specified fields will be changed.",
      inputSchema: {
        policyId: z.string().describe("The SLA policy ID to update"),
        name: z.string().optional().describe("New policy name"),
        description: z.string().optional().describe("New description"),
        targetMinutes: z.number().int().min(1).optional().describe("New target time in minutes"),
        warningThresholdPercent: z.number().int().min(1).max(99).optional().describe("New warning threshold percentage"),
        matchPriorities: z.array(z.enum(["low", "normal", "high", "urgent"])).optional().describe("New priorities to match"),
        matchTags: z.array(z.string()).optional().describe("New tags to match"),
        enabled: z.boolean().optional().describe("Enable or disable the policy"),
      },
    },
    async (args) => {
      const { policyId, ...updates } = args;
      const filteredUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          filteredUpdates[key] = value;
        }
      }

      try {
        const policy = await client.updateSlaPolicy(policyId, filteredUpdates);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ policy, message: `SLA policy '${policy.name}' updated` }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // delete_sla_policy tool
  server.registerTool(
    "delete_sla_policy",
    {
      description: "Delete an SLA policy. This does NOT delete existing breach logs, but future checks will no longer use this policy.",
      inputSchema: {
        policyId: z.string().describe("The SLA policy ID to delete"),
      },
    },
    async (args) => {
      try {
        await client.deleteSlaPolicy(args.policyId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, message: `SLA policy ${args.policyId} deleted` }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // get_sla_summary tool
  server.registerTool(
    "get_sla_summary",
    {
      description:
        "Get a summary of SLA compliance across all active tasks. Shows total policies, active tasks, tasks at risk, breaches, and resolved breaches.",
      inputSchema: {},
    },
    async () => {
      try {
        const summary = await client.getSlaSummary();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...summary,
                message: summary.breached > 0
                  ? `⚠️ ${summary.breached} SLA breach(es), ${summary.warning} task(s) in warning`
                  : summary.warning > 0
                    ? `${summary.warning} task(s) approaching SLA deadline`
                    : "All tasks within SLA targets",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // list_sla_breaches tool
  server.registerTool(
    "list_sla_breaches",
    {
      description: "List all SLA breach and warning log entries. Shows when tasks exceeded their SLA targets.",
      inputSchema: {},
    },
    async () => {
      try {
        const breaches = await client.listSlaBreaches();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ breaches, count: breaches.length }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // check_sla_breaches tool
  server.registerTool(
    "check_sla_breaches",
    {
      description:
        "Manually trigger SLA breach detection. Scans all active tasks against enabled policies, records new warnings/breaches, and auto-resolves entries for completed tasks. Returns the count of new warnings and breaches found.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.checkSlaBreaches();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: result.breaches > 0
                  ? `⚠️ Found ${result.breaches} new breach(es) and ${result.warnings} new warning(s)`
                  : result.warnings > 0
                    ? `Found ${result.warnings} new warning(s), no breaches`
                    : "No new SLA issues detected",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // get_task_sla_status tool
  server.registerTool(
    "get_task_sla_status",
    {
      description:
        "Get SLA status for a specific task. Shows whether the task is within its SLA target, which policy applies, and how many minutes have elapsed since creation.",
      inputSchema: {
        taskId: z.string().describe("The task ID to check SLA status for"),
      },
    },
    async (args) => {
      try {
        const status = await client.getTaskSlaStatus(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...status,
                message: status.status === "no_policy"
                  ? "No SLA policy matches this task"
                  : status.status === "ok"
                    ? `Within SLA — ${Math.round(status.elapsedMinutes)}m / ${status.targetMinutes}m target`
                    : status.status === "warning"
                      ? `⚠️ SLA warning — ${Math.round(status.elapsedMinutes)}m / ${status.targetMinutes}m target (${status.policy?.name})`
                      : `🔴 SLA breached — ${Math.round(status.elapsedMinutes)}m exceeded ${status.targetMinutes}m target (${status.policy?.name})`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );
}
