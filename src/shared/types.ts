export type TaskStatus = "pending" | "picked" | "running" | "done" | "failed";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

/** A lock on a task preventing concurrent processing */
export interface TaskLock {
  taskId: string;
  lockedBy: string;
  lockedAt: string;
  expiresAt: string;
}

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

export type TaskSource = "feishu" | "web" | "mcp";

export interface Task {
  id: string;
  source: TaskSource;
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
  pinned?: boolean;
  /** ISO 8601 timestamp when the task was archived (soft-deleted). null = not archived */
  archivedAt?: string;
  resultSummary?: string;
  resultDetails?: string;
  /** ISO 8601 timestamp when the task was first picked (moved from pending) */
  pickedAt?: string;
  /** ISO 8601 timestamp when the task started running */
  startedAt?: string;
  /** Structured description beyond the raw command text */
  description?: string;
  /** ISO 8601 timestamp when the task reached a terminal state (done/failed) */
  completedAt?: string;
}

/** A subtask — an independently trackable child task */
export interface Subtask {
  id: string;
  parentTaskId: string;
  title: string;
  commandText: string;
  status: TaskStatus;
  resultSummary?: string;
  resultDetails?: string;
  createdAt: string;
  updatedAt: string;
}

/** A node in the dependency tree */
export interface DependencyTreeNode {
  taskId: string;
  status: TaskStatus;
  commandText: string;
  /** Children in the appropriate direction (upstream: prerequisites, downstream: dependents) */
  children: DependencyTreeNode[];
}

/** Full dependency graph for a task */
export interface DependencyGraph {
  /** The root task */
  taskId: string;
  status: TaskStatus;
  commandText: string;
  /** Tasks that must complete before this task (recursively) */
  upstream: DependencyTreeNode[];
  /** Tasks that wait on this task (recursively) */
  downstream: DependencyTreeNode[];
  /** Maximum depth of the upstream tree */
  maxUpstreamDepth: number;
  /** Maximum depth of the downstream tree */
  maxDownstreamDepth: number;
  /** Total number of unique nodes in the graph (including root) */
  totalNodes: number;
  /** Flat edge list for graph visualization: from → to means "from depends on to" */
  edges: Array<{ from: string; to: string }>;
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
  | "event.command"
  | "feishu.reply_sent"
  | "feishu.reply_failed"
  | "cleanup.processed_events"
  | "task.comment_added"
  | "task.comment_deleted"
  | "task.dependencies_set"
  | "api_key.created"
  | "api_key.rotated"
  | "api_key.revoked"
  | "task.forwarded"
  | "task.note_added"
  | "task.note_deleted"
  | "task.subtask_created"
  | "task.subtask_status_changed"
  | "task.subtask_result_reported"
  | "task.subtask_deleted"
  | "task.priority_escalated";

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

/** An internal note on a task — NOT shared back to the Feishu requester */
export interface TaskNote {
  id: number;
  taskId: string;
  author: string;
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
  /** Number of delivery attempts made so far (including this one) */
  retryCount: number;
}

/** Pending retry entry — stored in DB so retries survive server restarts */
export interface PendingRetry {
  id: number;
  webhookId: string;
  event: WebhookEvent;
  url: string;
  body: string;
  signature: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: string;
  createdAt: string;
  lastError?: string;
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

/** A single item in a task's activity feed — chronological timeline of all events */
export interface ActivityFeedItem {
  /** Event type: 'task.created', 'task.status_changed', 'task.result_reported', 'comment.added', 'note.added', 'subtask.created', etc. */
  type: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Who performed the action */
  actor?: string;
  /** Actor type: 'feishu', 'device', 'api', 'system' */
  actorType?: string;
  /** Human-readable description of the event */
  summary: string;
  /** Additional context about the event */
  details?: Record<string, unknown>;
}

/** Comprehensive task statistics and analytics */
export type TimeSeriesInterval = "hour" | "day" | "week" | "month";
export type TimeSeriesMetric = "created" | "completed" | "resolution_time";

export interface TimeSeriesDataPoint {
  /** ISO-formatted timestamp for this bucket */
  timestamp: string;
  /** Count for count-based metrics, or null if no data in bucket */
  count: number;
  /** Average resolution time in minutes (only for resolution_time metric) */
  avgResolutionMinutes?: number;
  /** Median resolution time in minutes (only for resolution_time metric) */
  medianResolutionMinutes?: number;
  /** Count by status within this bucket (only for status breakdown, optional) */
  byStatus?: Record<TaskStatus, number>;
}

export interface TimeSeriesResult {
  /** The interval used */
  interval: TimeSeriesInterval;
  /** The metric queried */
  metric: TimeSeriesMetric;
  /** Requested from timestamp */
  from: string;
  /** Requested to timestamp */
  to: string;
  /** Array of data points, one per time bucket */
  data: TimeSeriesDataPoint[];
}

/** A single raw API request record for usage analytics */
export interface ApiUsageEntry {
  id: number;
  /** Caller identity: "user:<id>", "device:<id>", "token:<hash>", "ip:<addr>" */
  callerId: string;
  method: string;
  /** Normalized path (IDs replaced with :id) */
  path: string;
  statusCode: number;
  /** Request duration in milliseconds */
  durationMs: number;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/** Aggregated API usage stats for a single caller */
export interface ApiUsageCallerStats {
  callerId: string;
  totalRequests: number;
  errorRequests: number;
  /** Error rate as a percentage 0-100 */
  errorRate: number;
  /** Average response time in ms */
  avgDurationMs: number;
  /** Median response time in ms */
  medianDurationMs: number;
  /** P95 response time in ms */
  p95DurationMs: number;
  /** Breakdown by status code */
  byStatus: Record<number, number>;
  /** Breakdown by method */
  byMethod: Record<string, number>;
  /** Breakdown by path (top 10) */
  byPath: Array<{ path: string; count: number; avgDurationMs: number }>;
  /** Most recent request timestamp */
  lastRequestAt: string;
}

/** API usage analytics summary */
export interface ApiUsageStats {
  /** Total tracked requests since server start */
  totalRequests: number;
  /** Time range of tracked data */
  from: string;
  to: string;
  /** Per-caller breakdown */
  callers: ApiUsageCallerStats[];
  /** Top 10 slowest endpoints */
  slowestEndpoints: Array<{ method: string; path: string; avgDurationMs: number; count: number }>;
}

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

/** A single column in the Kanban board */
export interface KanbanColumn {
  status: TaskStatus;
  label: string;
  count: number;
  tasks: Task[];
}

/** Kanban board view — tasks grouped by status */
export interface KanbanBoard {
  columns: KanbanColumn[];
  totalTasks: number;
}
