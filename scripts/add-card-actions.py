#!/usr/bin/env python3
"""Add card action buttons to buildTaskCreatedCard in card-builder.ts"""
import re

with open('src/server/feishu/card-builder.ts', 'r') as f:
    content = f.read()

# 1. Add CardButton and CardActionElement interfaces before CardElement
old_interface = """interface CardElement {
  tag: string;
  text?: { content: string; tag: string };
  content?: string;
  elements?: Array<{ tag: string; content?: string }>;
}"""

new_interface = """/** Card action button element */
interface CardButton {
  tag: "button";
  text: { content: string; tag: "plain_text" };
  type: "primary" | "danger" | "default";
  value: Record<string, string>;
}

interface CardElement {
  tag: string;
  text?: { content: string; tag: string };
  content?: string;
  elements?: Array<{ tag: string; content?: string }>;
  actions?: CardButton[];
}"""

if old_interface in content:
    content = content.replace(old_interface, new_interface, 1)
    print("OK: Added CardButton interface")
else:
    print("WARN: CardElement interface not found")

# 2. Add action buttons to buildTaskCreatedCard - insert before "// Separator" in that function
# Find the Dependencies block end and insert buttons before separator
old_deps_and_sep = """  }

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
      title: { content: "📋 New Task Created", tag: "plain_text" },"""

new_deps_and_sep = """  }

  // Action buttons
  elements.push({
    tag: "action",
    actions: [
      {
        tag: "button",
        text: { content: "👆 Pick Task", tag: "plain_text" },
        type: "primary",
        value: { action: "pick_task", taskId: task.id },
      },
      {
        tag: "button",
        text: { content: "✅ Mark Done", tag: "plain_text" },
        type: "default",
        value: { action: "complete_task", taskId: task.id },
      },
      {
        tag: "button",
        text: { content: "📦 Archive", tag: "plain_text" },
        type: "danger",
        value: { action: "archive_task", taskId: task.id },
      },
    ],
  });

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
      title: { content: "📋 New Task Created", tag: "plain_text" },"""

if old_deps_and_sep in content:
    content = content.replace(old_deps_and_sep, new_deps_and_sep, 1)
    print("OK: Added action buttons to buildTaskCreatedCard")
else:
    print("WARN: buildTaskCreatedCard separator block not found")

with open('src/server/feishu/card-builder.ts', 'w') as f:
    f.write(content)

print("DONE: card-builder.ts updated")
