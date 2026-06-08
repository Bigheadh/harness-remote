/**
 * Feishu Bot Interactive Commands
 *
 * When a Feishu message starts with "/", it's treated as a command
 * instead of creating a task. Commands let users query and manage
 * tasks directly from Feishu without needing Codex CLI.
 *
 * Supported commands:
 *   /help              — Show available commands
 *   /list [status]     — List tasks (default: pending)
 *   /status <id>       — Show task details
 *   /cancel <id>       — Cancel a pending task
 *   /assign <id> <device> — Assign task to a device
 *   /priority <id> <level> — Change task priority (low/normal/high/urgent)
 *   /due <id> <date>   — Set task due date (YYYY-MM-DD)
 *   /tag <id> <tag>    — Add tag(s) to a task (comma-separated)
 *   /stats             — Show task statistics
 *   /search <query>    — Search tasks by text
 *   /overdue           — List overdue tasks
 *   /mine              — List tasks created by the sender
 *   /digest            — Daily task summary (pending, overdue, due today, completed today)
 *   /watch <id>        — Subscribe to task status updates
 *   /unwatch <id>      — Unsubscribe from task status updates
 */

import type { Task, TaskStatus } from "../../shared/types.js";
import type { TaskStore } from "../tasks/store.js";
import type { FeishuReplyClient } from "./client.js";
import type { FeishuCard } from "./card-builder.js";
import {
  buildCustomCard,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from "./card-builder.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

/** Parsed command structure */
export interface ParsedCommand {
  /** The command name without the leading / (lowercased) */
  command: string;
  /** Everything after the command name, trimmed */
  args: string;
}

/** Parse a slash command from message text */
export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  // Split on first whitespace to get command and args
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return { command: trimmed.slice(1).toLowerCase(), args: "" };
  }
  return {
    command: trimmed.slice(1, spaceIdx).toLowerCase(),
    args: trimmed.slice(spaceIdx + 1).trim(),
  };
}

/** Check if text is a command (starts with /) */
export function isCommand(text: string): boolean {
  return text.trim().startsWith("/");
}

/** Execute a parsed command and send the response */
export async function executeCommand(
  cmd: ParsedCommand,
  userId: string,
  chatId: string,
  messageId: string,
  store: TaskStore,
  feishuClient?: FeishuReplyClient,
): Promise<boolean> {
  if (!feishuClient) {
    log.warn({}, "No Feishu client configured, cannot reply to commands");
    return false;
  }

  try {
    let card: FeishuCard;

    switch (cmd.command) {
      case "help":
        card = buildHelpCard();
        break;
      case "list":
        card = await buildListCard(cmd.args, store);
        break;
      case "status":
        card = await buildStatusCard(cmd.args, store);
        break;
      case "cancel":
        card = await buildCancelCard(cmd.args, userId, store);
        break;
      case "stats":
        card = await buildStatsCard(store);
        break;
      case "search":
        card = await buildSearchCard(cmd.args, store);
        break;
      case "overdue":
        card = await buildOverdueCard(store);
        break;
      case "mine":
        card = await buildMineCard(userId, store);
        break;
      case "digest":
        card = await buildDigestCard(userId, store);
        break;
      case "assign":
        card = await buildAssignCard(cmd.args, store);
        break;
      case "priority":
        card = await buildPriorityCard(cmd.args, store);
        break;
      case "due":
        card = await buildDueCard(cmd.args, store);
        break;
      case "tag":
        card = await buildTagCard(cmd.args, store);
        break;
      case "watch":
        card = await buildWatchCard(cmd.args, userId, store);
        break;
      case "unwatch":
        card = await buildUnwatchCard(cmd.args, userId, store);
        break;
      default:
        card = buildCustomCard(
          "Unknown Command",
          "Command /" + cmd.command + " is not recognized.\n\nType **/help** to see available commands.",
          "red",
        );
        break;
    }

    await feishuClient.sendCardMessage({ messageId, card });
    return true;
  } catch (err) {
    log.error(
      { command: cmd.command, err: err instanceof Error ? err.message : String(err) },
      "Failed to execute Feishu command",
    );
    try {
      const errorCard = buildCustomCard(
        "Command Error",
        "Failed to execute /" + cmd.command + ": " + (err instanceof Error ? err.message : String(err)),
        "red",
      );
      await feishuClient.sendCardMessage({ messageId, card: errorCard });
    } catch {
      // Best effort
    }
    return false;
  }
}

