# Phase 32: Dashboard Interactive Features

**Date:** 2026-06-04
**Task:** Add interactive features to the web dashboard — task creation, CSV export, action buttons, comment form, keyboard shortcuts
**Files modified:** 3
**Lines added:** ~150
**Lines removed:** ~5

## Overview

| Metric | Value |
|--------|-------|
| Files modified | 3 |
| New features | 5 |
| API endpoints added | 1 |

## Per-File Changes

### 1. `src/shared/types.ts`

**Change:** Extended `Task.source` from literal `"feishu"` to union type `"feishu" | "web" | "mcp"`

**Before:**
```typescript
export interface Task {
  id: string;
  source: "feishu";
```

**After:**
```typescript
export type TaskSource = "feishu" | "web" | "mcp";

export interface Task {
  id: string;
  source: TaskSource;
```

**Reason:** Web-created tasks need a different source identifier than Feishu-originated tasks. Adding `"web"` allows the system to distinguish task origins for audit logging and UI display.

**Impact:** All existing code using `source: "feishu"` still works (literal is a subtype of the union). No breaking changes.

### 2. `src/server/tasks/routes.ts`

**Change:** Added `POST /api/tasks` endpoint for creating tasks from the web dashboard

**New endpoint details:**
- Path: `POST /api/tasks`
- Auth: Requires `tasks.write` permission
- Body: `{ commandText, description?, priority?, tags?, assignedDeviceId?, dueDate? }`
- Returns: `{ task }` with 201 status
- Side effects: Audit log entry, SSE broadcast

**Key implementation details:**
- Uses `store.createTask()` with `source: "web"`
- Generates synthetic `feishuMessageId` prefixed with `web_` for dedup
- Sets `feishuChatId` to empty string (no Feishu context)
- Uses `authCtx.username` as `feishuUserId` for audit trail
- Broadcasts task creation via SSE for real-time dashboard updates

**Also fixed:** `actorType` for audit log changed from `"user"` to `"api"` (valid enum value).

### 3. `src/server/dashboard/templates/dashboard.ts`

**Changes:** Major dashboard UI enhancements

**a) CSS additions:**
- Modal overlay + modal styles (`.modal-overlay`, `.modal`, `.modal-header`, `.modal-body`)
- Form styles (`.form-group`, `.form-actions`)
- Action button styles (`.btn-sm`, `.btn-sm.green`, `.btn-sm.red`, `.btn-sm.orange`, `.btn-sm.blue`)
- Comment form styles (`.comment-form`)

**b) HTML additions:**
- Header: "+ New Task" button and "⬇ CSV" export button
- Create task modal with fields: command text, description, priority, tags, assigned device, due date
- Detail panel: Action buttons section with context-sensitive buttons based on task status

**c) JavaScript additions:**
- `taskAction(id, status)` — Change task status (start/done/fail)
- `taskRetry(id)` — Requeue failed/done task
- `taskPin(id)` / `taskUnpin(id)` — Toggle pin status
- `taskClone(id)` — Duplicate a task
- `openCreateModal()` / `closeCreateModal()` / `submitCreateTask()` — Task creation form
- `exportCSV()` — Open CSV export in new tab
- `addComment(taskId)` — Submit comment from detail panel
- Updated `loadComments()` to always show comment form (even with 0 comments)
- Keyboard shortcuts: Ctrl+N (create), Escape (close modals/detail)

**Action button logic:**
- `pending`/`picked` → "▶ Start" button
- `running`/`picked` → "✅ Done" + "❌ Fail" buttons
- `done`/`failed` → "🔄 Retry" button
- All states → "📌 Pin/Unpin" + "📋 Clone" buttons

## Risk Assessment

**Low risk:**
- Type change (`source` union) is backward-compatible
- New endpoint is additive, no existing endpoints modified
- Dashboard changes are purely client-side UI

**Potential issues:**
- The `POST /api/tasks` endpoint does NOT require `feishuUserId` — any authenticated user with `tasks.write` can create tasks
- Comment form uses `showDetail()` reload which may cause a brief flash

## Verification

- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [x] `npm run test` — 270/270 tests pass
- [ ] Manual: Open dashboard, click "+ New Task", fill form, verify task appears in list
- [ ] Manual: Open task detail, click action buttons, verify status changes
- [ ] Manual: Click "⬇ CSV", verify download starts
- [ ] Manual: Add comment in detail panel, verify it appears
