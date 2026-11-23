import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { TaskApiClient } from "../client.js";

export function registerAdminTools(server: McpServer, client: TaskApiClient): void {
  // register_device tool
  // register_device tool
  server.registerTool(
    "register_device",
    {
      description: "Register this MCP server instance as a device. Returns a device ID and token. Use this to set up multi-device task routing.",
      inputSchema: {
        name: z
          .string()
          .describe("A human-readable name for this device (e.g., 'office-desktop', 'laptop-dev')"),
        capabilities: z
          .string()
          .optional()
          .describe("Optional comma-separated capabilities (e.g., 'frontend,react,node')"),
      },
    },
    async (args) => {
      const { name, capabilities } = args;

      try {
        const device = await client.registerDevice(name, capabilities);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                device,
                message: `Device registered successfully. Save the token securely — it's needed for MCP config.`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // list_devices tool
  server.registerTool(
    "list_devices",
    {
      description:
        "List all registered devices. Returns device ID, name, capabilities, last seen time, and creation date. Use this to discover available devices for task routing.",
      inputSchema: {},
    },
    async () => {
      try {
        const devices = await client.listDevices();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                devices,
                total: devices.length,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // get_device tool
  server.registerTool(
    "get_device",
    {
      description:
        "Get detailed information about a specific device by its ID. Returns device name, capabilities, token, last seen time, and creation date.",
      inputSchema: {
        deviceId: z
          .string()
          .describe("The device ID to look up (e.g., 'dev_1234567890_abcdef01')"),
      },
    },
    async (args) => {
      const { deviceId } = args;

      try {
        const device = await client.getDevice(deviceId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ device }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // delete_device tool
  server.registerTool(
    "delete_device",
    {
      description:
        "Permanently remove a device. This cannot be undone. The device will no longer be available for task routing.",
      inputSchema: {
        deviceId: z
          .string()
          .describe("The device ID to delete (e.g., 'dev_1234567890_abcdef01')"),
      },
    },
    async (args) => {
      const { deviceId } = args;

      try {
        await client.deleteDevice(deviceId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: `Device ${deviceId} deleted successfully.`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // query_audit_log tool
  server.registerTool(
    "query_audit_log",
    {
      description:
        "Query the audit log to see who did what and when. Returns audit entries sorted by time (newest first). Useful for tracking task lifecycle, user actions, and system events.",
      inputSchema: {
        action: z
          .string()
          .optional()
          .describe("Filter by action type (e.g., 'task.created', 'task.status_changed', 'task.result_reported')"),
        taskId: z
          .string()
          .optional()
          .describe("Filter by task ID to see all audit entries for a specific task"),
        actor: z
          .string()
          .optional()
          .describe("Filter by actor (user ID, device ID, or 'system')"),
        actorType: z
          .enum(["feishu", "device", "api", "system"])
          .optional()
          .describe("Filter by actor type"),
        from: z
          .string()
          .optional()
          .describe("ISO 8601 date string — only return entries on or after this date"),
        to: z
          .string()
          .optional()
          .describe("ISO 8601 date string — only return entries on or before this date"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum number of results. Default: 50, max: 200"),
      },
    },
    async (args) => {
      const { action, taskId, actor, actorType, from, to, limit } = args;

      try {
        const entries = await client.queryAuditLog({ action, taskId, actor, actorType, from, to, limit });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ entries, count: entries.length }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // list_webhooks tool
  server.registerTool(
    "list_webhooks",
    {
      description:
        "List all webhook subscriptions. Returns webhooks with their URL, subscribed events, enabled status, and creation time. Useful for auditing which external services receive task event notifications.",
      inputSchema: {},
    },
    async () => {
      try {
        const webhooks = await client.listWebhooks();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ webhooks, count: webhooks.length }, null, 2),
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

  // get_webhook tool
  server.registerTool(
    "get_webhook",
    {
      description:
        "Get details of a specific webhook subscription including URL, events, secret, and enabled status.",
      inputSchema: {
        webhookId: z.string().describe("The webhook subscription ID (e.g., 'wh_1234567890_abc123')"),
      },
    },
    async (args) => {
      const { webhookId } = args;
      try {
        const webhook = await client.getWebhook(webhookId);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(webhook, null, 2) }],
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

  // create_webhook tool
  server.registerTool(
    "create_webhook",
    {
      description:
        "Create a new webhook subscription. The webhook will receive HTTP POST requests to the specified URL when the subscribed events occur. A signing secret is auto-generated for payload verification. Valid events: task.created, task.status_changed, task.result_reported, task.assigned, task.deleted.",
      inputSchema: {
        url: z.string().describe("The HTTPS URL to receive webhook POST requests"),
        events: z
          .array(z.string())
          .describe('Array of event types to subscribe to (e.g., ["task.created", "task.status_changed"])'),
        enabled: z
          .boolean()
          .optional()
          .describe("Whether the webhook is active (default: true)"),
        description: z
          .string()
          .optional()
          .describe("A human-readable description of what this webhook does"),
      },
    },
    async (args) => {
      const { url, events, enabled, description } = args;
      try {
        const webhook = await client.createWebhook({ url, events, enabled, description });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: `Webhook created: ${webhook.id}`,
                  webhook,
                },
                null,
                2,
              ),
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

  // update_webhook tool
  server.registerTool(
    "update_webhook",
    {
      description:
        "Update an existing webhook subscription. Only specified fields are updated; others remain unchanged. Can change URL, events, enabled status, or description.",
      inputSchema: {
        webhookId: z.string().describe("The webhook subscription ID to update"),
        url: z.string().optional().describe("New URL for the webhook endpoint"),
        events: z
          .array(z.string())
          .optional()
          .describe("New array of event types to subscribe to"),
        enabled: z.boolean().optional().describe("Enable or disable the webhook"),
        description: z.string().optional().describe("New description for the webhook"),
      },
    },
    async (args) => {
      const { webhookId, url, events, enabled, description } = args;
      try {
        const webhook = await client.updateWebhook(webhookId, { url, events, enabled, description });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(webhook, null, 2) }],
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

  // delete_webhook tool
  server.registerTool(
    "delete_webhook",
    {
      description:
        "Delete a webhook subscription. This permanently removes the subscription and its delivery history. The webhook will stop receiving events immediately.",
      inputSchema: {
        webhookId: z.string().describe("The webhook subscription ID to delete"),
      },
    },
    async (args) => {
      const { webhookId } = args;
      try {
        await client.deleteWebhook(webhookId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `Webhook ${webhookId} deleted successfully` }),
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

  // list_webhook_deliveries tool
  server.registerTool(
    "list_webhook_deliveries",
    {
      description:
        "List delivery history for a webhook subscription. Shows past HTTP delivery attempts with status codes, success/failure, response times, and error messages. Useful for debugging webhook integration issues.",
      inputSchema: {
        webhookId: z.string().describe("The webhook subscription ID to check deliveries for"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of delivery entries to return (default: 50, max: 200)"),
      },
    },
    async (args) => {
      const { webhookId, limit } = args;
      try {
        const deliveries = await client.listWebhookDeliveries(webhookId, limit);
        const successCount = deliveries.filter((d) => d.success).length;
        const failCount = deliveries.length - successCount;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  webhookId,
                  deliveries,
                  count: deliveries.length,
                  summary: { success: successCount, failed: failCount },
                },
                null,
                2,
              ),
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

  // list_users tool
  server.registerTool(
    "list_users",
    {
      description: "List all registered users with their roles, tokens, and Feishu user IDs. Admin-only operation for user management.",
      inputSchema: {},
    },
    async () => {
      try {
        const users = await client.listUsers();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ users, total: users.length }, null, 2),
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

  // get_user tool
  server.registerTool(
    "get_user",
    {
      description: "Get detailed information about a specific user by ID, including their role, token, Feishu user ID, and timestamps.",
      inputSchema: {
        userId: z.string().describe("The user ID to look up"),
      },
    },
    async (args) => {
      const { userId } = args;
      try {
        const user = await client.getUser(userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ user }, null, 2),
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

  // create_user tool
  server.registerTool(
    "create_user",
    {
      description: "Create a new user account with a username, role, and optional Feishu user ID. Returns the new user with their generated token. Valid roles: admin, operator, viewer.",
      inputSchema: {
        username: z.string().describe("Unique username for the new user"),
        role: z.enum(["admin", "operator", "viewer"]).optional().describe("User role. Default: viewer"),
        feishuUserId: z.string().optional().describe("Optional Feishu user ID to link"),
      },
    },
    async (args) => {
      const { username, role, feishuUserId } = args;
      try {
        const user = await client.createUser(username, role as "admin" | "operator" | "viewer" | undefined, feishuUserId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ user, message: `User '${username}' created successfully` }, null, 2),
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

  // update_user_role tool
  server.registerTool(
    "update_user_role",
    {
      description: "Change a user's role (admin, operator, viewer). This affects what operations the user can perform.",
      inputSchema: {
        userId: z.string().describe("The user ID to update"),
        role: z.enum(["admin", "operator", "viewer"]).describe("New role to assign"),
      },
    },
    async (args) => {
      const { userId, role } = args;
      try {
        const user = await client.updateUserRole(userId, role as "admin" | "operator" | "viewer");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ user, message: `User role updated to '${role}'` }, null, 2),
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

  // delete_user tool
  server.registerTool(
    "delete_user",
    {
      description: "Permanently delete a user account. This action cannot be undone.",
      inputSchema: {
        userId: z.string().describe("The user ID to delete"),
      },
    },
    async (args) => {
      const { userId } = args;
      try {
        await client.deleteUser(userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `User '${userId}' deleted successfully` }, null, 2),
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

  // regenerate_user_token tool
  server.registerTool(
    "regenerate_user_token",
    {
      description: "Generate a new authentication token for a user, invalidating the old one. Useful when a token is compromised or lost.",
      inputSchema: {
        userId: z.string().describe("The user ID to regenerate token for"),
      },
    },
    async (args) => {
      const { userId } = args;
      try {
        const user = await client.regenerateUserToken(userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ user, message: `Token regenerated for user '${userId}'. New token: ${user.token}` }, null, 2),
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

  // list_api_keys tool
  server.registerTool(
    "list_api_keys",
    {
      description: "List all API keys, optionally filtered by user ID. Shows key name, user assignment, role, enabled status, and last used time. The actual key token is included for newly created or rotated keys.",
      inputSchema: {
        userId: z
          .string()
          .optional()
          .describe("Filter API keys by user ID"),
      },
    },
    async (args) => {
      const { userId } = args;
      try {
        const apiKeys = await client.listApiKeys(userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ apiKeys, count: apiKeys.length }, null, 2),
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

  // get_api_key tool
  server.registerTool(
    "get_api_key",
    {
      description: "Get details of a specific API key including name, user assignment, role, enabled status, last used time, and previous key info (for grace period rotations).",
      inputSchema: {
        keyId: z.string().describe("The API key ID (e.g., 'ak_1234567890_abc123')"),
      },
    },
    async (args) => {
      const { keyId } = args;
      try {
        const apiKey = await client.getApiKey(keyId);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(apiKey, null, 2) }],
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

  // create_api_key tool
  server.registerTool(
    "create_api_key",
    {
      description:
        "Create a new API key for a user. The key can be used as a Bearer token for authentication. Only admins and operators can create API keys.",
      inputSchema: {
        name: z.string().describe("A human-readable name for the API key (e.g., 'Codex CLI key')"),
        userId: z.string().describe("The user ID to assign this API key to"),
        role: z
          .enum(["admin", "operator", "viewer"])
          .optional()
          .describe("The role for this API key (default: the creator's role)"),
      },
    },
    async (args) => {
      const { name, userId, role } = args;
      try {
        const apiKey = await client.createApiKey(name, userId, role);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  apiKey,
                  message: `API key '${name}' created for user '${userId}'. Key: ${apiKey.key}`,
                },
                null,
                2,
              ),
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

  // rotate_api_key tool
  server.registerTool(
    "rotate_api_key",
    {
      description:
        "Rotate an API key — generate a new key and optionally keep the old one valid for a grace period (default: 24 hours). After the grace period, the old key is automatically revoked.",
      inputSchema: {
        keyId: z.string().describe("The API key ID to rotate"),
        gracePeriodMs: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Grace period in milliseconds for the previous key to remain valid (default: 86400000 = 24 hours, max: 604800000 = 7 days). Set to 0 to revoke immediately."),
      },
    },
    async (args) => {
      const { keyId, gracePeriodMs } = args;
      try {
        const apiKey = await client.rotateApiKey(keyId, gracePeriodMs);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  apiKey,
                  message: `API key rotated. New key: ${apiKey.key}${apiKey.previousKeyExpiresAt ? `. Previous key expires at: ${apiKey.previousKeyExpiresAt}` : ""}`,
                },
                null,
                2,
              ),
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

  // revoke_api_key tool
  server.registerTool(
    "revoke_api_key",
    {
      description: "Permanently revoke (delete) an API key. The key will immediately stop working for authentication. This action cannot be undone.",
      inputSchema: {
        keyId: z.string().describe("The API key ID to revoke"),
      },
    },
    async (args) => {
      const { keyId } = args;
      try {
        await client.revokeApiKey(keyId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `API key '${keyId}' revoked successfully` }, null, 2),
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

  // enable_api_key tool
  server.registerTool(
    "enable_api_key",
    {
      description: "Re-enable a disabled API key. The key will immediately start working for authentication again.",
      inputSchema: {
        keyId: z.string().describe("The API key ID to enable"),
      },
    },
    async (args) => {
      const { keyId } = args;
      try {
        const apiKey = await client.enableApiKey(keyId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ apiKey, message: `API key '${keyId}' enabled successfully` }, null, 2),
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

  // disable_api_key tool
  server.registerTool(
    "disable_api_key",
    {
      description: "Temporarily disable an API key. The key will stop working for authentication but can be re-enabled later.",
      inputSchema: {
        keyId: z.string().describe("The API key ID to disable"),
      },
    },
    async (args) => {
      const { keyId } = args;
      try {
        const apiKey = await client.disableApiKey(keyId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ apiKey, message: `API key '${keyId}' disabled successfully` }, null, 2),
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

  // cleanup_expired_api_keys tool
  server.registerTool(
    "cleanup_expired_api_keys",
    {
      description:
        "Delete expired previous API keys from key rotations. After a key rotation with grace period, the old key stays in the database until it expires. This tool cleans up those expired entries.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.cleanupExpiredApiKeys();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `Cleaned up ${result.cleaned} expired API key(s)`, cleaned: result.cleaned }, null, 2),
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

  // ─── Saved Views tools ────────────────────────────────────────────────

  // reset_stale_tasks tool
  server.registerTool(
    "reset_stale_tasks",
    {
      description: "Reset stale tasks that have been stuck in 'picked' or 'running' state for too long. Useful when a device crashed or lost connection while processing a task. The tasks are reset to 'pending' so they can be re-processed.",
      inputSchema: {
        timeoutMs: z
          .number()
          .optional()
          .describe("Maximum time in milliseconds a task can remain in picked/running state before being considered stale. Default: 1800000 (30 minutes)"),
      },
    },
    async (args) => {
      try {
        const result = await client.resetStaleTasks(args.timeoutMs as number | undefined);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `Reset ${result.resetCount} stale task(s)`, resetCount: result.resetCount }, null, 2),
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

  // cleanup_processed_events tool
  server.registerTool(
    "cleanup_processed_events",
    {
      description: "Clean up old processed Feishu events to keep the dedup database lean. Events older than the retention period are permanently deleted. Use this periodically to prevent unbounded database growth.",
      inputSchema: {
        retentionDays: z
          .number()
          .optional()
          .describe("Keep events from the last N days. Events older than this are deleted. Default: 7"),
      },
    },
    async (args) => {
      try {
        const result = await client.cleanupProcessedEvents(args.retentionDays as number | undefined);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `Cleaned up ${result.deletedCount} old event(s)`, deletedCount: result.deletedCount }, null, 2),
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

  // audit_count tool
  server.registerTool(
    "audit_count",
    {
      description:
        "Get the total number of audit log entries. Useful for monitoring system activity volume and deciding when cleanup is needed.",
      inputSchema: {},
    },
    async () => {
      try {
        const count = await client.getAuditCount();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ count, message: `Audit log contains ${count} entries` }, null, 2),
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

  // cleanup_audit_log tool
  server.registerTool(
    "cleanup_audit_log",
    {
      description:
        "Delete old audit log entries to free up storage. Removes entries older than the specified retention period. Default retention is 30 days.",
      inputSchema: {
        retentionDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Number of days to retain audit logs. Entries older than this are deleted. Default: 30"),
      },
    },
    async (args) => {
      try {
        const result = await client.cleanupAuditLog(args.retentionDays as number | undefined);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `Cleaned up ${result.deletedCount} old audit log entry(ies)`, deletedCount: result.deletedCount }, null, 2),
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
