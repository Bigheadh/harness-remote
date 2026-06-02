# Changelog: Task Cloning Feature

## Overview

| Date | Task | Files Changed | Lines Added | Lines Removed |
|------|------|---------------|-------------|---------------|
| 2026-06-03 | Task cloning — duplicate a task with same command text and fresh status | 5 | ~95 | ~2 |

## File Changes

### src/server/tasks/store.ts

**Addition: `cloneTask` method on `TaskStore` interface (line ~108)**
- Before: `retryTask(taskId: string): Promise<Task>;` was the last method
- After: Added `cloneTask(taskId: string): Promise<Task>;` interface method
- Reason: Expose clone capability in the store contract
- Impact: All TaskStore implementations must implement cloneTask

**Addition: `cloneTask` implementation (after retryTask, ~line 648)**
- Before: No cloneTask implementation
- After: New method that:
  1. Looks up the source task by ID (throws if not found)
  2. Generates a new unique ID and a cloned feishuMessageId with `_clone_<timestamp>` suffix
  3. Copies: source, feishuChatId, feishuUserId, commandText, priority, tags, attachments, dueDate, reminderAt
  4. Sets status to "pending", clears result fields, starts unassigned
  5. Inserts and returns the new task
- Reason: Users need to duplicate tasks without re-typing the command
- Risk: Low — insert-only operation, no side effects on source task

### src/server/tasks/routes.ts

**Addition: `POST /api/tasks/:id/clone` route (after retry route, ~line 766)**
- Before: No clone endpoint
- After: New route that:
  1. Requires `tasks.write` permission
  2. Calls `store.cloneTask(id)`
  3. Logs audit entry with action "task.created" and details referencing source task
  4. Broadcasts SSE event for the new task
  5. Returns 201 with the cloned task
- Reason: HTTP API for task cloning
- Risk: Low — follows established retry route pattern

### src/mcp-server/client.ts

**Addition: `cloneTask` method on `TaskApiClient` interface (line ~70)**
- Before: `retryTask` was the last method
- After: Added `cloneTask(taskId: string): Promise<Task>;`
- Reason: MCP client needs to call the clone endpoint

**Addition: `cloneTask` implementation in `createTaskApiClient` (~line 821)**
- Before: No cloneTask implementation
- After: POST to `/api/tasks/${taskId}/clone`, returns the cloned task
- Reason: HTTP client for the clone endpoint
- Risk: Low — straightforward HTTP call

### src/mcp-server/tools.ts

**Addition: `clone_task` MCP tool (after retry_task, ~line 1931)**
- Before: No clone_task tool
- After: New tool that:
  1. Takes a `taskId` parameter
  2. Calls `client.cloneTask(taskId)`
  3. Returns the cloned task with a success message including the new ID
- Reason: Codex CLI can clone tasks via MCP
- Risk: Low — delegates to client, no direct DB access

### test/mcp-server/tools.test.ts

**Update: Tool count assertion (line 759)**
- Before: `toHaveLength(44)`
- After: `toHaveLength(45)`
- Reason: New clone_task tool added

**Addition: Mock `cloneTask` method in `createMockClient` (~line 703)**
- Before: No cloneTask mock
- After: Returns a mock task with `${taskId}_clone` ID and "pending" status
- Reason: Mock must satisfy `TaskApiClient` interface

## Structural Summary

- **New**: `cloneTask` method across store → routes → client → tool layers
- **New**: `POST /api/tasks/:id/clone` HTTP endpoint
- **New**: `clone_task` MCP tool for Codex CLI integration
- **Modified**: Tool count incremented from 44 to 45

## Risk Assessment

- **Low risk**: Clone is a pure insert operation — no mutation of source task
- **Edge case**: Cloned task gets a unique `feishuMessageId` with `_clone_<ts>` suffix to avoid UNIQUE constraint conflicts
- **No data loss**: Original task is untouched

## Verification

- [x] `npm run typecheck` passes (exit 0)
- [x] `npm run build` passes (exit 0)
- [x] All 223 tests pass (9 test files)
