import * as z from "zod/v4";
import type { FastifyReply } from "fastify";

export const TaskStatusSchema = z.enum(["pending", "picked", "running", "done", "failed"]);
export const TaskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const UserRoleSchema = z.enum(["admin", "operator", "viewer"]);

export const CreateTaskBodySchema = z.object({
  commandText: z.string().trim().min(1, "commandText is required"),
  description: z.string().optional(),
  priority: TaskPrioritySchema.optional().default("normal"),
  tags: z.array(z.string().trim().min(1)).optional(),
  assignedDeviceId: z.string().trim().min(1).optional(),
  dueDate: z.string().optional(),
  reminderAt: z.string().optional(),
});

export const UpdateTaskStatusBodySchema = z.object({
  status: TaskStatusSchema,
});

export const ReportTaskResultBodySchema = z.object({
  status: z.enum(["done", "failed"]),
  resultSummary: z.string().trim().min(1, "resultSummary is required"),
  resultDetails: z.string().optional(),
});

export const SetPriorityBodySchema = z.object({
  priority: TaskPrioritySchema,
});

export const DashboardLoginBodySchema = z.object({
  token: z.string().trim().min(1, "Request body must include 'token'"),
});

export const BulkIdsBodySchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, "Request body must include 'ids' (non-empty array of task IDs)"),
});

export const BulkStatusBodySchema = BulkIdsBodySchema.extend({
  status: TaskStatusSchema,
});

export const BulkAssignBodySchema = BulkIdsBodySchema.extend({
  deviceId: z.string().trim().min(1, "Request body must include 'deviceId'"),
});

export const BulkPriorityBodySchema = BulkIdsBodySchema.extend({
  priority: TaskPrioritySchema,
});

export const CreateWebhookBodySchema = z.object({
  url: z.string().trim().min(1, "Request body must include 'url' (non-empty string)"),
  events: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().optional().default(true),
  description: z.string().optional(),
});

export const CreateUserBodySchema = z.object({
  username: z.string().trim().min(1, "Request body must include 'username' (non-empty string)"),
  role: UserRoleSchema.optional().default("viewer"),
  feishuUserId: z.string().trim().min(1).optional(),
});

export const CreateApiKeyBodySchema = z.object({
  name: z.string().trim().min(1, "Request body must include 'name' (non-empty string)"),
  userId: z.string().trim().min(1).optional(),
  role: UserRoleSchema.optional(),
});

export const RegisterDeviceBodySchema = z.object({
  name: z.string().trim().min(1, "Request body must include 'name' (non-empty string)"),
  capabilities: z.string().optional(),
});

export const CreateTemplateBodySchema = z.object({
  name: z.string().trim().min(1, "Request body must include 'name'"),
  commandText: z.string().trim().min(1, "Request body must include 'commandText'"),
  description: z.string().optional(),
  priority: TaskPrioritySchema.optional().default("normal"),
  tags: z.array(z.string().trim().min(1)).optional(),
  assignedDeviceId: z.string().trim().min(1).optional(),
  dueDateOffsetMs: z.number().int().positive().optional(),
  reminderOffsetMs: z.number().int().positive().optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

export const CreateCycleBodySchema = z.object({
  name: z.string().trim().min(1, "'name' is required"),
  description: z.string().optional(),
  startDate: z.string().trim().min(1, "'startDate' is required"),
  endDate: z.string().trim().min(1, "'endDate' is required"),
});

export const CreateModuleBodySchema = z.object({
  name: z.string().trim().min(1, "Module name is required"),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const CreateSlaPolicyBodySchema = z.object({
  name: z.string().trim().min(1, "Request body must include 'name' (non-empty string)"),
  description: z.string().optional(),
  targetMinutes: z.number().positive("Request body must include 'targetMinutes' (positive number in minutes)"),
  warningThresholdPercent: z.number().min(1).max(100).optional().default(80),
  matchPriorities: z.array(TaskPrioritySchema).optional(),
  matchTags: z.array(z.string().trim().min(1)).optional(),
  enabled: z.boolean().optional().default(true),
});

export type CreateTaskBody = z.infer<typeof CreateTaskBodySchema>;
export type UpdateTaskStatusBody = z.infer<typeof UpdateTaskStatusBodySchema>;
export type ReportTaskResultBody = z.infer<typeof ReportTaskResultBodySchema>;
export type SetPriorityBody = z.infer<typeof SetPriorityBodySchema>;
export type DashboardLoginBody = z.infer<typeof DashboardLoginBodySchema>;
export type CreateWebhookBody = z.infer<typeof CreateWebhookBodySchema>;
export type CreateUserBody = z.infer<typeof CreateUserBodySchema>;
export type CreateApiKeyBody = z.infer<typeof CreateApiKeyBodySchema>;
export type RegisterDeviceBody = z.infer<typeof RegisterDeviceBodySchema>;
export type CreateTemplateBody = z.infer<typeof CreateTemplateBodySchema>;
export type CreateCycleBody = z.infer<typeof CreateCycleBodySchema>;
export type CreateModuleBody = z.infer<typeof CreateModuleBodySchema>;
export type CreateSlaPolicyBody = z.infer<typeof CreateSlaPolicyBodySchema>;

/**
 * Validate a Fastify request body with a Zod schema.
 * On failure, sends a 400 JSON error response and returns `undefined`.
 */
export function parseBody<T>(
  schema: z.ZodType<T>,
  rawBody: unknown,
  reply: FastifyReply,
): T | undefined {
  const result = schema.safeParse(rawBody ?? {});
  if (result.success) {
    return result.data;
  }

  const details = result.error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
  const firstMsg = details[0]?.message ?? "Invalid request body";

  reply.code(400).send({
    error: {
      code: "invalid_request",
      message: firstMsg,
      details,
    },
  });
  return undefined;
}
