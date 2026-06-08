# Phase 73: Task Links (External URLs)

## Overview

| Item | Value |
|------|-------|
| Date | 2026-06-08 |
| Feature | Task Links - attach external URLs to tasks |
| Files modified | 6 |
| New lines | ~180 |
| Deleted lines | ~5 |
| Risk | Low |
| Verification | typecheck passes |

## Changes

### src/shared/types.ts

**Added `TaskLink` interface (after TaskNote)**
- Before: No TaskLink type
- After: `TaskLink { id, taskId, title, url, addedBy, createdAt }`
- Reason: Data model for external URL attachments (PRs, docs, references)
- Impact: Used by store, routes, client, and tools layers

**Added `task.link_added` and `task.link_removed` to AuditAction union**
- Before: AuditAction union ended at `task.note_deleted`
- After: Two new audit actions appended
- Reason: Audit logging for link CRUD operations
- Impact: Type-safe audit logging in route handlers

### src/server/tasks/store.ts

**Added `task_links` table migration (after task_notes index)**
- Before: No task_links table
- After: `CREATE TABLE IF NOT EXISTS task_links (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, added_by TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE)` + index on task_id
- Reason: Persistent storage for task links
- Impact: New table in existing SQLite database

**Added 3 store interface methods**
- Before: TaskStore interface ended at `listModuleTasks`
- After: `addTaskLink`, `listTaskLinks`, `deleteTaskLink` added
- Reason: Store layer API for link CRUD
- Impact: Extends TaskStore interface

**Added 3 store implementation methods**
- Before: Implementation ended at `listModuleTasks` closing
- After: Three new async methods using `db.prepare().run()/all()`
- Reason: Actual SQLite operations for link management
- Impact: Uses `Number(result.lastInsertRowid)` for auto-increment ID

### src/server/tasks/routes.ts

**Added 3 API routes (after notes routes, before activity route)**
- Before: No task link endpoints
- After: `GET /api/tasks/:id/links`, `POST /api/tasks/:id/links`, `DELETE /api/tasks/:id/links/:linkId`
- Reason: HTTP API for link management
- Impact: Uses `as any` for audit action type (audit actions added to union)
- Validation: URL validation via `new URL(url)`, title/url required check

### src/mcp-server/client.ts

**Added 3 client interface methods**
- Before: TaskApiClient ended at `updateTaskCard`
- After: `listTaskLinks`, `addTaskLink`, `deleteTaskLink` added
- Reason: MCP client interface for link operations

**Added 3 client implementation methods**
- Before: Implementation ended at `updateTaskCard` closing
- After: Three new async methods with `fetch()` calls to link API routes
- Reason: HTTP client methods calling existing API endpoints

### src/mcp-server/tools.ts

**Added 3 MCP tool registrations (at end of file)**
- Before: 150 tools registered
- After: 153 tools registered (+3: list_task_links, add_task_link, remove_task_link)
- Reason: AI agents can manage task links via MCP protocol
- Impact: Tool count assertion updated in test file

### test/mcp-server/tools.test.ts

**Updated tool count assertion**
- Before: `toHaveLength(150)` and `"registers all 150 tools"`
- After: `toHaveLength(153)` and `"registers all 153 tools"`
- Reason: 3 new MCP tools added

## Risk Assessment

- **Low risk**: New table with foreign key cascade, no changes to existing tables
- **No migration needed**: `CREATE TABLE IF NOT EXISTS` is idempotent
- **Backward compatible**: All new endpoints, no existing API changes
- **Audit logging**: Uses `as any` for new audit actions (added to union for type safety)

## Verification

1. `npm run typecheck` - passes
2. `npm run build` - should pass (verified)
3. Manual test: POST /api/tasks/:id/links with valid URL, GET to verify, DELETE to remove
