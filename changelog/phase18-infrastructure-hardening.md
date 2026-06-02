# Phase 18: Infrastructure Hardening — Changelog

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-06-02 |
| Task | Infrastructure Hardening |
| Files Modified | 4 |
| Lines Added | ~50 |
| Lines Removed | ~5 |

## Changes by File

### 1. `src/server/tasks/store.ts`

**Change 1: Added `cleanupProcessedEvents` and `healthCheck` to TaskStore interface**
- **Position**: Lines 6-21 (interface definition)
- **Before**: Interface had 10 methods
- **After**: Interface has 12 methods (added `cleanupProcessedEvents` and `healthCheck`)
- **Reason**: The `processed_events` table grows unbounded as every Feishu event creates a row. Without cleanup, the database will eventually consume excessive memory and disk. The health check method allows verifying DB connectivity beyond a simple `GET /health`.
- **Impact**: Any code implementing `TaskStore` must now implement these two new methods.

**Change 2: Enabled SQLite WAL mode**
- **Position**: Lines 57-62 (after `new DatabaseSync(storagePath)`)
- **Before**: No WAL mode set; default journal mode (DELETE)
- **After**: `PRAGMA journal_mode=WAL;` executed on database open
- **Reason**: WAL (Write-Ahead Logging) mode allows concurrent reads while a write is in progress. In the current architecture, the Feishu event handler writes tasks while MCP tools read them. WAL mode prevents read contention and improves throughput.
- **Impact**: Creates `.wal` and `.shm` sidecar files next to the SQLite database. These files are already in `.gitignore` via the `data/` directory exclusion.

**Change 3: Implemented `cleanupProcessedEvents(retentionDays)` method**
- **Position**: Lines 255-265 (new method in store return object)
- **Before**: No cleanup capability
- **After**: Deletes processed events older than `retentionDays` (default: 7 days)
- **Reason**: Prevents unbounded growth of the `processed_events` table.
- **Impact**: Returns the count of deleted rows for logging and monitoring.

**Change 4: Implemented `healthCheck()` method**
- **Position**: Lines 275-281 (new method in store return object)
- **Before**: No DB connectivity check
- **After**: Runs `SELECT 1` to verify the database is accessible; returns `true`/`false`
- **Reason**: The existing `/health` endpoint returned `{ ok: true }` without verifying the database. If the SQLite file becomes corrupted or the disk is full, the health check would still pass.
- **Impact**: Used by the improved health endpoint in routes.ts.

### 2. `src/server/tasks/routes.ts`

**Change 1: Improved health endpoint with DB connectivity check**
- **Position**: Lines 17-23 (GET /health handler)
- **Before**: `return reply.send({ ok: true })` — always returns OK
- **After**: Calls `store.healthCheck()` first; returns 503 with error if DB is unreachable
- **Reason**: A health check that always returns OK is useless for monitoring. This change makes the endpoint actually verify system health.
- **Impact**: Monitoring tools (UptimeRobot, Prometheus, etc.) will now receive 503 when the database is down.

**Change 2: Added POST /api/tasks/cleanup-events endpoint**
- **Position**: Lines 154-163 (new route after reset-stale)
- **Before**: No cleanup endpoint
- **After**: New authenticated endpoint that accepts `{ retentionDays?: number }` and deletes old processed events
- **Reason**: Provides a manual trigger for cleanup. Can be called via cron, admin tool, or monitoring system. Requires Bearer token auth for security.
- **Impact**: Returns `{ ok: true, deletedCount: number }` on success. Protected by the same auth middleware as other `/api/*` routes.

### 3. `test/server/tasks.store.test.ts`

**Changes**: Added 5 new test cases
- `cleanupProcessedEvents > returns 0 when no events to clean`
- `cleanupProcessedEvents > defaults to 7 days retention`
- `cleanupProcessedEvents > deletes events older than retention period`
- `healthCheck > returns true when database is accessible`
- `healthCheck > returns true after creating tasks`

**Reason**: Cover the new store methods with unit tests.

### 4. `test/server/integration.test.ts`

**Changes**: Added 2 new integration test cases
- `POST /api/tasks/cleanup-events returns deleted count`
- `POST /api/tasks/cleanup-events without auth returns 401`

**Reason**: Verify the cleanup endpoint works end-to-end through Fastify (auth + response format).

### 5. `FEATURES.md`

**Changes**: Updated Phase 18 items from `- [ ]` to `- [x]`

## Structural Summary

- **New methods**: `cleanupProcessedEvents(retentionDays?)`, `healthCheck()`
- **New API endpoint**: `POST /api/tasks/cleanup-events`
- **Changed behavior**: `GET /health` now checks DB connectivity
- **Changed DB config**: SQLite journal mode switched to WAL
- **New tests**: 7 (5 store unit tests + 2 integration tests)

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| WAL mode creates sidecar files | Low | `.wal` and `.shm` files are already excluded via `data/` gitignore |
| Health check 503 on DB corruption | Low | Correct behavior — alerts operators to problems |
| Cleanup endpoint could delete recent events if `retentionDays` is set to 0 | Low | Default is 7 days; endpoint requires auth |
| New interface methods break existing implementations | Low | Only one implementation exists (in-memory store in tests is mocked) |

## Verification Steps

```bash
cd /opt/harness-remote
npm run typecheck   # Must pass with exit 0
npm run build       # Must pass with exit 0
npm run test        # Must show 115 tests passing
```
