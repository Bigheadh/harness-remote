# Change Log: Task Lock Mechanism

**Date:** 2026-06-03
**Feature:** TTL-based task locks to prevent concurrent processing
**Files Modified:** 7
**Lines Added:** ~230
**Lines Removed:** 0

## Overview

Added a task locking mechanism that prevents multiple devices from concurrently processing the same task. Locks have configurable TTL (default 5 minutes) and automatically expire if not released. Includes store layer, API routes, MCP client methods, and 3 new MCP tools.

## File-by-File Changes

### 1. `src/shared/types.ts` — New TaskLock type

**Added (line 6):** `TaskLock` interface with taskId, lockedBy, lockedAt, expiresAt fields.

**Reason:** Shared type for the lock contract between server and client layers.

### 2. `src/server/tasks/store.ts` — New table + 4 methods

**Added (line 442):** `task_locks` table with PRIMARY KEY on task_id, foreign key to tasks with CASCADE delete.

**Added to interface (line 124-127):** `lockTask`, `unlockTask`, `getTaskLock`, `cleanupExpiredLocks` methods.

**Added implementation (after getDependencyGraph):**
- `lockTask(taskId, deviceId, ttlMs)` — Creates or refreshes a lock. Throws if locked by another device. Same device refreshes TTL.
- `unlockTask(taskId, deviceId)` — Releases lock only if owned by the same device. Returns false if no lock exists.
- `getTaskLock(taskId)` — Returns lock details or undefined. Auto-cleans expired locks on read.
- `cleanupExpiredLocks()` — Bulk cleanup of expired locks.

**Reason:** Prevents race conditions when multiple Codex CLI instances pick up the same task. The TTL ensures locks don't persist indefinitely if a device crashes.

**Risk:** Low. New table and methods, no existing code modified. CASCADE delete ensures locks are cleaned up when tasks are deleted.

### 3. `src/server/tasks/routes.ts` — 3 new routes

**Added (after dependency-graph route):**
- `POST /api/tasks/:id/lock` — Lock task (requires tasks.write). Returns 409 if locked by another device.
- `DELETE /api/tasks/:id/lock` — Unlock task (requires tasks.write). Only the owning device can unlock.
- `GET /api/tasks/:id/lock` — Check lock status (requires tasks.read).

**Reason:** RESTful lock API following the existing route patterns.

### 4. `src/mcp-server/client.ts` — 3 new client methods

**Added to interface (line 57-59):** `lockTask`, `unlockTask`, `getTaskLock`.

**Added implementation (after getDependencyGraph):** HTTP methods calling the new lock routes.

### 5. `src/mcp-server/tools.ts` — 3 new MCP tools

**Added (after get_task_dependency_graph):**
- `lock_task` — Lock a task with optional device ID and TTL
- `unlock_task` — Release a task lock
- `check_task_lock` — Check if a task is locked and by whom

### 6. `test/mcp-server/tools.test.ts` — Mock methods + count

**Added:** Mock implementations for `lockTask`, `unlockTask`, `getTaskLock`.
**Updated:** Tool count from 52 → 55.

### 7. `FEATURES.md` — Mark completed

**Changed:** Phase 25 first item from `- [ ]` to `- [x]`.

## Verification

1. `npm run typecheck` — ✅ passes (EXIT: 0)
2. `npm run build` — ✅ passes (EXIT: 0)
3. `npm run test` — ✅ 243 tests pass across 10 test files (EXIT: 0)
