import * as z from "zod/v4";
import {
  CreateTaskBodySchema,
  UpdateTaskStatusBodySchema,
  ReportTaskResultBodySchema,
  SetPriorityBodySchema,
  DashboardLoginBodySchema,
  CreateWebhookBodySchema,
} from "./schemas.js";

function toSchemaObject(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>;
  delete raw["$schema"];
  return raw;
}

/**
 * Build the OpenAPI 3.1.0 specification for harness-remote HTTP API.
 */
export function buildOpenApiSpec(serverUrl = "http://localhost:3000"): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "harness-remote API",
      version: "1.0.0",
      description:
        "Feishu task inbox & collaboration server API for local Codex CLI / MCP clients and the hardened web dashboard.",
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }, { sessionCookie: [] }],
    tags: [
      { name: "System", description: "Health, Prometheus metrics, and OpenAPI docs" },
      { name: "Dashboard", description: "HttpOnly cookie authentication and web UI" },
      { name: "Tasks", description: "Core task lifecycle, FTS5 search, comments, subtasks, and links" },
      { name: "Bulk & Export", description: "Batch operations and JSON/CSV import & export" },
      { name: "Planning", description: "Templates, scheduled tasks, cycles (sprints), and modules (epics)" },
      { name: "SLA & Analytics", description: "SLA policies, breach logs, processing stats, time-series, and kanban" },
      { name: "Realtime & Webhooks", description: "SSE task stream and SSRF-protected outbound webhooks" },
      { name: "Admin", description: "RBAC users, API keys, devices, audit logs, and API usage analytics" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Personal token, user RBAC token, or API key (`Authorization: Bearer <token>`).",
        },
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "harness_session",
          description: "AES-256-GCM encrypted HttpOnly session cookie issued by POST /dashboard/login.",
        },
      },
      schemas: {
        CreateTaskBody: toSchemaObject(CreateTaskBodySchema),
        UpdateTaskStatusBody: toSchemaObject(UpdateTaskStatusBodySchema),
        ReportTaskResultBody: toSchemaObject(ReportTaskResultBodySchema),
        SetPriorityBody: toSchemaObject(SetPriorityBodySchema),
        DashboardLoginBody: toSchemaObject(DashboardLoginBodySchema),
        CreateWebhookBody: toSchemaObject(CreateWebhookBodySchema),
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "array", items: { type: "object" } },
              },
              required: ["code", "message"],
            },
          },
          required: ["error"],
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health check (DB connectivity)",
          security: [],
          responses: {
            "200": { description: "Healthy (`{ ok: true }`)" },
            "503": { description: "Database unreachable" },
          },
        },
      },
      "/metrics": {
        get: {
          tags: ["System"],
          summary: "Prometheus metrics endpoint",
          security: [],
          responses: { "200": { description: "Prometheus text exposition format" } },
        },
      },
      "/api/openapi.json": {
        get: {
          tags: ["System"],
          summary: "OpenAPI 3.1.0 specification JSON",
          security: [],
          responses: { "200": { description: "OpenAPI document" } },
        },
      },
      "/dashboard/login": {
        post: {
          tags: ["Dashboard"],
          summary: "Exchange bearer token for an HttpOnly encrypted session cookie",
          security: [],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/DashboardLoginBody" } } },
          },
          responses: {
            "200": { description: "Session cookie set (`Set-Cookie: harness_session=...; HttpOnly; SameSite=Strict`)" },
            "400": { description: "Missing token" },
            "401": { description: "Invalid token" },
          },
        },
      },
      "/dashboard/logout": {
        post: {
          tags: ["Dashboard"],
          summary: "Clear the dashboard session cookie",
          security: [],
          responses: { "200": { description: "Cookie cleared" } },
        },
      },
      "/api/tasks": {
        get: {
          tags: ["Tasks"],
          summary: "List tasks (supports status, limit, deviceId, priority, from/to filters)",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["pending", "picked", "running", "done", "failed"] } },
            { name: "priority", in: "query", schema: { type: "string", enum: ["low", "normal", "high", "urgent"] } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "deviceId", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "List of tasks" }, "401": { description: "Unauthorized" } },
        },
        post: {
          tags: ["Tasks"],
          summary: "Create a new task",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateTaskBody" } } },
          },
          responses: {
            "201": { description: "Task created" },
            "400": { description: "Validation error" },
          },
        },
      },
      "/api/tasks/search": {
        get: {
          tags: ["Tasks"],
          summary: "Full-text search tasks (SQLite FTS5 trigram index + LIKE fallback)",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Free-text query (ASCII/CJK)" },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "priority", in: "query", schema: { type: "string" } },
            { name: "tags", in: "query", schema: { type: "string" }, description: "Comma-separated tags" },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Matching tasks" } },
        },
      },
      "/api/tasks/{id}": {
        get: {
          tags: ["Tasks"],
          summary: "Get task details by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Task object" }, "404": { description: "Not found" } },
        },
      },
      "/api/tasks/{id}/status": {
        post: {
          tags: ["Tasks"],
          summary: "Transition task status (pending -> picked/running -> done/failed)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateTaskStatusBody" } } },
          },
          responses: { "200": { description: "Updated task" }, "400": { description: "Invalid transition" } },
        },
      },
      "/api/tasks/{id}/result": {
        post: {
          tags: ["Tasks"],
          summary: "Report task execution result and reply to Feishu",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ReportTaskResultBody" } } },
          },
          responses: { "200": { description: "Result saved" } },
        },
      },
      "/api/tasks/{id}/priority": {
        put: {
          tags: ["Tasks"],
          summary: "Update task priority",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SetPriorityBody" } } },
          },
          responses: { "200": { description: "Priority updated" } },
        },
      },
      "/api/tasks/stream": {
        get: {
          tags: ["Realtime & Webhooks"],
          summary: "Server-Sent Events (SSE) real-time task stream",
          responses: { "200": { description: "text/event-stream" } },
        },
      },
      "/api/tasks/bulk/status": {
        post: {
          tags: ["Bulk & Export"],
          summary: "Bulk update task status (transactional)",
          responses: { "200": { description: "Bulk update summary" } },
        },
      },
      "/api/export": {
        get: {
          tags: ["Bulk & Export"],
          summary: "Export tasks, comments, dependencies, templates, and schedules as JSON",
          responses: { "200": { description: "TaskExportPayload JSON" } },
        },
      },
      "/api/templates": {
        get: { tags: ["Planning"], summary: "List task templates", responses: { "200": { description: "Templates" } } },
        post: { tags: ["Planning"], summary: "Create task template", responses: { "201": { description: "Created" } } },
      },
      "/api/cycles": {
        get: { tags: ["Planning"], summary: "List cycles (sprints)", responses: { "200": { description: "Cycles" } } },
        post: { tags: ["Planning"], summary: "Create cycle", responses: { "201": { description: "Created" } } },
      },
      "/api/modules": {
        get: { tags: ["Planning"], summary: "List modules (epics)", responses: { "200": { description: "Modules" } } },
        post: { tags: ["Planning"], summary: "Create module", responses: { "201": { description: "Created" } } },
      },
      "/api/sla/policies": {
        get: { tags: ["SLA & Analytics"], summary: "List SLA policies", responses: { "200": { description: "SLA policies" } } },
        post: { tags: ["SLA & Analytics"], summary: "Create SLA policy", responses: { "201": { description: "Created" } } },
      },
      "/api/stats/summary": {
        get: { tags: ["SLA & Analytics"], summary: "Task statistics summary", responses: { "200": { description: "Stats summary" } } },
      },
      "/api/stats/processing": {
        get: { tags: ["SLA & Analytics"], summary: "Task processing duration percentiles", responses: { "200": { description: "Processing stats" } } },
      },
      "/api/webhooks": {
        get: { tags: ["Realtime & Webhooks"], summary: "List webhook subscriptions", responses: { "200": { description: "Webhooks" } } },
        post: {
          tags: ["Realtime & Webhooks"],
          summary: "Create SSRF-validated webhook subscription",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateWebhookBody" } } },
          },
          responses: { "201": { description: "Webhook created" }, "400": { description: "SSRF / validation rejected" } },
        },
      },
      "/api/users": {
        get: { tags: ["Admin"], summary: "List RBAC users", responses: { "200": { description: "Users" } } },
        post: { tags: ["Admin"], summary: "Create RBAC user (token stored as SHA-256 hash)", responses: { "201": { description: "Created" } } },
      },
      "/api/keys": {
        get: { tags: ["Admin"], summary: "List API keys", responses: { "200": { description: "API keys" } } },
        post: { tags: ["Admin"], summary: "Create API key (stored as SHA-256 hash)", responses: { "201": { description: "Created" } } },
      },
      "/api/devices": {
        get: { tags: ["Admin"], summary: "List registered devices", responses: { "200": { description: "Devices" } } },
        post: { tags: ["Admin"], summary: "Register device", responses: { "201": { description: "Created" } } },
      },
      "/api/audit": {
        get: { tags: ["Admin"], summary: "Query audit log entries", responses: { "200": { description: "Audit log entries" } } },
      },
      "/api/usage/stats": {
        get: { tags: ["Admin"], summary: "Per-caller API usage analytics", responses: { "200": { description: "Usage stats" } } },
      },
    },
  };
}
