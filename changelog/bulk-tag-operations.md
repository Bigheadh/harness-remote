# Changelog: Bulk Tag Operations

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-06-04 |
| Feature | Bulk tag operations (add/remove tags from selected tasks) |
| Files Modified | 6 |
| Lines Added | ~180 |
| Lines Removed | 0 |

## Changes by File

### 1. `src/server/tasks/store.ts`

**Interface addition** (line ~71):
- Added `bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }>` to `TaskStore` interface
- Added `bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }>` to `TaskStore` interface

**Implementation** (after `bulkDelete`, ~line 1300):
- `bulkAddTags`: Iterates over task IDs, reads existing tags via `parseTags()`, merges new tags with dedup via `Set`, sorts alphabetically, writes JSON back to DB
- `bulkRemoveTags`: Iterates over task IDs, reads existing tags, filters out the target tag, writes null if empty array remains
- Both methods use the same try/catch per-task pattern as `bulkUpdateStatus`/`bulkAssign`

**Reason**: The dashboard had bulk status/assign/delete operations but no bulk tag management, requiring users to add/remove tags one task at a time via the detail panel.

**Impact**: Enables batch tag management across the API, MCP tools, and dashboard UI.

### 2. `src/server/tasks/routes.ts`

**New routes** (after `POST /api/tasks/bulk/delete`, before `GET /api/tasks/ready`):
- `POST /api/tasks/bulk/tags/add` — accepts `{ ids: string[], tags: string[] }`, requires `tasks.write` auth, validates tags are non-empty strings, calls `store.bulkAddTags()`, logs audit event `task.tags_added` with bulk details
- `POST /api/tasks/bulk/tags/remove` — accepts `{ ids: string[], tag: string }`, requires `tasks.write` auth, validates tag is non-empty string, calls `store.bulkRemoveTags()`, logs audit event `task.tags_removed` with bulk details

**Reason**: Needed HTTP endpoints for the dashboard and MCP client to call bulk tag operations.

**Impact**: New API endpoints; registered before `:id` routes to avoid Fastify path matching conflicts.

### 3. `src/mcp-server/client.ts`

**Interface addition** (line ~38):
- Added `bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }>` to `TaskApiClient`
- Added `bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }>` to `TaskApiClient`

**Implementation** (after `bulkDelete`, ~line 545):
- `bulkAddTags`: POST to `/api/tasks/bulk/tags/add` with `{ ids, tags }`
- `bulkRemoveTags`: POST to `/api/tasks/bulk/tags/remove` with `{ ids, tag }`
- Both follow the same fetch/error/parse pattern as other bulk client methods

**Reason**: MCP tools need client methods to call the new bulk tag API endpoints.

### 4. `src/mcp-server/tools.ts`

**Extended `manage_task_tags` tool**:
- Added `"bulk_add"` and `"bulk_remove"` to the action enum (was `["add", "remove", "list"]`, now `["add", "remove", "list", "bulk_add", "bulk_remove"]`)
- Added `taskIds` input parameter (optional array of strings)
- Updated `tags` description to mention bulk_add
- Updated `tag` description to mention bulk_remove
- Updated tool description to document all 5 actions
- Added handler for `bulk_add`: validates taskIds and tags arrays, calls `client.bulkAddTags()`, returns result with count message
- Added handler for `bulk_remove`: validates taskIds and tag, calls `client.bulkRemoveTags()`, returns result with count message

**Reason**: MCP users (Codex CLI) need to manage tags on multiple tasks at once from the command line.

**Impact**: Tool registration count unchanged (67) — extended existing tool, no new tool added.

### 5. `src/server/dashboard/templates/dashboard.ts`

**UI buttons** (bulk actions bar):
- Added "🏷️ Add Tags" button (`btn-sm blue`) calling `bulkAddTags()`
- Added "🏷️ Remove Tag" button (`btn-sm orange`) calling `bulkRemoveTag()`
- Placed between "Assign Device" and "Delete" buttons

**JavaScript functions** (after `bulkDelete()`):
- `bulkAddTags()`: Prompts user for comma-separated tags, POSTs to `/api/tasks/bulk/tags/add`, shows result count, clears selection, reloads tasks
- `bulkRemoveTag()`: Prompts user for a single tag name, POSTs to `/api/tasks/bulk/tags/remove`, shows result count, clears selection, reloads tasks

**Reason**: Dashboard had bulk selection UI but no way to batch-manage tags from the toolbar.

### 6. `test/mcp-server/tools.test.ts`

**Mock client updates**:
- Added `bulkAddTags(ids, tags)` mock: pushes to calls array, returns `{ updated: ids.length, errors: [] }`
- Added `bulkRemoveTags(ids, tag)` mock: pushes to calls array, returns `{ updated: ids.length, errors: [] }`

**Reason**: The mock client must implement the full `TaskApiClient` interface to avoid TypeScript compilation errors.

## Risk Assessment

- **Low risk**: Bulk operations follow the established pattern of `bulkUpdateStatus`/`bulkAssign`/`bulkDelete`
- **No schema changes**: No new DB columns or tables — uses existing `tags` JSON column
- **Idempotent**: Adding tags that already exist is a no-op (dedup via Set); removing non-existent tags silently succeeds
- **Auth**: Both new routes require `tasks.write` permission, consistent with single-task tag operations

## Verification

1. `npm run typecheck` — passes
2. `npm run build` — passes
3. `npm run test` — 270 tests pass (11 test files)
4. Dashboard: bulk tag buttons appear in the bulk actions toolbar when tasks are selected
5. API: `POST /api/tasks/bulk/tags/add` and `POST /api/tasks/bulk/tags/remove` endpoints respond correctly
6. MCP: `manage_task_tags` tool supports `bulk_add` and `bulk_remove` actions
