# Changelog: Task Subtasks Feature

**Date:** 2026-06-03
**Feature:** Task subtasks — break tasks into independently trackable child tasks
**Files modified:** 5
**Lines added:** ~350
**Lines removed:** ~2

## Overview

Added a subtask system that allows parent tasks to be broken down into independently trackable child tasks. Each subtask has its own status lifecycle, can be created/updated/deleted independently, and is scoped to its parent task.

## Files Changed

### 1. `src/shared/types.ts`

**Change 1: Added Subtask interface**
- **Location:** After Task interface (line ~55)
- **Before:** No Subtask type existed
- **After:**
  ```typescript
  export interface Subtask {
    id: string;
    parentTaskId: string;
    title: string;
    commandText: string;
    status: TaskStatus;
    resultSummary?: string;
    resultDetails?: string;
    createdAt: string;
    updatedAt: string;
  }
  ```
- **Reason:** Defines the shared data model for subtasks, used by store, routes, client, and tools
- **Impact:** All layers can reference the Subtask type for type safety

**Change 2: Added subtask audit actions**
- **Location:** AuditAction union type (line ~120)
- **Before:** `| "task.note_deleted";`
- **After:** Added `"task.subtask_created"`, `"task.subtask_status_changed"`, `"task.subtask_result_reported"`, `"task.subtask_deleted"`
- **Reason:** Audit logging for subtask lifecycle events
- **Impact:** Audit store can log subtask operations

### 2. `src/server/tasks/store.ts`

**Change 1: Added rowToSubtask helper function**
- **Location:** After rowToSlaBreachLog (line ~269)
- **Before:** No subtask row parser
- **After:** `function rowToSubtask(row)` maps DB rows to Subtask interface
- **Reason:** Converts SQLite row objects to typed Subtask objects
- **Impact:** Used by all subtask store methods

**Change 2: Added subtask methods to TaskStore interface**
- **Location:** After cleanupExpiredLocks (line ~128)
- **Before:** Interface ended at cleanupExpiredLocks
- **After:** Added 6 methods: createSubtask, listSubtasks, getSubtask, updateSubtaskStatus, saveSubtaskResult, deleteSubtask
- **Reason:** Defines the store contract for subtask operations
- **Impact:** All store implementations must implement these methods

**Change 3: Added task_subtasks table creation**
- **Location:** After task_locks table (line ~457)
- **Before:** No subtask table
- **After:** Creates `task_subtasks` table with id, parent_task_id, title, command_text, status, result_summary, result_details, created_at, updated_at columns, plus index on parent_task_id
- **Reason:** Persistent storage for subtasks with foreign key to parent tasks
- **Impact:** New SQLite table created on startup

**Change 4: Added subtask store method implementations**
- **Location:** After cleanupExpiredLocks implementation (line ~1622)
- **Before:** No subtask methods
- **After:** 6 methods implementing create/list/get/update/delete/result for subtasks
- **Reason:** Core CRUD operations for subtask management
- **Impact:** All subtask API operations go through these methods

### 3. `src/server/tasks/routes.ts`

**Change 1: Added Subtask type import**
- **Location:** Line 6
- **Before:** `import type { AuditLogEntry } from "../../shared/types.js";`
- **After:** Added `import type { Subtask } from "../../shared/types.js";`
- **Reason:** Type reference for route handlers
- **Impact:** TypeScript type checking for route handlers

**Change 2: Added 6 subtask routes**
- **Location:** After lock GET route (line ~1687)
- **Before:** No subtask routes
- **After:** 6 new routes:
  - `POST /api/tasks/:id/subtasks` — create subtask (201)
  - `GET /api/tasks/:id/subtasks` — list subtasks
  - `GET /api/tasks/:id/subtasks/:subtaskId` — get subtask detail
  - `POST /api/tasks/:id/subtasks/:subtaskId/status` — update status
  - `POST /api/tasks/:id/subtasks/:subtaskId/result` — report result
  - `DELETE /api/tasks/:id/subtasks/:subtaskId` — delete subtask
- **Reason:** HTTP API for subtask management
- **Impact:** External clients (MCP, dashboard) can manage subtasks

### 4. `src/mcp-server/client.ts`

**Change 1: Added subtask methods to TaskApiClient interface**
- **Location:** After listTasksByUser (line ~87)
- **Before:** Interface ended at listTasksByUser
- **After:** Added 6 methods: listSubtasks, getSubtask, createSubtask, updateSubtaskStatus, reportSubtaskResult, deleteSubtask
- **Reason:** Client contract for MCP server to call subtask API
- **Impact:** MCP tools can call these methods

**Change 2: Added subtask client method implementations**
- **Location:** End of createTaskApiClient return (line ~985)
- **Before:** Ended at listTasksByUser
- **After:** 6 HTTP client methods for subtask operations
- **Reason:** HTTP calls to the server's subtask API endpoints
- **Impact:** MCP server can manage subtasks via HTTP

### 5. `src/mcp-server/tools.ts`

**Change: Added 5 subtask MCP tools**
- **Location:** End of registerMcpTools (line ~2384)
- **Before:** Function ended after list_user_tasks
- **After:** 5 new tools:
  - `list_subtasks` — list subtasks for a task
  - `create_subtask` — create a new subtask
  - `update_subtask_status` — update subtask status
  - `report_subtask_result` — report subtask result
  - `delete_subtask` — delete a subtask
- **Reason:** Codex CLI can manage subtasks via MCP
- **Impact:** Local MCP server exposes subtask operations

### 6. `test/mcp-server/tools.test.ts`

**Change 1: Added subtask mock methods**
- **Location:** After listTasksByUser mock (line ~837)
- **Before:** No subtask mocks
- **After:** 6 mock methods for subtask operations
- **Reason:** Mock client must implement all TaskApiClient methods
- **Impact:** Test compilation and execution

**Change 2: Updated tool count assertion**
- **Location:** Tool registration test (line ~972)
- **Before:** `expect(mockServer.registrations).toHaveLength(55);`
- **After:** `expect(mockServer.registrations).toHaveLength(60);`
- **Reason:** 5 new subtask tools added (list_subtasks, create_subtask, update_subtask_status, report_subtask_result, delete_subtask)
- **Impact:** Test validates correct number of registered tools

### 7. `FEATURES.md`

**Change:** Marked subtask feature as complete
- **Location:** Phase 25, line 163
- **Before:** `- [ ] Task subtasks...`
- **After:** `- [x] Task subtasks...`
- **Reason:** Feature implemented and verified
- **Impact:** Progress tracker updated

## Risk Assessment

- **Low risk:** All changes are additive — no existing functionality modified
- **DB migration:** New table created with `CREATE TABLE IF NOT EXISTS` — safe for existing databases
- **Foreign key:** `ON DELETE CASCADE` ensures subtasks are cleaned up when parent is deleted
- **Backward compatible:** No existing API contracts broken

## Verification

- [x] `npm run typecheck` — passes (EXIT: 0)
- [x] `npm run build` — passes (EXIT: 0)
- [x] `npm run test` — 243 tests pass (10 test files)
- [x] Tool count assertion updated (55 → 60)
