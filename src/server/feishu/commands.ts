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
 *   /stats             — Show task statistics
 *   /search <query>    — Search tasks by text
 *   /overdue           — List overdue tasks
 *   /mine              — List tasks created by the sender
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
    "**/stats** — Show task statistics",
    "**/search <query>** — Search tasks by text",
    "**/overdue** — List overdue tasks",
    "**/mine** — List your tasks",
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
