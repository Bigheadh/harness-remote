# Changelog: Scheduled/Recurring Tasks

## Date: 2026-06-02

## Overview

| Item | Value |
|------|-------|
| Feature | Scheduled/recurring tasks (Phase 21) |
| Files modified | 7 |
| Lines added | ~480 |
| Lines removed | ~2 |

## Files Changed

### 1. src/shared/types.ts

**Change**: Added `ScheduleFrequency` type and `ScheduledTask` interface.

- **Before**: Only had `TaskTemplate` for reusable task definitions.
- **After**: Added `ScheduleFrequency` (`"once" | "hourly" | "daily" | "weekly" | "monthly"`) and `ScheduledTask` interface with fields for scheduling configuration (commandText, frequency, nextRunAt, lastRunAt, lastTaskId, enabled, etc.).
- **Reason**: Core type definition needed by store, routes, client, and MCP tools.
- **Impact**: No breaking changes — purely additive types.

### 2. src/server/tasks/store.ts

**Change**: Added `scheduled_tasks` SQLite table, CRUD methods, and scheduler query methods.

- **Before**: Store handled tasks, templates, comments, bulk operations, audit.
- **After**: Added `scheduled_tasks` table with indexes, `rowToScheduledTask` helper, and 7 new store methods: `createScheduledTask`, `listScheduledTasks`, `getScheduledTask`, `updateScheduledTask`, `deleteScheduledTask`, `getDueScheduledTasks`, `markScheduledTaskRun`.
- **Reason**: Persistent storage for scheduled task definitions and execution tracking.
- **Impact**: DB schema migration (new table created automatically via `CREATE TABLE IF NOT EXISTS`).

### 3. src/server/scheduler/index.ts (NEW)

**Change**: Created scheduler engine that periodically checks for due scheduled tasks and creates real tasks.

- **Before**: No scheduler existed.
- **After**: New module with `calculateNextRun()` (computes next run time based on frequency), `processScheduledTask()` (creates a task from a schedule), and `startScheduler()` (starts an interval loop, returns cleanup function). Timer uses `unref()` to avoid keeping process alive.
- **Reason**: Core scheduler logic to automatically fire scheduled tasks on time.
- **Impact**: Server now starts a background interval on boot.

### 4. src/server/scheduled/routes.ts (NEW)

**Change**: Created HTTP API routes for managing scheduled tasks.

- **Before**: No scheduled task API endpoints.
- **After**: 6 new endpoints: `GET /api/scheduled-tasks`, `GET /api/scheduled-tasks/:id`, `POST /api/scheduled-tasks`, `PUT /api/scheduled-tasks/:id`, `DELETE /api/scheduled-tasks/:id`, `POST /api/scheduled-tasks/:id/run` (manual trigger). All require Bearer token auth and RBAC authorization.
- **Reason**: API surface for managing scheduled tasks via HTTP.
- **Impact**: New API endpoints; registered before parameterized routes to avoid Fastify routing conflicts.

### 5. src/server/index.ts

**Change**: Registered scheduled task routes and started the scheduler on server boot.

- **Before**: Server initialized stores, registered routes, started listening.
- **After**: Added `registerScheduledTaskRoutes()` call and `startScheduler(store, 60_000)` after server listening. Scheduler cleanup (`stopScheduler()`) added to graceful shutdown handler.
- **Reason**: Integration point for the new feature.
- **Impact**: Server now processes scheduled tasks every 60 seconds. Graceful shutdown properly stops the scheduler.

### 6. src/mcp-server/client.ts

**Change**: Added scheduled task methods to the HTTP client.

- **Before**: Client had template methods.
- **After**: Added 6 new methods: `listScheduledTasks`, `getScheduledTask`, `createScheduledTask`, `updateScheduledTask`, `deleteScheduledTask`, `runScheduledTask`. Each calls the corresponding HTTP endpoint.
- **Reason**: MCP server needs to call the scheduled task API endpoints.
- **Impact**: MCP tools can now manage scheduled tasks through HTTP.

### 7. src/mcp-server/tools.ts

**Change**: Added 6 new MCP tools for scheduled task management.

- **Before**: 22 MCP tools registered.
- **After**: 28 MCP tools. New tools: `list_scheduled_tasks`, `get_scheduled_task`, `create_scheduled_task`, `update_scheduled_task`, `delete_scheduled_task`, `run_scheduled_task`.
- **Reason**: Codex CLI users can now manage scheduled tasks through MCP tools.
- **Impact**: Codex CLI sees 6 new tools for scheduling management.

### 8. test/mcp-server/tools.test.ts

**Change**: Updated mock client and test assertions for new tools.

- **Before**: Mock client had 22 tool implementations, test asserted 22 registrations.
- **After**: Mock client has 28 implementations (added 6 scheduled task mocks), test asserts 28 registrations.
- **Reason**: Test coverage for new MCP tools.
- **Impact**: All tests pass with the new tool count.

### 9. FEATURES.md

**Change**: Marked scheduled/recurring tasks as completed.

- **Before**: `- [ ] Scheduled/recurring tasks`
- **After**: `- [x] Scheduled/recurring tasks`

## Structural Summary

- **New files**: `src/server/scheduler/index.ts`, `src/server/scheduled/routes.ts`
- **New types**: `ScheduleFrequency`, `ScheduledTask`
- **New API**: 6 endpoints under `/api/scheduled-tasks`
- **New MCP tools**: 6 tools (list, get, create, update, delete, run)
- **New DB table**: `scheduled_tasks` with index on `(next_run_at, enabled)`

## Risk Assessment

- **Low risk**: All changes are additive — no existing functionality modified.
- **DB migration**: New table is created via `CREATE TABLE IF NOT EXISTS`, safe for existing databases.
- **Scheduler interval**: 60-second check interval is conservative; `timer.unref()` prevents blocking process exit.
- **One-time schedules**: `"once"` frequency sets nextRunAt to far future (9999-12-31) after first run, effectively disabling further runs.

## Verification Steps

1. `npm run typecheck` — passes
2. `npm run build` — passes
3. `npm run test` — 223 tests pass across 9 test files
4. API endpoints registered at correct paths (static before parameterized)
5. Scheduler properly cleans up on graceful shutdown
