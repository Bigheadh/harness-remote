# Phase 59: Feishu Card Action Callbacks

## Overview

| Item | Detail |
|------|--------|
| Date | 2026-06-07 |
| Phase | 59 |
| Feature | Feishu Card Action Callbacks |
| Files Modified | 3 |
| Lines Added | ~170 |
| Lines Removed | 1 |

## Per-File Changes

### 1. `src/server/feishu/card-builder.ts`

**Change 1: Added CardButton interface**

```typescript
// BEFORE: No button types
interface CardElement {
  tag: string;
  text?: { content: string; tag: string };
  content?: string;
  elements?: Array<{ tag: string; content?: string }>;
}

// AFTER: Added CardButton and actions support
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
}
```

**Reason**: Feishu interactive cards support action buttons. Need typed interfaces for button elements.

**Change 2: Added action buttons to buildTaskCreatedCard**

```typescript
// BEFORE: Card ends with separator + note
elements.push({ tag: "hr" });
elements.push({ tag: "note", elements: [...] });

// AFTER: Added action buttons before separator
elements.push({
  tag: "action",
  actions: [
    { tag: "button", text: { content: "👆 Pick Task", ... }, type: "primary", value: { action: "pick_task", taskId } },
    { tag: "button", text: { content: "✅ Mark Done", ... }, type: "default", value: { action: "complete_task", taskId } },
    { tag: "button", text: { content: "📦 Archive", ... }, type: "danger", value: { action: "archive_task", taskId } },
  ],
});
```

**Reason**: Users need quick actions on task cards without typing commands. Buttons send callbacks to the server.

### 2. `src/server/feishu/events.ts`

**Change 1: Added TaskStatus import**

```typescript
// BEFORE
import type { Task, TaskPriority, Attachment, FeishuFileType } from "../../shared/types.js";

// AFTER
import type { Task, TaskPriority, TaskStatus, Attachment, FeishuFileType } from "../../shared/types.js";
```

**Reason**: Card action handler needs TaskStatus for status transition validation.

**Change 2: Added POST /feishu/card-action endpoint**

New ~125-line route handler that:
- Receives Feishu `card.action.trigger` callbacks
- Verifies the verification token
- Extracts `action.value.action` and `action.value.taskId` from the callback
- Validates status transitions (e.g., can't pick a non-pending task)
- Updates task status via `store.updateTaskStatus()` or archives via `store.archiveTask()`
- Logs audit entries with `actorType: "feishu"` and `source: "card_action"`
- Dispatches webhooks and broadcasts SSE events
- Returns toast response to Feishu (success/warning/error)

**Reason**: Feishu sends card button callbacks to a registered URL. This endpoint processes those callbacks and performs the requested actions.

### 3. `src/shared/types.ts`

**Change: Added "task.archived" to AuditAction union**

```typescript
// BEFORE
  | "task.priority_escalated";

// AFTER
  | "task.priority_escalated"
  | "task.archived";
```

**Reason**: Card action archive button triggers an audit log entry with action "task.archived". The union type must include this value.

## Risk Assessment

- **Risk Level**: Low
- **Backward Compatible**: Yes — existing card sending is unchanged, new buttons are additive
- **Breaking Changes**: None
- **Data Migration**: None — "task.archived" is a new audit action value, existing data unaffected

## Verification Steps

1. ✅ `npm run typecheck` — passes
2. ✅ `npm run build` — passes
3. ✅ `npm test` — 451 tests pass (11 test files)
4. Manual verification: POST to `/feishu/card-action` with sample callback payload should update task status
