# Changelog: Task Due Dates and Reminders

**Date**: 2026-06-02
**Feature**: Task due dates and reminders (deadline tracking with overdue alerts)
**Files Modified**: 7
**Lines Added**: ~250
**Lines Removed**: ~5

## Overview

| Item | Value |
|------|-------|
| Date | 2026-06-02 |
| Task | Task due dates and reminders |
| Files | 7 |
| Added | ~250 |
| Removed | ~5 |

## File Changes

### 1. `src/shared/types.ts`

**Change**: Added `dueDate` and `reminderAt` optional fields to `Task` interface.

- **Line ~35**: Added `dueDate?: string` and `reminderAt?: string` to Task interface
- **Reason**: Core data model needs to support deadline tracking and reminder scheduling
- **Impact**: All code constructing Task objects now has these optional fields available

### 2. `src/server/tasks/store.ts`

**Changes**:
1. Added DB column migrations for `due_date` and `reminder_at`
2. Updated `insertTask` prepared statement to include new columns
3. Updated `rowToTask` to map new columns
4. Updated `createTask` to pass new fields
5. Added 3 new methods to `TaskStore` interface and implementation:
   - `setTaskDueDate(taskId, dueDate)` — set or clear due date
   - `setTaskReminder(taskId, reminderAt)` — set or clear reminder
   - `listOverdueTasks()` — query tasks past their deadline
- **Reason**: Persistence layer must store and query due dates; overdue detection requires SQL query filtering by `due_date < now AND status IN ('pending','picked','running')`
- **Impact**: All existing tasks get new nullable columns via migration; new API endpoints depend on these methods

### 3. `src/server/feishu/events.ts`

**Changes**:
1. Added `parseDueDate(text)` function — extracts `#due:YYYY-MM-DD` from message text
2. Added `stripDueDateMarkers(text)` function — removes due date markers from clean text
3. Updated `createTaskFromFeishuEvent` to parse and include `dueDate` field
- **Reason**: Users should be able to set due dates inline when creating tasks via Feishu
- **Impact**: Messages like "deploy feature #due:2026-06-15" will automatically set the due date

### 4. `src/server/tasks/routes.ts`

**Changes**:
1. Added `GET /api/tasks/overdue` route (registered before `:id` to avoid param conflicts)
2. Added `POST /api/tasks/:id/due` route — set/clear due date
3. Added `POST /api/tasks/:id/reminder` route — set/clear reminder
- **Reason**: HTTP API needed for MCP tools and external integrations to manage deadlines
- **Impact**: Three new endpoints; overdue route must be registered before parameterized routes

### 5. `src/mcp-server/client.ts`

**Changes**:
1. Added `setDueDate`, `setReminder`, `listOverdueTasks` to `TaskApiClient` interface
2. Added HTTP client implementations for all three methods
- **Reason**: MCP server needs HTTP client methods to call the new API endpoints
- **Impact**: MCP tools can now manage due dates and query overdue tasks

### 6. `src/mcp-server/tools.ts`

**Changes**:
1. Added `set_task_due_date` tool — set/clear due date via MCP
2. Added `set_task_reminder` tool — set/clear reminder via MCP
3. Added `list_overdue_tasks` tool — list all overdue tasks
- **Reason**: Codex CLI users need MCP tools to manage deadlines and check overdue status
- **Impact**: Three new MCP tools registered (total: 12)

### 7. `test/mcp-server/tools.test.ts`

**Changes**:
1. Added mock implementations for `setDueDate`, `setReminder`, `listOverdueTasks`
2. Updated tool count assertion from 9 to 12
- **Reason**: Tests must verify all tool registrations and handler contracts
- **Impact**: 208 tests pass (up from 176 before tags feature; 32 MCP tool tests)

## Structural Summary

- **New files**: 0
- **Modified files**: 7
- **New DB columns**: `due_date TEXT`, `reminder_at TEXT` (with migrations)
- **New API endpoints**: 3 (`GET /overdue`, `POST /:id/due`, `POST /:id/reminder`)
- **New MCP tools**: 3 (`set_task_due_date`, `set_task_reminder`, `list_overdue_tasks`)
- **New store methods**: 3 (`setTaskDueDate`, `setTaskReminder`, `listOverdueTasks`)

## Risk Assessment

- **Low risk**: All new fields are optional; existing tasks unaffected
- **Migration safe**: `ALTER TABLE ADD COLUMN` with try/catch — no-op if column exists
- **Route ordering**: Overdue route registered before `:id` parameterized routes to prevent matching "overdue" as a task ID
- **No breaking changes**: All additions are backward-compatible

## Verification

- [x] `npm run typecheck` — passes (exit 0)
- [x] `npm run build` — passes (exit 0)
- [x] `npm run test` — 208/208 tests pass
- [x] Feature marked complete in FEATURES.md
