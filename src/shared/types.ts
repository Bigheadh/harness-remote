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
  | "task.comment_deleted";

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
