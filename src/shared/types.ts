export type TaskStatus = "pending" | "picked" | "running" | "done" | "failed";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type FeishuFileType = "text" | "image" | "file" | "audio" | "media" | "sticker" | "post" | "interactive";

export interface Attachment {
  fileKey: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  feishuFileType: FeishuFileType;
}

export interface Device {
  id: string;
  name: string;
  token: string;
  capabilities?: string;
  lastSeen?: string;
  createdAt: string;
}

export interface Task {
  id: string;
  source: "feishu";
  feishuMessageId: string;
  feishuChatId: string;
  feishuUserId: string;
  commandText: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags?: string[];
  attachments?: Attachment[];
  assignedDeviceId?: string;
  /** Task IDs that must complete before this task is ready for processing */
  dependsOn?: string[];
  dueDate?: string;
  reminderAt?: string;
  createdAt: string;
  updatedAt: string;
  resultSummary?: string;
  resultDetails?: string;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  taskId?: string;
  actor: string;
  actorType: "feishu" | "device" | "api" | "system";
  details?: Record<string, unknown>;
  timestamp: string;
}

export type AuditAction =
  | "task.created"
  | "task.status_changed"
  | "task.result_reported"
  | "task.assigned"
  | "task.unassigned"
  | "task.reset_stale"
  | "task.tags_added"
  | "task.tags_removed"
  | "event.received"
  | "event.duplicate"
  | "event.non_allowed_user"
  | "feishu.reply_sent"
  | "feishu.reply_failed"
  | "cleanup.processed_events"
  | "task.comment_added"
  | "task.comment_deleted"
  | "task.dependencies_set"
  | "api_key.created"
  | "api_key.rotated"
  | "api_key.revoked";

export interface AuditLogSearchOptions {
  action?: string;
  taskId?: string;
  actor?: string;
  actorType?: AuditLogEntry["actorType"];
  from?: string;
  to?: string;
  limit?: number;
}

/** A comment on a task */
export interface TaskComment {
  id: number;
  taskId: string;
  author: string;
  authorType: AuditLogEntry["actorType"];
  body: string;
  createdAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/** Webhook event types that can trigger notifications */
export type WebhookEvent =
  | "task.created"
  | "task.status_changed"
  | "task.result_reported"
  | "task.assigned"
  | "task.deleted";

/** A webhook subscription that receives HTTP callbacks on task events */
export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  enabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** Payload sent to webhook endpoints */
export interface WebhookPayload {
  event: WebhookEvent;
  taskId: string;
  task: Task;
  timestamp: string;
  /** Additional context about the event (e.g., previous status for status_changed) */
  meta?: Record<string, unknown>;
}

/** Delivery log entry for webhook deliveries */
export interface WebhookDelivery {
  id: number;
  webhookId: string;
  event: WebhookEvent;
  url: string;
  statusCode: number | null;
  success: boolean;
  error?: string;
  durationMs: number;
  timestamp: string;
}

/** RBAC role for API users */
export type UserRole = "admin" | "operator" | "viewer";

/** API user with per-user token */
export interface User {
  id: string;
  username: string;
  token: string;
  role: UserRole;
  feishuUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/** How often a scheduled task should create a new task */
export type ScheduleFrequency = "once" | "hourly" | "daily" | "weekly" | "monthly";

/** A scheduled/recurring task definition — periodically creates new tasks */
export interface ScheduledTask {
  id: string;
  /** Optional template ID to base the created task on */
  templateId?: string;
  /** The command text for the task to create */
  commandText: string;
  /** How often to create a task */
  frequency: ScheduleFrequency;
  /** Optional task priority */
  priority?: TaskPriority;
  /** Optional tags to apply to created tasks */
  tags?: string[];
  /** Optional device to assign created tasks to */
  assignedDeviceId?: string;
  /** ISO 8601 — when to next create a task */
  nextRunAt: string;
  /** ISO 8601 — when the last task was created */
  lastRunAt?: string;
  /** ID of the most recently created task */
  lastTaskId?: string;
  /** Whether this schedule is active */
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** A reusable task definition — templates let users quickly create common tasks */
export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  commandText: string;
  priority?: TaskPriority;
  tags?: string[];
  assignedDeviceId?: string;
  /** Milliseconds offset from creation time for the due date (e.g., 86400000 = +1 day) */
  dueDateOffsetMs?: number;
  /** Milliseconds offset from creation time for the reminder (e.g., 3600000 = +1 hour) */
  reminderOffsetMs?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** SLA policy — defines resolution time targets per priority or tag */
export interface SlaPolicy {
  id: string;
  /** Human-readable name for this SLA policy */
  name: string;
  description?: string;
  /** Target resolution time in minutes */
  targetMinutes: number;
  /** Warning threshold as percentage of target (e.g., 80 = warn at 80% of target time). Default: 80 */
  warningThresholdPercent: number;
  /** Optional: match tasks with these priorities. If empty, applies to all priorities */
  matchPriorities?: TaskPriority[];
  /** Optional: match tasks with these tags (all specified tags must match) */
  matchTags?: string[];
  /** Whether this policy is active */
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** SLA breach severity */
export type SlaBreachType = "warning" | "breach";

/** SLA status for a task */
export type SlaStatus = "no_sla" | "on_track" | "warning" | "breached";

/** An SLA breach log entry — records when a task breached its SLA policy */
export interface SlaBreachLog {
  id: number;
  taskId: string;
  policyId: string;
  policyName: string;
  breachType: SlaBreachType;
  /** Target resolution time in minutes from the matched policy */
  targetMinutes: number;
  /** Actual elapsed minutes from task creation to detection */
  actualMinutes: number;
  detectedAt: string;
  /** Set when the breach was resolved (task completed or SLA extended) */
  resolvedAt?: string;
}

/** SLA compliance summary */
export interface SlaSummary {
  totalTasksTracked: number;
  onTrack: number;
  warning: number;
  breached: number;
  /** Average resolution time in minutes for completed tasks */
  avgResolutionMinutes?: number;
  /** Policy-level breakdown */
  policyStats: Array<{
    policyId: string;
    policyName: string;
    targetMinutes: number;
    tasksTracked: number;
    onTrack: number;
    warning: number;
    breached: number;
  }>;
}

/** Comprehensive task statistics and analytics */
export interface TaskStats {
  /** Total task count */
  total: number;
  /** Count by status */
  byStatus: Record<TaskStatus, number>;
  /** Count by priority */
  byPriority: Record<TaskPriority, number>;
  /** Tasks created per day (last 7 days) */
  dailyCreated: Array<{ date: string; count: number }>;
  /** Tasks completed per day (last 7 days) */
  dailyCompleted: Array<{ date: string; count: number }>;
  /** Average resolution time in minutes for tasks completed in last 7 days */
  avgResolutionMinutes: number | null;
  /** Median resolution time in minutes for tasks completed in last 7 days */
  medianResolutionMinutes: number | null;
  /** Success rate (done / (done + failed)) as a percentage 0-100 */
  successRate: number | null;
  /** Top 10 tags by task count */
  topTags: Array<{ tag: string; count: number }>;
  /** Tasks currently overdue */
  overdueCount: number;
  /** Timestamp of when stats were computed */
  computedAt: string;
}
