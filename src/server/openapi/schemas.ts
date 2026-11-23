import * as z from "zod/v4";
import type { FastifyReply } from "fastify";

export const TaskStatusSchema = z.enum(["pending", "picked", "running", "done", "failed"]);
export const TaskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

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

export const CreateWebhookBodySchema = z.object({
  url: z.string().url("Valid HTTP/HTTPS URL is required"),
  events: z.array(z.string().min(1)).min(1, "At least one event is required"),
  enabled: z.boolean().optional().default(true),
});

export type CreateTaskBody = z.infer<typeof CreateTaskBodySchema>;
export type UpdateTaskStatusBody = z.infer<typeof UpdateTaskStatusBodySchema>;
export type ReportTaskResultBody = z.infer<typeof ReportTaskResultBodySchema>;
export type SetPriorityBody = z.infer<typeof SetPriorityBodySchema>;
export type DashboardLoginBody = z.infer<typeof DashboardLoginBodySchema>;
export type CreateWebhookBody = z.infer<typeof CreateWebhookBodySchema>;

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