// ─── Card Builders ──────────────────────────────────────────────

function buildHelpCard(): FeishuCard {
  const lines = [
    "**/help** — Show this help message",
    "**/list [status]** — List tasks (pending/picked/running/done/failed)",
    "**/status <id>** — Show task details",
    "**/cancel <id>** — Cancel a pending task",
    "**/assign <id> <device>** — Assign task to a device",
    "**/priority <id> <level>** — Change priority (low/normal/high/urgent)",
    "**/due <id> <date>** — Set due date (YYYY-MM-DD)",
    "**/tag <id> <tag>** — Add tag(s) to a task (comma-separated)",
    "**/watch <id>** — Subscribe to task status updates",
    "**/unwatch <id>** — Unsubscribe from task updates",
    "**/stats** — Show task statistics",
    "**/search <query>** — Search tasks by text",
    "**/overdue** — List overdue tasks",
    "**/mine** — List your tasks",
    "**/digest** — Daily task summary",
    "",
    "_Tip: Prefix any other message with text to create a new task._",
    "_Priority: #priority:urgent #priority:high !urgent !high_",
    "_Tags: #tag:bugfix #tag:feature_",
    "_Due date: #due:2026-12-31_",
  ];

  return buildCustomCard("Bot Commands", lines.join("\n"), "blue");
}

async function buildListCard(
  args: string,
  store: TaskStore,
): Promise<FeishuCard> {
  const statusFilter = args.trim().toLowerCase() || "pending";
  const validStatuses = ["pending", "picked", "running", "done", "failed"];

  if (!validStatuses.includes(statusFilter)) {
    return buildCustomCard(
      "Invalid Status",
      "Status must be one of: " + validStatuses.join(", "),
      "red",
    );
  }

  const tasks = await store.listTasks(statusFilter as TaskStatus, 10);

  if (tasks.length === 0) {
    return buildCustomCard(
      STATUS_LABELS[statusFilter as TaskStatus] + " Tasks",
      "No tasks found.",
      "blue",
    );
  }

  const lines: string[] = [];
  for (const task of tasks) {
    const truncated =
      task.commandText.length > 60
        ? task.commandText.slice(0, 57) + "..."
        : task.commandText;
    const priority = PRIORITY_LABELS[task.priority];
    const due = task.dueDate ? " · due " + task.dueDate : "";
    lines.push(
      "* " + task.id.slice(0, 16) + "... " + priority + " " + truncated + due,
    );
  }

  lines.push("", "_Showing up to 10 of status **" + statusFilter + "**._");

  return buildCustomCard(
    STATUS_LABELS[statusFilter as TaskStatus] + " Tasks (" + tasks.length + ")",
    lines.join("\n"),
    "blue",
  );
}

async function buildStatusCard(
  args: string,
  store: TaskStore,
): Promise<FeishuCard> {
  const taskId = args.trim();
  if (!taskId) {
    return buildCustomCard(
      "Missing Task ID",
      "Usage: /status <task-id>",
      "red",
    );
  }

  // Allow partial ID match
  let task: Task | undefined;
  try {
    task = await store.getTask(taskId);
  } catch {
    // Task not found by exact ID, try partial match
  }

  if (!task) {
    // Try searching by partial ID
    const all = await store.listTasks(undefined, 100);
    task = all.find((t) => t.id.startsWith(taskId));
  }

  if (!task) {
    return buildCustomCard(
      "Task Not Found",
      "No task found matching " + taskId + ".",
      "red",
    );
  }

  const lines: string[] = [
    "**Status:** " + STATUS_LABELS[task.status],
    "**Priority:** " + PRIORITY_LABELS[task.priority],
    "**Command:** " + task.commandText,
  ];

  if (task.description) {
    lines.push("**Description:** " + task.description);
  }
  if (task.tags && task.tags.length > 0) {
    lines.push("**Tags:** " + task.tags.map((t) => "`" + t + "`").join(" "));
  }
  if (task.dueDate) {
    lines.push("**Due Date:** " + task.dueDate);
  }
  if (task.assignedDeviceId) {
    lines.push("**Assigned Device:** " + task.assignedDeviceId);
  }
  if (task.resultSummary) {
    lines.push("**Result:** " + task.resultSummary);
  }

  lines.push(
    "",
    "_Created: " + new Date(task.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) + "_",
  );

  const color =
    task.status === "done"
      ? "green"
      : task.status === "failed"
        ? "red"
        : "blue";

  return buildCustomCard("Task " + task.id, lines.join("\n"), color);
}

