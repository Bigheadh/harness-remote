# Phase 34: v11 Dashboard Bulk Archive

## Date
2026-06-05

## Summary
Added bulk archive/unarchive functionality to the dashboard, allowing users to soft-delete and restore multiple tasks at once from the web UI. Also added corresponding MCP tools for programmatic bulk archive operations.

## Files Modified

### src/server/tasks/routes.ts
- **Added** `POST /api/tasks/bulk/archive` endpoint
  - Before: No bulk archive endpoint existed
  - After: Accepts `{ ids: string[] }`, iterates through IDs calling `store.archiveTask()`, collects errors, logs audit event, broadcasts SSE updates
  - Reason: Enable bulk soft-delete from dashboard and API
  - Impact: New API endpoint, registered before parameterized routes to avoid path matching issues
- **Added** `POST /api/tasks/bulk/unarchive` endpoint
  - Before: No bulk unarchive endpoint existed
  - After: Accepts `{ ids: string[] }`, iterates through IDs calling `store.unarchiveTask()`, collects errors, logs audit event, broadcasts SSE updates
  - Reason: Enable bulk restore from dashboard and API
  - Impact: New API endpoint, registered before parameterized routes

### src/mcp-server/client.ts
- **Added** `bulkArchiveTasks(ids: string[])` to `TaskApiClient` interface
  - Before: Interface only had individual `archiveTask(taskId)` method
  - After: New method signature returning `{ archived: number; errors: string[] }`
  - Reason: MCP tools need to call bulk archive endpoint
  - Impact: Interface extension, requires mock update in tests
- **Added** `bulkUnarchiveTasks(ids: string[])` to `TaskApiClient` interface
  - Before: Interface only had individual `unarchiveTask(taskId)` method
  - After: New method signature returning `{ restored: number; errors: string[] }`
  - Reason: MCP tools need to call bulk unarchive endpoint
  - Impact: Interface extension
- **Added** implementation for `bulkArchiveTasks` method
  - Before: No implementation
  - After: POSTs to `/api/tasks/bulk/archive` with JSON body
  - Reason: HTTP client for bulk archive API
- **Added** implementation for `bulkUnarchiveTasks` method
  - Before: No implementation
  - After: POSTs to `/api/tasks/bulk/unarchive` with JSON body
  - Reason: HTTP client for bulk unarchive API

### src/mcp-server/tools.ts
- **Added** `bulk_archive_tasks` MCP tool
  - Before: No bulk archive tool
  - After: Accepts `{ ids: string[] }` (1-100 IDs), calls `client.bulkArchiveTasks()`
  - Reason: Enable bulk archive from Codex CLI via MCP
  - Impact: New tool registration, increments tool count to 69
- **Added** `bulk_unarchive_tasks` MCP tool
  - Before: No bulk unarchive tool
  - After: Accepts `{ ids: string[] }` (1-100 IDs), calls `client.bulkUnarchiveTasks()`
  - Reason: Enable bulk restore from Codex CLI via MCP
  - Impact: New tool registration

### src/server/dashboard/templates/dashboard.ts
- **Added** Archive button to bulk actions bar
  - Before: Bulk bar had status, assign, tags, delete buttons only
  - After: Added purple "📦 Archive" button between Remove Tag and Delete
  - Reason: Quick access to bulk archive from dashboard
  - Impact: UI addition, no functional change to existing buttons
- **Added** Unarchive button to bulk actions bar
  - Before: No unarchive button in bulk actions
  - After: Added orange "📤 Unarchive" button after Archive
  - Reason: Quick access to bulk restore from dashboard
  - Impact: UI addition
- **Added** `bulkArchive()` JavaScript function
  - Before: No bulk archive function
  - After: Confirms with user, POSTs to `/api/tasks/bulk/archive`, shows result, refreshes list
  - Reason: Dashboard bulk archive interaction
- **Added** `bulkUnarchive()` JavaScript function
  - Before: No bulk unarchive function
  - After: Confirms with user, POSTs to `/api/tasks/bulk/unarchive`, shows result, refreshes list
  - Reason: Dashboard bulk unarchive interaction

### test/mcp-server/tools.test.ts
- **Added** `bulkArchiveTasks` mock method
  - Before: Mock missing this method (TypeScript compile error)
  - After: Returns `{ archived: ids.length, errors: [] }` and tracks calls
  - Reason: Satisfy `TaskApiClient` interface requirement
- **Added** `bulkUnarchiveTasks` mock method
  - Before: Mock missing this method
  - After: Returns `{ restored: ids.length, errors: [] }` and tracks calls
  - Reason: Satisfy `TaskApiClient` interface requirement
- **Updated** tool count assertion from 67 to 69
  - Before: `expect(mockServer.registrations).toHaveLength(67)`
  - After: `expect(mockServer.registrations).toHaveLength(69)`
  - Reason: Two new tools registered

### FEATURES.md
- **Added** Phase 34 section with 6 items (all marked `[x]`)

## Risk
- **Low**: Bulk archive uses individual `archiveTask()` calls in a loop, not a single SQL transaction. If the process crashes mid-loop, some tasks may be archived while others aren't. This is acceptable for the current use case (manual dashboard operations).
- **Low**: Route registration order is critical — bulk endpoints must be registered before `/:id` parameterized routes. This was verified by placing them after existing bulk routes.

## Verification
- `npm run typecheck` — passes (exit 0)
- `npm run build` — passes (exit 0)
- `npm run test` — 270 tests pass, 11 test files pass
- Dashboard bulk archive/unarchive buttons visible in bulk actions bar
- API endpoints accept `{ ids: string[] }` and return `{ archived/restored: number, errors: string[] }`
