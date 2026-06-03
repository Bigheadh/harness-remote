# Changelog: Phase 29 — Task Description & Enhanced Feishu Interaction

**Date:** 2026-06-03
**Task:** Implement Phase 29 features (task description field, enhanced Feishu cards, per-user stats)
**Files Modified:** 3
**Lines Added:** ~100
**Lines Removed:** ~2

## Overview

Completed all three Phase 29 items. The task description field was already fully implemented in prior sessions (DB column, shared type, store, API route, MCP tool, Feishu `#desc:` parsing). This session completed the remaining two: enhanced Feishu status-change cards and per-user task statistics.

## Per-File Changes

### 1. `src/server/feishu/card-builder.ts`

**Change:** Enhanced `buildTaskStatusCard()` to show tags, due date, and description

**Before:**
```typescript
// buildTaskStatusCard showed: status transition, command, priority
// Then: hr separator, task ID note
elements.push({
  tag: "div",
  text: {
    content: `**Priority:** ${PRIORITY_LABELS[task.priority]}`,
    tag: "lark_md",
  },
});

elements.push({ tag: "hr" });
```

**After:**
```typescript
// buildTaskStatusCard now shows: status transition, command, priority,
// tags (if any), due date (if any), description (if any)
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
```

**Reason:** `buildTaskStatusCard` was previously called for Feishu proactive status notifications (running/failed) but only showed status, command, and priority — missing tags, due date, and description that users set on tasks. This makes status notifications more informative.

**Impact:** Any Feishu status-change notification card now displays the full task context. No change to `buildTaskCreatedCard` (already showed all fields).

**Risk:** Low. Pure additive UI change, no data flow changes.

### 2. `src/server/stats/routes.ts`

**Change:** Added `GET /api/stats/users` endpoint

**Before:** No per-user statistics endpoint existed.

**After:** New route aggregates all tasks by `feishuUserId` and returns:
- `totalUsers` — number of unique users
- `totalTasks` — total task count
- `users[]` — per-user breakdown sorted by task count descending:
  - `userId`, `total`, `byStatus`, `done`, `failed`
  - `avgResolutionMinutes` — average time from creation to completion
  - `lastTaskAt` — most recent task creation timestamp

Uses TTL cache (60s) for performance. Requires `dashboard.read` permission.

**Reason:** No way to see which Feishu users are submitting tasks and their completion rates. Useful for team monitoring.

**Impact:** New endpoint only, no changes to existing endpoints or stores.

**Risk:** Low. Read-only aggregation over existing data, no new DB tables.

### 3. `FEATURES.md`

**Change:** Marked all Phase 29 items as `[x]`

**Reason:** All three items are now complete.

## Structural Summary

- **Enhanced:** `buildTaskStatusCard` in card-builder.ts (+33 lines)
- **Added:** `GET /api/stats/users` route in stats/routes.ts (+88 lines)
- **Updated:** FEATURES.md (3 items marked complete)

## Verification

- `npm run typecheck` — PASS (exit 0)
- `npm run build` — PASS (exit 0)
- `npm run test` — 270/270 tests pass (11 test files)