async function buildCancelCard(
  args: string,
  userId: string,
  store: TaskStore,
): Promise<FeishuCard> {
  const taskId = args.trim();
  if (!taskId) {
    return buildCustomCard(
      "Missing Task ID",
      "Usage: /cancel <task-id>",
      "red",
    );
  }

  let task: Task | undefined;
  try {
    task = await store.getTask(taskId);
  } catch {
    // try partial match
  }

  if (!task) {
    const all = await store.listTasks(undefined, 100);
    task = all.find((t) => t.id.startsWith(taskId));
  }

  if (!task) {
    return buildCustomCard(
      "Task Not Found",
      "No task found matching " + taskId + ".",
      "red",
    );
  }

  if (task.status !== "pending") {
    return buildCustomCard(
      "Cannot Cancel",
      "Task is **" + task.status + "**, only **pending** tasks can be cancelled.",
      "orange",
    );
  }

  // Mark as failed with cancellation note
  await store.updateTaskStatus(task.id, "failed");
  await store.saveTaskResult(task.id, false, "Cancelled by user via Feishu command");

  return buildCustomCard(
    "Task Cancelled",
    "Task **" + task.id + "** has been cancelled.\n\n**Command:** " + task.commandText,
    "green",
  );
}

async function buildStatsCard(store: TaskStore): Promise<FeishuCard> {
  const stats = await store.getTaskStats();

  const lines: string[] = [
    "**Total:** " + stats.total,
    "**Pending:** " + stats.byStatus.pending,
    "**Picked:** " + stats.byStatus.picked,
    "**Running:** " + stats.byStatus.running,
    "**Done:** " + stats.byStatus.done,
    "**Failed:** " + stats.byStatus.failed,
  ];

  if (stats.total > 0 && stats.successRate !== null) {
    lines.push("", "**Completion Rate:** " + Math.round(stats.successRate) + "%");
  }

  if (stats.overdueCount > 0) {
    lines.push("**Overdue:** " + stats.overdueCount);
  }

  if (stats.avgResolutionMinutes !== null) {
    const avgMin = Math.round(stats.avgResolutionMinutes);
    const avgText = avgMin >= 60
      ? Math.floor(avgMin / 60) + "h " + (avgMin % 60) + "m"
      : avgMin + "m";
    lines.push("", "**Avg Resolution:** " + avgText);
  }

  return buildCustomCard("Task Statistics", lines.join("\n"), "purple");
}

async function buildSearchCard(
  args: string,
  store: TaskStore,
): Promise<FeishuCard> {
  const query = args.trim();
  if (!query) {
    return buildCustomCard(
      "Missing Query",
      "Usage: /search <query>",
      "red",
    );
  }

  const tasks = await store.searchTasks({ q: query, limit: 10 });

  if (tasks.length === 0) {
    return buildCustomCard(
      "Search: " + query,
      "No tasks found matching " + query + ".",
      "blue",
    );
  }

  const lines: string[] = [];
  for (const task of tasks) {
    const truncated =
      task.commandText.length > 60
        ? task.commandText.slice(0, 57) + "..."
        : task.commandText;
    lines.push(
      "* " + task.id.slice(0, 16) + "... " + STATUS_LABELS[task.status] + " " + truncated,
    );
  }

  lines.push("", "_Found " + tasks.length + " matching tasks._");

  return buildCustomCard(
    "Search: " + query,
    lines.join("\n"),
    "blue",
  );
}

