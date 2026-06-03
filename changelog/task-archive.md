# Task Archive (Soft-Delete)

**Date:** 2026-06-03
**Feature:** Task archive — soft-delete completed tasks to keep active view clean
**Files Modified:** 6

## Overview

| File | Change |
|------|--------|
| `src/shared/types.ts` | Added `archivedAt?: string` field to `Task` interface |
| `src/server/tasks/store.ts` | DB migration, interface methods, query updates, implementation |
| `src/server/tasks/routes.ts` | 3 new API routes |
| `src/mcp-server/client.ts` | 3 new client methods |
| `src/mcp-server/tools.ts` | 3 new MCP tools |
| `test/mcp-server/tools.test.ts` | Mock methods + tool count assertion (61→64) |
| `FEATURES.md` | Marked task archive as complete |

## Per-File Changes

### 1. `src/shared/types.ts`

**Line 51:** Added `archivedAt?: string` to `Task` interface
- **Before:** `pinned?: boolean; resultSummary?: string;`
- **After:** `pinned?: boolean; archivedAt?: string; resultSummary?: string;`
- **Reason:** Soft-delete needs a timestamp to track when a task was archived
- **Impact:** All code consuming `Task` type now has optional `archivedAt` field

### 2. `src/server/tasks/store.ts`

**Line 373-377:** Added DB migration for `archived_at` column
- **Before:** Only `pinned` column migration
- **After:** Added `ALTER TABLE tasks ADD COLUMN archived_at TEXT` migration
- **Reason:** Existing databases need the new column
- **Impact:** No-op if column already exists (try/catch)

**Line 199:** Updated `rowToTask()` to include `archivedAt`
- **Before:** `pinned: Number(row["pinned"]) === 1, resultSummary: ...`
- **After:** `pinned: Number(row["pinned"]) === 1, archivedAt: (row["archived_at"] as string) ?? undefined, resultSummary: ...`
- **Reason:** Map DB column to TypeScript field
- **Impact:** All task reads now include archive status

**Lines 144-146:** Added 3 methods to `TaskStore` interface
- `archiveTask(taskId: string): Promise<Task>`
- `unarchiveTask(taskId: string): Promise<Task>`
- `listArchivedTasks(limit?: number): Promise<Task[]>`
- **Reason:** Contract for archive operations

**Line 511:** Updated `selectTasks` query to exclude archived tasks
- **Before:** `WHERE status = COALESCE(?, status) AND (assigned_device_id ...)`
- **After:** Added `AND archived_at IS NULL`
- **Reason:** Archived tasks should be hidden from normal listings
- **Impact:** `listTasks()` now only returns non-archived tasks

**Lines 2596-2640:** Implemented 3 new store methods
- `archiveTask`: Sets `archived_at` to current ISO timestamp, validates not already archived
- `unarchiveTask`: Sets `archived_at` to NULL, validates task is archived
- `listArchivedTasks`: Queries tasks where `archived_at IS NOT NULL`, ordered by archive time

### 3. `src/server/tasks/routes.ts`

**Lines 719-736:** Added `GET /api/tasks/archived` route
- Requires `tasks.read` permission
- Returns list of archived tasks with optional `limit` query param
- Registered before `:id` routes to avoid param matching

**Lines 2700-2745:** Added `POST /api/tasks/:id/archive` route
- Requires `tasks.write` permission
- Calls `store.archiveTask(id)`, logs audit event, broadcasts SSE
- Returns 404 if not found, 409 if already archived

**Lines 2748-2793:** Added `POST /api/tasks/:id/unarchive` route
- Requires `tasks.write` permission
- Calls `store.unarchiveTask(id)`, logs audit event, broadcasts SSE
- Returns 404 if not found, 409 if not archived

### 4. `src/mcp-server/client.ts`

**Lines 96-98:** Added 3 methods to `TaskApiClient` interface
- `archiveTask(taskId: string): Promise<Task>`
- `unarchiveTask(taskId: string): Promise<Task>`
- `listArchivedTasks(limit?: number): Promise<Task[]>`

**Lines 1095-1140:** Implemented 3 client methods
- `archiveTask`: POST to `/api/tasks/:id/archive`
- `unarchiveTask`: POST to `/api/tasks/:id/unarchive`
- `listArchivedTasks`: GET `/api/tasks/archived` with optional limit

### 5. `src/mcp-server/tools.ts`

**Lines 2632-2757:** Added 3 MCP tools
- `archive_task`: Soft-deletes a task, hides from active view
- `unarchive_task`: Restores an archived task
- `list_archived_tasks`: Lists archived tasks with optional limit

### 6. `test/mcp-server/tools.test.ts`

**Line 984:** Updated tool count assertion from 61 to 64
**Line 983:** Updated test description to "registers all 64 tools"
**Lines 928-978:** Added mock implementations for `archiveTask`, `unarchiveTask`, `listArchivedTasks`

## Risk Assessment

- **Low risk:** This is additive — new column, new methods, new routes. No existing behavior changed except `listTasks()` now excludes archived tasks (which is the desired behavior).
- **Migration safe:** `ALTER TABLE ADD COLUMN` with try/catch is idempotent.
- **Backward compatible:** `archivedAt` is optional on `Task` type.

## Verification

- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [x] `npm run test` passes (246/246 tests, including updated tool count assertion)
