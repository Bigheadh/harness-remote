# Changelog: Task Pinning

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-06-03 |
| Feature | Task pinning — pin important tasks to top of listing |
| Files Modified | 6 |
| Lines Added | ~140 |
| Lines Removed | 0 |

## File Changes

### 1. `src/shared/types.ts`

**Change**: Added `pinned?: boolean` field to `Task` interface.

- **Before**: `Task` had no `pinned` field
- **After**: `pinned?: boolean` added after `updatedAt`
- **Reason**: Enables task pinning feature — tasks can be marked as pinned to appear at top of listings
- **Impact**: All code that constructs `Task` objects now has an optional `pinned` field
- **Risk**: Low — field is optional, backward compatible

### 2. `src/server/tasks/store.ts`

**Changes** (4 modifications):

a) **Migration**: Added `pinned INTEGER NOT NULL DEFAULT 0` column migration
   - **Before**: No `pinned` column in tasks table
   - **After**: Column auto-added on startup for existing DBs
   - **Reason**: SQLite doesn't support IF NOT EXISTS for columns; try/catch migration pattern

b) **rowToTask**: Added `pinned: Number(row["pinned"]) === 1` to parsed task object
   - **Before**: `rowToTask` didn't include `pinned`
   - **After**: `pinned` field mapped from DB integer (0/1) to boolean
   - **Reason**: Ensure pinning state is returned in API responses

c) **selectTasks ORDER BY**: Added `pinned DESC` as first sort criterion
   - **Before**: Tasks sorted by priority then created_at
   - **After**: Pinned tasks appear first, then by priority, then by created_at
   - **Reason**: Core feature requirement — pinned tasks should be at top

d) **New methods**: Added `pinTask()` and `unpinTask()` to TaskStore interface and implementation
   - **Before**: No pin/unpin methods
   - **After**: `pinTask(taskId)` sets `pinned=1`, `unpinTask(taskId)` sets `pinned=0`
   - **Reason**: API endpoints need store methods to toggle pin state

### 3. `src/server/tasks/routes.ts`

**Changes**: Added two new POST endpoints

a) `POST /api/tasks/:id/pin` — Pin a task (requires `tasks.write`)
   - Calls `store.pinTask(id)`, logs audit event, broadcasts SSE update
   - Returns 404 if task not found

b) `POST /api/tasks/:id/unpin` — Unpin a task (requires `tasks.write`)
   - Calls `store.unpinTask(id)`, logs audit event, broadcasts SSE update
   - Returns 404 if task not found

### 4. `src/mcp-server/client.ts`

**Changes**: Added `pinTask()` and `unpinTask()` to `TaskApiClient` interface and implementation
- Both make POST requests to the server's pin/unpin endpoints
- Same pattern as `retryTask`/`cloneTask`

### 5. `src/mcp-server/tools.ts`

**Changes**: Added two new MCP tools

a) `pin_task` — Pin a task to top of listing
   - Input: `taskId` (string)
   - Calls `client.pinTask(taskId)`
   - Returns success message with task ID

b) `unpin_task` — Unpin a task
   - Input: `taskId` (string)
   - Calls `client.unpinTask(taskId)`
   - Returns success message with task ID

### 6. `test/mcp-server/tools.test.ts`

**Changes**:
- Added `pinTask()` and `unpinTask()` mock implementations to `createMockClient()`
- Updated tool count assertion from 45 to 47

## Verification

- `npm run typecheck` ✅ (exit 0)
- `npm run build` ✅ (exit 0)
- `npm run test` ✅ (223 tests passed, 0 failed)