async function buildOverdueCard(store: TaskStore): Promise<FeishuCard> {
  const overdue = await store.listOverdueTasks();

  if (overdue.length === 0) {
    return buildCustomCard(
      "Overdue Tasks",
      "No overdue tasks!",
      "green",
    );
  }

  const lines: string[] = [];
  for (const task of overdue.slice(0, 10)) {
    const truncated =
      task.commandText.length > 50
        ? task.commandText.slice(0, 47) + "..."
        : task.commandText;
    lines.push(
      "* " + task.id.slice(0, 16) + "... " + PRIORITY_LABELS[task.priority] + " " + truncated,
    );
    if (task.dueDate) {
      lines.push("  _Due: " + task.dueDate + "_");
    }
  }

  if (overdue.length > 10) {
    lines.push("", "_...and " + (overdue.length - 10) + " more._");
  }

  return buildCustomCard(
    "Overdue Tasks (" + overdue.length + ")",
    lines.join("\n"),
    "red",
  );
}

async function buildMineCard(
  userId: string,
  store: TaskStore,
): Promise<FeishuCard> {
  const tasks = await store.listTasksByUser(userId, 10);

  if (tasks.length === 0) {
    return buildCustomCard(
      "My Tasks",
      "You have no tasks.",
      "blue",
    );
  }

  const lines: string[] = [];
  for (const task of tasks) {
    const truncated =
      task.commandText.length > 60
        ? task.commandText.slice(0, 57) + "..."
        : task.commandText;
    lines.push(
      "* " + task.id.slice(0, 16) + "... " + STATUS_LABELS[task.status] + " " + truncated,
    );
  }

  lines.push("", "_Showing up to 10 tasks._");

  return buildCustomCard(
    "My Tasks (" + tasks.length + ")",
    lines.join("\n"),
    "indigo",
  );
}

async function buildDigestCard(
  userId: string,
  store: TaskStore,
): Promise<FeishuCard> {
  // Gather data in parallel
  const [allUserTasks, overdueTasks] = await Promise.all([
    store.listTasksByUser(userId, 50),
    store.listOverdueTasks(),
  ]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

  // Filter user's tasks into digest categories
  const pendingTasks = allUserTasks.filter((t) => t.status === "pending");
  const pickedTasks = allUserTasks.filter((t) => t.status === "picked");
  const runningTasks = allUserTasks.filter((t) => t.status === "running");
  const doneToday = allUserTasks.filter(
    (t) => t.status === "done" && t.completedAt && t.completedAt >= todayStart && t.completedAt <= todayEnd,
  );
  const dueToday = allUserTasks.filter(
    (t) => t.dueDate && t.dueDate >= todayStart.slice(0, 10) && t.dueDate <= todayEnd.slice(0, 10) && t.status !== "done" && t.status !== "failed",
  );
  const userOverdue = overdueTasks.filter((t) => t.feishuUserId === userId);

  const inProgress = [...pickedTasks, ...runningTasks];

  // Build summary line
  const summaryParts: string[] = [];
  summaryParts.push("**Pending:** " + pendingTasks.length);
  summaryParts.push("**In Progress:** " + inProgress.length);
  if (userOverdue.length > 0) {
    summaryParts.push("**Overdue:** ⚠️ " + userOverdue.length);
  }
  if (dueToday.length > 0) {
    summaryParts.push("**Due Today:** 📅 " + dueToday.length);
  }
  summaryParts.push("**Done Today:** ✅ " + doneToday.length);

  const elements: import("./card-builder.js").CardElement[] = [];

  // Summary section
  elements.push({
    tag: "div",
    text: { content: summaryParts.join("  |  "), tag: "lark_md" },
  });

  elements.push({ tag: "hr" });

  // Overdue tasks (high priority)
  if (userOverdue.length > 0) {
    const overdueLines: string[] = ["**⚠️ Overdue Tasks:**"];
    for (const task of userOverdue.slice(0, 5)) {
      const truncated = task.commandText.length > 50
        ? task.commandText.slice(0, 47) + "..."
        : task.commandText;
      overdueLines.push(
        "* `" + task.id.slice(0, 12) + "` " + PRIORITY_LABELS[task.priority] + " " + truncated,
      );
    }
    if (userOverdue.length > 5) {
      overdueLines.push("_...and " + (userOverdue.length - 5) + " more._");
    }
    elements.push({
      tag: "div",
      text: { content: overdueLines.join("\n"), tag: "lark_md" },
    });
  }

  // Due today tasks
  if (dueToday.length > 0) {
    const dueLines: string[] = ["**📅 Due Today:**"];
    for (const task of dueToday.slice(0, 5)) {
      const truncated = task.commandText.length > 50
        ? task.commandText.slice(0, 47) + "..."
        : task.commandText;
      dueLines.push(
        "* `" + task.id.slice(0, 12) + "` " + PRIORITY_LABELS[task.priority] + " " + truncated,
      );
    }
    if (dueToday.length > 5) {
      dueLines.push("_...and " + (dueToday.length - 5) + " more._");
    }
    elements.push({
      tag: "div",
      text: { content: dueLines.join("\n"), tag: "lark_md" },
    });
  }

  // In progress tasks
  if (inProgress.length > 0) {
    const progLines: string[] = ["**🔄 In Progress:**"];
    for (const task of inProgress.slice(0, 5)) {
      const truncated = task.commandText.length > 50
        ? task.commandText.slice(0, 47) + "..."
        : task.commandText;
      progLines.push(
        "* `" + task.id.slice(0, 12) + "` " + STATUS_LABELS[task.status] + " " + truncated,
      );
    }
    elements.push({
      tag: "div",
      text: { content: progLines.join("\n"), tag: "lark_md" },
    });
  }

  // Recently completed
  if (doneToday.length > 0) {
    const doneLines: string[] = ["**✅ Completed Today:**"];
    for (const task of doneToday.slice(0, 5)) {
      const truncated = task.commandText.length > 50
        ? task.commandText.slice(0, 47) + "..."
        : task.commandText;
      doneLines.push("* `" + task.id.slice(0, 12) + "` " + truncated);
    }
    elements.push({
      tag: "div",
      text: { content: doneLines.join("\n"), tag: "lark_md" },
    });
  }

  // Empty state
  if (elements.length === 1) {
    // Only the summary section exists
    elements.push({
      tag: "div",
      text: {
        content: "No active tasks. You're all caught up! 🎉",
        tag: "lark_md",
      },
    });
  }

  // Note
  elements.push({ tag: "hr" });
  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: "Generated at " + now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      },
    ],
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { content: "📊 Task Digest", tag: "plain_text" },
      template: userOverdue.length > 0 ? "red" : "blue",
    },
    elements,
  };
}

