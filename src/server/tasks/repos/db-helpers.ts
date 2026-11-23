import type { DatabaseSync } from "node:sqlite";
import type {
  Task,
  TaskStatus,
  TaskPriority,
  Attachment,
  TaskTemplate,
  ScheduledTask,
  SlaPolicy,
  SlaBreachLog,
  SlaBreachType,
  Cycle,
  CycleStatus,
  Module,
  ModuleStatus,
  TimeEntry,
  Subtask,
} from "../../../shared/types.js";

export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["picked", "running"],
  picked: ["running"],
  running: ["done", "failed"],
  done: ["pending"],
  failed: ["pending"],
};

export function isValidTransition(current: TaskStatus, next: TaskStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

/** Run `fn` inside a synchronous SQLite transaction with automatic rollback on throw. */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors if connection already rolled back
    }
    throw err;
  }
}

/**
 * Convert a free-text search query into an FTS5 trigram MATCH expression when possible.
 * Returns `null` when the query is shorter than 3 Unicode code points or contains SQL LIKE
 * wildcards (`%`, `_`), signaling callers to fall back to `LIKE`.
 */
export function buildFtsTrigramQuery(q: string): string | null {
  if (!q) return null;
  if (q.includes("%") || q.includes("_")) return null;
  // SQLite FTS5 trigram tokenizer requires at least 3 characters per token
  if (Array.from(q).length < 3) return null;
  const escaped = q.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function parseAttachments(raw: unknown): Attachment[] | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed as Attachment[];
  } catch {
    return undefined;
  }
}

export function parseTags(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed as string[];
  } catch {
    return undefined;
  }
}

export function parsePriorities(raw: unknown): TaskPriority[] | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed as TaskPriority[];
  } catch {
    return undefined;
  }
}

export function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row["id"] as string,
    source: ((row["source"] as string) || "feishu") as Task["source"],
    feishuMessageId: row["feishu_message_id"] as string,
    feishuChatId: row["feishu_chat_id"] as string,
    feishuUserId: row["feishu_user_id"] as string,
    commandText: row["command_text"] as string,
    status: row["status"] as TaskStatus,
    priority: (row["priority"] as TaskPriority) ?? "normal",
    tags: parseTags(row["tags"]),
    attachments: parseAttachments(row["attachments"]),
    assignedDeviceId: (row["assigned_device_id"] as string) ?? undefined,
    dueDate: (row["due_date"] as string) ?? undefined,
    reminderAt: (row["reminder_at"] as string) ?? undefined,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
    pinned: Number(row["pinned"]) === 1,
    archivedAt: (row["archived_at"] as string) ?? undefined,
    resultSummary: (row["result_summary"] as string) ?? undefined,
    resultDetails: (row["result_details"] as string) ?? undefined,
    description: (row["description"] as string) ?? undefined,
    pickedAt: (row["picked_at"] as string) ?? undefined,
    startedAt: (row["started_at"] as string) ?? undefined,
    completedAt: (row["completed_at"] as string) ?? undefined,
    estimatedMinutes: row["estimated_minutes"] != null ? Number(row["estimated_minutes"]) : undefined,
    actualMinutes: row["actual_minutes"] != null ? Number(row["actual_minutes"]) : undefined,
    cycleId: (row["cycle_id"] as string) ?? undefined,
    reopenedCount: row["reopened_count"] != null ? Number(row["reopened_count"]) : undefined,
    moduleId: (row["module_id"] as string) ?? undefined,
  };
}

export function rowToCycle(row: Record<string, unknown>): Cycle {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string) ?? undefined,
    startDate: row["start_date"] as string,
    endDate: row["end_date"] as string,
    status: row["status"] as CycleStatus,
    createdBy: row["created_by"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export function rowToModule(row: Record<string, unknown>): Module {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string) ?? undefined,
    status: row["status"] as ModuleStatus,
    startDate: (row["start_date"] as string) ?? undefined,
    endDate: (row["end_date"] as string) ?? undefined,
    targetCompletionPercent: row["target_completion_percent"] != null ? Number(row["target_completion_percent"]) : undefined,
    createdBy: row["created_by"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

/** Apply variable substitution to a template string. Replaces {var_name} with the corresponding value. */
export function applyTemplateVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_match, varName) => {
    return variables[varName] !== undefined ? variables[varName] : `{${varName}}`;
  });
}

