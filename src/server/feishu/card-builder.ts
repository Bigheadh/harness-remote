/**
 * Feishu Interactive Card Builder
 *
 * Builds Feishu "interactive" message cards (rich format) for task notifications.
 * Cards support markdown, structured fields, color themes, and notes.
 *
 * Feishu card JSON structure:
 * {
 *   config: { wide_screen_mode: true },
 *   header: { title: { content, tag: "plain_text" }, template: "blue" },
 *   elements: [ ... ]
 * }
 *
 * The card object is JSON-serialized into the `content` field of the message body.
 */

import type { Task, TaskPriority, TaskStatus } from "../../shared/types.js";

/** Color themes for Feishu card headers */
type CardTemplate =
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "purple"
  | "indigo"
  | "turquoise"
  | "yellow"
  | "grey"
  | "wathet";

/** Priority display labels and their card color mappings */
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "🔴 Urgent",
  high: "🟠 High",
  normal: "🔵 Normal",
  low: "⚪ Low",
};

/** Status display labels */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "⏳ Pending",
  picked: "👆 Picked",
  running: "⚡ Running",
  done: "✅ Done",
  failed: "❌ Failed",
};

/** Status-to-card-header-color mapping */
export const STATUS_COLORS: Record<TaskStatus, CardTemplate> = {
  pending: "blue",
  picked: "wathet",
  running: "orange",
  done: "green",
  failed: "red",
};

interface CardElement {
  tag: string;
  text?: { content: string; tag: string };
  content?: string;
  elements?: Array<{ tag: string; content?: string }>;
}

export interface FeishuCard {
  config: { wide_screen_mode: boolean };
  header: {
    title: { content: string; tag: "plain_text" };
    template: CardTemplate;
  };
  elements: CardElement[];
}

/** Build a Feishu interactive card for a newly created task */
export function buildTaskCreatedCard(task: Task): FeishuCard {
  const elements: CardElement[] = [];

  // Command text
  elements.push({
    tag: "div",
    text: { content: `**Command:** ${task.commandText}`, tag: "lark_md" },
  });

  // Priority
  elements.push({
    tag: "div",
    text: {
      content: `**Priority:** ${PRIORITY_LABELS[task.priority]}`,
      tag: "lark_md",
    },
  });

  // Tags (if any)
  if (task.tags && task.tags.length > 0) {
    elements.push({
      tag: "div",
      text: {
        content: `**Tags:** ${task.tags.map((t) => `\`${t}\``).join(" ")}`,
        tag: "lark_md",
      },
    });
  }

  // Due date (if any)
  if (task.dueDate) {
    elements.push({
      tag: "div",
      text: {
        content: `**Due Date:** ${task.dueDate}`,
        tag: "lark_md",
      },
    });
  }

  // Dependencies (if any)
  if (task.dependsOn && task.dependsOn.length > 0) {
    elements.push({
      tag: "div",
      text: {
        content: `**Depends On:** ${task.dependsOn.join(", ")}`,
        tag: "lark_md",
      },
    });
  }

  // Separator
  elements.push({ tag: "hr" });

  // Task ID and timestamp
  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `Task ${task.id} · ${new Date(task.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
      },
    ],
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { content: "📋 New Task Created", tag: "plain_text" },
      template: "blue",
    },
    elements,
  };
}

/** Build a Feishu interactive card for a task result report */
export function buildTaskResultCard(
  task: Task,
  success: boolean,
  summary: string,
  details?: string,
): FeishuCard {
  const elements: CardElement[] = [];

  // Status
  elements.push({
    tag: "div",
    text: {
      content: `**Status:** ${success ? "✅ Success" : "❌ Failed"}`,
      tag: "lark_md",
    },
  });

  // Summary
  elements.push({
    tag: "div",
    text: { content: `**Summary:** ${summary}`, tag: "lark_md" },
  });

  // Details (if provided)
  if (details) {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "div",
      text: { content: details, tag: "lark_md" },
    });
  }

  // Processing duration (if available)
  if (task.startedAt && task.completedAt) {
     const durationMs = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
     const durationMin = Math.round(durationMs / 60000);
     const durationText = durationMin >= 60
       ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
       : durationMin >= 1
         ? `${durationMin}m`
         : `${Math.round(durationMs / 1000)}s`;
     elements.push({
       tag: "div",
       text: { content: `**Duration:** ${durationText}`, tag: "lark_md" },
     });
  }

  // Separator
  elements.push({ tag: "hr" });

  // Task ID and timestamp
  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `Task ${task.id} · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
      },
    ],
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      title: {
        content: success ? "✅ Task Completed" : "❌ Task Failed",
        tag: "plain_text",
      },
      template: success ? "green" : "red",
    },
    elements,
  };
}

/** Build a Feishu interactive card for a task status change */
export function buildTaskStatusCard(
  task: Task,
  previousStatus: TaskStatus,
): FeishuCard {
  const elements: CardElement[] = [];

  elements.push({
    tag: "div",
    text: {
      content: `**Status:** ${STATUS_LABELS[previousStatus]} → ${STATUS_LABELS[task.status]}`,
      tag: "lark_md",
    },
  });

  elements.push({
    tag: "div",
    text: { content: `**Command:** ${task.commandText}`, tag: "lark_md" },
  });

  elements.push({
    tag: "div",
    text: {
      content: `**Priority:** ${PRIORITY_LABELS[task.priority]}`,
      tag: "lark_md",
    },
  });

  // Tags (if any)
  if (task.tags && task.tags.length > 0) {
    elements.push({
      tag: "div",
      text: {
        content: `**Tags:** ${task.tags.map((t) => `\`${t}\``).join(" ")}`,
        tag: "lark_md",
      },
    });
  }

  // Due date (if any)
  if (task.dueDate) {
    elements.push({
      tag: "div",
      text: {
        content: `**Due Date:** ${task.dueDate}`,
        tag: "lark_md",
      },
    });
  }

  // Description (if any)
  if (task.description) {
    elements.push({
      tag: "div",
      text: {
        content: `**Description:** ${task.description}`,
        tag: "lark_md",
      },
    });
  }

  elements.push({ tag: "hr" });

  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `Task ${task.id} · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
      },
    ],
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { content: "🔄 Task Status Updated", tag: "plain_text" },
      template: STATUS_COLORS[task.status],
    },
    elements,
  };
}

/** Build a Feishu interactive card from a custom title and markdown body */
export function buildCustomCard(
  title: string,
  markdownBody: string,
  template: CardTemplate = "blue",
): FeishuCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { content: title, tag: "plain_text" },
      template,
    },
    elements: [
      {
        tag: "div",
        text: { content: markdownBody, tag: "lark_md" },
      },
    ],
  };
}

/** Serialize a FeishuCard to JSON string for the `content` field */
export function serializeCard(card: FeishuCard): string {
  return JSON.stringify(card);
}