// ─── Task Management Commands ──────────────────────────────────

async function buildAssignCard(args: string, store: TaskStore): Promise<FeishuCard> {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return buildCustomCard(
      "Missing Arguments",
      "Usage: /assign <task-id> <device-id>\n\nExample: /assign abc123 device_01",
      "red",
    );
  }

  const [taskId, deviceId] = parts;

  let task: Task | undefined;
  try {
    task = await store.getTask(taskId);
  } catch {
    // try partial match
  }

  if (!task) {
    const all = await store.listTasks(undefined, 100);
    task = all.find((t) => t.id.startsWith(taskId));
  }

  if (!task) {
    return buildCustomCard(
      "Task Not Found",
      "No task found matching " + taskId + ".",
      "red",
    );
  }

  try {
    const updated = await store.assignTask(task.id, deviceId);
    return buildCustomCard(
      "Task Assigned",
      "**Task:** `" + updated.id.slice(0, 16) + "...` " + updated.commandText.slice(0, 50) +
      (updated.commandText.length > 50 ? "..." : "") +
      "\n**Device:** `" + deviceId + "`" +
      "\n**Status:** " + STATUS_LABELS[updated.status],
      "green",
    );
  } catch (e) {
    return buildCustomCard(
      "Assignment Failed",
      "Failed to assign task: " + (e instanceof Error ? e.message : String(e)),
      "red",
    );
  }
}