export function rowToTemplate(row: Record<string, unknown>): TaskTemplate {
  const variablesRaw = row["variables"] as string | null;
  let variables: Record<string, string> | undefined;
  if (variablesRaw) {
    try { variables = JSON.parse(variablesRaw); } catch { variables = undefined; }
  }
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string) ?? undefined,
    commandText: row["command_text"] as string,
    priority: (row["priority"] as TaskPriority) ?? "normal",
    tags: parseTags(row["tags"]),
    assignedDeviceId: (row["assigned_device_id"] as string) ?? undefined,
    dueDateOffsetMs: row["due_date_offset_ms"] != null ? Number(row["due_date_offset_ms"]) : undefined,
    reminderOffsetMs: row["reminder_offset_ms"] != null ? Number(row["reminder_offset_ms"]) : undefined,
    createdBy: row["created_by"] as string,
    usageCount: row["usage_count"] != null ? Number(row["usage_count"]) : 0,
    variables,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export function rowToScheduledTask(row: Record<string, unknown>): ScheduledTask {
  return {
    id: row["id"] as string,
    templateId: (row["template_id"] as string) ?? undefined,
    commandText: row["command_text"] as string,
    frequency: row["frequency"] as ScheduledTask["frequency"],
    priority: (row["priority"] as TaskPriority) ?? "normal",
    tags: parseTags(row["tags"]),
    assignedDeviceId: (row["assigned_device_id"] as string) ?? undefined,
    nextRunAt: row["next_run_at"] as string,
    lastRunAt: (row["last_run_at"] as string) ?? undefined,
    lastTaskId: (row["last_task_id"] as string) ?? undefined,
    enabled: Number(row["enabled"]) === 1,
    createdBy: row["created_by"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export function rowToSlaPolicy(row: Record<string, unknown>): SlaPolicy {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string) ?? undefined,
    targetMinutes: row["target_minutes"] as number,
    warningThresholdPercent: row["warning_threshold_percent"] as number,
    matchPriorities: parsePriorities(row["match_priorities"]),
    matchTags: parseTags(row["match_tags"]),
    enabled: Number(row["enabled"]) === 1,
    createdBy: row["created_by"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export function rowToSlaBreachLog(row: Record<string, unknown>): SlaBreachLog {
  return {
    id: row["id"] as number,
    taskId: row["task_id"] as string,
    policyId: row["policy_id"] as string,
    policyName: row["policy_name"] as string,
    breachType: row["breach_type"] as SlaBreachType,
    targetMinutes: row["target_minutes"] as number,
    actualMinutes: row["actual_minutes"] as number,
    detectedAt: row["detected_at"] as string,
    resolvedAt: (row["resolved_at"] as string) ?? undefined,
  };
}

export function rowToTimeEntry(row: Record<string, unknown>): TimeEntry {
  return {
    id: String(row["id"]),
    taskId: row["task_id"] as string,
    startedAt: row["started_at"] as string,
    endedAt: (row["ended_at"] as string) ?? undefined,
    durationMinutes: row["duration_minutes"] as number,
    description: (row["description"] as string) ?? undefined,
    loggedBy: row["logged_by"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export function rowToSubtask(row: Record<string, unknown>): Subtask {
  return {
    id: row["id"] as string,
    parentTaskId: row["parent_task_id"] as string,
    title: row["title"] as string,
    commandText: row["command_text"] as string,
    status: row["status"] as TaskStatus,
    resultSummary: (row["result_summary"] as string) ?? undefined,
    resultDetails: (row["result_details"] as string) ?? undefined,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}
