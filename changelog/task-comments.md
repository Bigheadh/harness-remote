# Changelog: Task Comments/Activity Timeline

## Overview

| Date | Task | Files Modified | Lines Added | Lines Removed |
|------|------|----------------|-------------|---------------|
| 2026-06-02 | Task comments/activity timeline | 7 | ~200 | ~2 |

## Per-File Changes

### 1. `src/shared/types.ts`

**Change A**: Added `TaskComment` interface (lines 80-89)

- **Before**: No comment type existed
- **After**: New interface with `id`, `taskId`, `author`, `authorType`, `body`, `createdAt`
- **Reason**: Defines the comment data model shared across server and MCP layers
- **Impact**: All files importing types.ts can now use `TaskComment`

**Change B**: Added `task.comment_added` and `task.comment_deleted` to `AuditAction` union (line 68)

- **Before**: `AuditAction` didn't include comment actions
- **After**: Two new action types appended
- **Reason**: Audit logging needs to track comment creation and deletion
- **Impact**: Audit log entries can now reference comment actions

### 2. `src/server/tasks/store.ts`

**Change A**: Added `TaskComment` and `AuditLogEntry` imports (line 5)

- **Before**: Only imported `Task`, `TaskStatus`, `TaskPriority`, `Attachment`
- **After**: Also imports `TaskComment` and `AuditLogEntry`
- **Reason**: Store interface and implementation need the comment type

**Change B**: Added `task_comments` table creation and index (lines 195-213)

- **Before**: Only `tasks` and `processed_events` tables
- **After**: New `task_comments` table with `id`, `task_id`, `author`, `author_type`, `body`, `created_at` columns, plus index on `task_id`
- **Reason**: Persist comments in SQLite with foreign key to tasks table
- **Impact**: New table created on server startup; auto-incrementing integer IDs

**Change C**: Added 3 methods to `TaskStore` interface (lines 52-54)

- **Before**: `listOverdueTasks()` was the last method
- **After**: `addComment()`, `listComments()`, `deleteComment()` added
- **Reason**: Expose comment operations through the store interface

**Change D**: Implemented `addComment`, `listComments`, `deleteComment` (lines 638-683)

- **Before**: No comment implementation
- **After**: Full CRUD — `addComment` inserts with auto-increment, `listComments` returns all for a task, `deleteComment` removes by ID scoped to task
- **Reason**: Core business logic for the comments feature
- **Impact**: `addComment` throws `Error("Task not found")` for invalid taskId

### 3. `src/server/tasks/routes.ts`

**Change A**: Added `AuditLogEntry` import (line 4)

- **Before**: Only imported `TaskStatus`
- **After**: Also imports `AuditLogEntry`
- **Reason**: Comment routes use `AuditLogEntry["actorType"]` for typing

**Change B**: Added 3 HTTP endpoints (lines 714-836)

- `GET /api/tasks/:id/comments` — list comments (requires `tasks.read`)
- `POST /api/tasks/:id/comments` — add comment (requires `tasks.write`)
- `DELETE /api/tasks/:id/comments/:commentId` — delete comment (requires `tasks.write`)
- **Reason**: Expose comment operations via REST API
- **Impact**: `POST /api/tasks/:id/comments` requires `body` field (string); `DELETE` validates `commentId` as positive integer; both log to audit store

### 4. `src/mcp-server/client.ts`

**Change A**: Added `TaskComment` import and 2 methods to `TaskApiClient` interface

- **Before**: 12 methods on the interface
- **After**: 14 methods with `listComments()` and `addComment()`

**Change B**: Implemented `listComments` and `addComment` HTTP methods (lines 349-387)

- **Reason**: MCP server needs to call the new API endpoints
- **Impact**: `addComment` sends `{ body }` to POST endpoint; author is set by server from auth context

### 5. `src/mcp-server/tools.ts`

**Change A**: Added 2 MCP tool registrations (lines 649-731)

- `add_task_comment` — adds comment via `client.addComment()`
- `list_task_comments` — lists comments via `client.listComments()`
- **Reason**: Expose comment operations as MCP tools for Codex CLI
- **Impact**: Tool count increased from 12 to 14

### 6. `test/mcp-server/tools.test.ts`

**Change A**: Added `TaskComment` import (line 4)

**Change B**: Added `listComments` and `addComment` mock methods (lines 217-245)

- **Reason**: Mock client must implement the full `TaskApiClient` interface

**Change C**: Updated tool count assertion from 12 to 14 (line 300)

**Change D**: Added 6 test cases in new `describe("comment tools")` block (lines 662-719)

- Registration tests for both tools
- `add_task_comment` handler test (verifies client method called with args)
- Error handling test for `add_task_comment`
- `list_task_comments` handler test (verifies response structure)
- Error handling test for `list_task_comments`
- **Reason**: Verify MCP tool contracts for comments feature

### 7. `FEATURES.md`

- Marked `- [x] Task comments/activity timeline` as completed

## Structural Summary

- **New types**: `TaskComment` interface
- **New DB table**: `task_comments` with auto-increment PK, foreign key to `tasks`
- **New API endpoints**: 3 (GET list, POST add, DELETE remove)
- **New MCP tools**: 2 (`add_task_comment`, `list_task_comments`)
- **New audit actions**: 2 (`task.comment_added`, `task.comment_deleted`)
- **New store methods**: 3 (`addComment`, `listComments`, `deleteComment`)
- **New tests**: 6 test cases

## Risk Assessment

- **Low risk**: All changes are additive — no existing functionality modified
- **SQLite foreign key**: `ON DELETE CASCADE` ensures comments are cleaned up when tasks are deleted
- **Auto-increment**: `result.lastInsertRowid` returns `bigint` but `Number()` cast is safe for comment IDs (won't exceed `Number.MAX_SAFE_INTEGER`)

## Verification

- `npm run typecheck` — ✅ passes
- `npm run build` — ✅ passes
- `npm run test` — ✅ 214/214 tests pass