async function buildPriorityCard(args: string, store: TaskStore): Promise<FeishuCard> {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return buildCustomCard(
      "Missing Arguments",
      "Usage: /priority <task-id> <level>\n\nLevels: low, normal, high, urgent\nExample: /priority abc123 high",
      "red",
    );
  }

  const [taskId, priorityArg] = parts;
  const priority = priorityArg.toLowerCase();

  if (!["low", "normal", "high", "urgent"].includes(priority)) {
    return buildCustomCard(
      "Invalid Priority",
      "Priority must be one of: low, normal, high, urgent\nGot: " + priorityArg,
      "red",
    );
  }

  let task: Task | undefined;
  try {
    task = await store.getTask(taskId);
  } catch {
    // try partial match
  }

  if (!task) {
    const all = await store.listTasks(undefined, 100);
    task = all.find((t) => t.id.startsWith(taskId));
  }

  if (!task) {
    return buildCustomCard(
      "Task Not Found",
      "No task found matching " + taskId + ".",
      "red",
    );
  }

  try {
    const updated = await store.setTaskPriority(task.id, priority as import("../../shared/types.js").TaskPriority);
    return buildCustomCard(
      "Priority Updated",
      "**Task:** `" + updated.id.slice(0, 16) + "...` " + updated.commandText.slice(0, 50) +
      (updated.commandText.length > 50 ? "..." : "") +
      "\n**Priority:** " + PRIORITY_LABELS[updated.priority] +
      "\n**Status:** " + STATUS_LABELS[updated.status],
      "green",
    );
  } catch (e) {
    return buildCustomCard(
      "Priority Update Failed",
      "Failed to update priority: " + (e instanceof Error ? e.message : String(e)),
      "red",
    );
  }
}

async function buildDueCard(args: string, store: TaskStore): Promise<FeishuCard> {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return buildCustomCard(
      "Missing Arguments",
      "Usage: /due <task-id> <date>\n\nDate format: YYYY-MM-DD\nUse 'clear' to remove due date\nExample: /due abc123 2026-12-31",
      "red",
    );
  }

  const [taskId, dateArg] = parts;
  const dueDate = dateArg.toLowerCase() === "clear" ? null : dateArg;

  if (dueDate && isNaN(Date.parse(dueDate))) {
    return buildCustomCard(
      "Invalid Date",
      "Date must be in YYYY-MM-DD format.\nGot: " + dateArg,
      "red",
    );
  }

  let task: Task | undefined;
  try {
    task = await store.getTask(taskId);
  } catch {
    // try partial match
  }

  if (!task) {
    const all = await store.listTasks(undefined, 100);
    task = all.find((t) => t.id.startsWith(taskId));
  }

  if (!task) {
    return buildCustomCard(
      "Task Not Found",
      "No task found matching " + taskId + ".",
      "red",
    );
  }

  try {
    const updated = await store.setTaskDueDate(task.id, dueDate);
    const dueDisplay = updated.dueDate
      ? "**Due Date:** " + updated.dueDate
      : "**Due Date:** (cleared)";
    return buildCustomCard(
      "Due Date Updated",
      "**Task:** `" + updated.id.slice(0, 16) + "...` " + updated.commandText.slice(0, 50) +
      (updated.commandText.length > 50 ? "..." : "") +
      "\n" + dueDisplay,
      "green",
    );
  } catch (e) {
    return buildCustomCard(
      "Due Date Update Failed",
      "Failed to update due date: " + (e instanceof Error ? e.message : String(e)),
      "red",
    );
  }
}

async function buildTagCard(args: string, store: TaskStore): Promise<FeishuCard> {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return buildCustomCard(
      "Missing Arguments",
      "Usage: /tag <task-id> <tag1>[,tag2,...]\n\nTags are comma-separated.\nExample: /tag abc123 bugfix,urgent",
      "red",
    );
  }

  const taskId = parts[0];
  const tagsStr = parts.slice(1).join(" ");
  const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);

  if (tags.length === 0) {
    return buildCustomCard(
      "No Tags Provided",
      "Please provide at least one tag.\nUsage: /tag <task-id> <tag1>[,tag2,...]",
      "red",
    );
  }

  let task: Task | undefined;
  try {
    task = await store.getTask(taskId);
  } catch {
    // try partial match
  }

  if (!task) {
    const all = await store.listTasks(undefined, 100);
    task = all.find((t) => t.id.startsWith(taskId));
  }

  if (!task) {
    return buildCustomCard(
      "Task Not Found",
      "No task found matching " + taskId + ".",
      "red",
    );
  }

  try {
    const updated = await store.addTags(task.id, tags);
    const tagDisplay = updated.tags && updated.tags.length > 0
      ? updated.tags.map((t) => "`" + t + "`").join(" ")
      : "(none)";
    return buildCustomCard(
      "Tags Added",
      "**Task:** `" + updated.id.slice(0, 16) + "...` " + updated.commandText.slice(0, 50) +
      (updated.commandText.length > 50 ? "..." : "") +
      "\n**Tags:** " + tagDisplay,
      "green",
    );
  } catch (e) {
    return buildCustomCard(
      "Tag Update Failed",
      "Failed to add tags: " + (e instanceof Error ? e.message : String(e)),
      "red",
    );
  }
}

async function buildWatchCard(
  args: string,
  userId: string,
  store: TaskStore,
): Promise<FeishuCard> {
  const taskId = args.trim();
  if (!taskId) {
    return buildCustomCard(
      "Missing Task ID",
      "Usage: /watch <task-id>",
      "red",
    );
  }

  let task: Task | undefined;
  try {
    task = await store.getTask(taskId);
  } catch {
    // try partial match
  }

  if (!task) {
    const all = await store.listTasks(undefined, 100);
    task = all.find((t) => t.id.startsWith(taskId));
  }

  if (!task) {
    return buildCustomCard(
      "Task Not Found",
      "No task found matching " + taskId + ".",
      "red",
    );
  }

  try {
    const alreadyWatching = await store.isWatching(task.id, userId);
    if (alreadyWatching) {
      return buildCustomCard(
        "Already Watching",
        "**Task:** `" + task.id.slice(0, 16) + "...` " + task.commandText.slice(0, 50) +
        (task.commandText.length > 50 ? "..." : "") +
        "\n\nYou are already watching this task. You will be notified of status changes.",
        "blue",
      );
    }

    await store.addWatcher(task.id, userId);
    return buildCustomCard(
      "Now Watching",
      "**Task:** `" + task.id.slice(0, 16) + "...` " + task.commandText.slice(0, 50) +
      (task.commandText.length > 50 ? "..." : "") +
      "\n**Status:** " + STATUS_LABELS[task.status] +
      "\n\nYou will be notified when this task's status changes.",
      "green",
    );
  } catch (e) {
    return buildCustomCard(
      "Watch Failed",
      "Failed to watch task: " + (e instanceof Error ? e.message : String(e)),
      "red",
    );
  }
}

async function buildUnwatchCard(
  args: string,
  userId: string,
  store: TaskStore,
): Promise<FeishuCard> {
  const taskId = args.trim();
  if (!taskId) {
    return buildCustomCard(
      "Missing Task ID",
      "Usage: /unwatch <task-id>",
      "red",
    );
  }

  let task: Task | undefined;
  try {
    task = await store.getTask(taskId);
  } catch {
    // try partial match
  }

  if (!task) {
    const all = await store.listTasks(undefined, 100);
    task = all.find((t) => t.id.startsWith(taskId));
  }

  if (!task) {
    return buildCustomCard(
      "Task Not Found",
      "No task found matching " + taskId + ".",
      "red",
    );
  }

  try {
    const wasWatching = await store.isWatching(task.id, userId);
    if (!wasWatching) {
      return buildCustomCard(
        "Not Watching",
        "**Task:** `" + task.id.slice(0, 16) + "...` " + task.commandText.slice(0, 50) +
        (task.commandText.length > 50 ? "..." : "") +
        "\n\nYou are not currently watching this task.",
        "blue",
      );
    }

    await store.removeWatcher(task.id, userId);
    return buildCustomCard(
      "Unwatched",
      "**Task:** `" + task.id.slice(0, 16) + "...` " + task.commandText.slice(0, 50) +
      (task.commandText.length > 50 ? "..." : "") +
      "\n\nYou will no longer receive status update notifications for this task.",
      "green",
    );
  } catch (e) {
    return buildCustomCard(
      "Unwatch Failed",
      "Failed to unwatch task: " + (e instanceof Error ? e.message : String(e)),
      "red",
    );
  }
}
