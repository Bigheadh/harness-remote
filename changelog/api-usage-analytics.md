# Changelog: API Usage Analytics

**Date:** 2026-06-03
**Feature:** API usage analytics — track request counts, response times, error rates per user/device
**Files modified:** 6 new, 4 modified
**Lines added:** ~350 | **Lines removed:** ~2

## Overview

| Metric | Value |
|--------|-------|
| New files | 4 (store, middleware, routes, +1 test update) |
| Modified files | 6 (types, client, tools, index, test, features) |
| Total tests | 267 (6 new) |

## File Changes

### 1. `src/shared/types.ts` — New interfaces

**Added:** `ApiUsageEntry`, `ApiUsageCallerStats`, `ApiUsageStats` interfaces (lines 407-457)

- `ApiUsageEntry`: raw request record (callerId, method, path, statusCode, durationMs, timestamp)
- `ApiUsageCallerStats`: aggregated stats per caller (totalRequests, errorRequests, errorRate, avgDurationMs, medianDurationMs, p95DurationMs, byStatus, byMethod, byPath, lastRequestAt)
- `ApiUsageStats`: top-level summary (totalRequests, from, to, callers[], slowestEndpoints[])

**Reason:** Define the data contracts for the usage analytics feature across all layers.

**Risk:** Low — additive types only, no existing types modified.

### 2. `src/server/apiusage/store.ts` — New SQLite store

**Created:** Full SQLite-backed store with WAL mode (263 lines)

- `api_usage` table: id, caller_id, method, path, status_code, duration_ms, timestamp
- Indexes on timestamp and caller_id for efficient queries
- `recordRequest()`: INSERT a single request record
- `getStats(from?, to?)`: Aggregated stats with per-caller breakdown, percentile calculation, status/method/path breakdowns, top 10 slowest endpoints
- `getEntriesForCaller(callerId, limit?)`: Raw entries for debugging
- `getCount()`: Total tracked requests

**Reason:** Persistent storage for per-user/device analytics. SQLite chosen for consistency with the rest of the project.

**Risk:** Low — new isolated store, no impact on existing stores. WAL mode for read concurrency.

### 3. `src/server/apiusage/middleware.ts` — Fastify usage tracking hook

**Created:** onRequest + onResponse hooks (91 lines)

- `deriveCallerId()`: Extracts caller identity from authCtx.user.id, deviceId query param, token hash, or IP fallback (same priority as rate limiter)
- `normalizePath()`: Replaces UUID/ID segments with `:id` for metric aggregation
- Only tracks `/api/*` and `/feishu/*` routes
- Records usage after response via `usageStore.recordRequest()`
- Wrapped in try/catch — usage tracking failures don't affect responses

**Reason:** Transparent middleware that captures per-request usage data without modifying existing code.

**Risk:** Low — hook runs after auth, failures are silently swallowed.

### 4. `src/server/apiusage/routes.ts` — API endpoints

**Created:** Two authenticated endpoints (122 lines)

- `GET /api/usage/stats` — Aggregated usage stats with optional `from`/`to` time filters. Requires `audit.read` permission.
- `GET /api/usage/entries/:callerId` — Raw request entries for a specific caller. Requires `audit.read` permission.
- Auth hook shared across both routes (same pattern as audit routes).

**Reason:** HTTP API for querying usage analytics from dashboards or scripts.

**Risk:** Low — new route module, registered after existing routes.

### 5. `src/server/index.ts` — Server bootstrap wiring

**Modified:** Added imports, store creation, route registration, and hook registration

- Imports: `createApiUsageStore`, `registerUsageTrackingHook`, `registerUsageRoutes`
- Store creation: `usageStoragePath` derived from main storage path (`.usage.sqlite`)
- Route registration: `registerUsageRoutes(server, usageStore, ...)`
- Hook registration: `registerUsageTrackingHook(server, usageStore)` — registered AFTER routes

**Reason:** Wire up the new feature into the server bootstrap.

**Risk:** Low — additive changes to index.ts. Usage tracking hook registered after routes (correct hook ordering).

### 6. `src/mcp-server/client.ts` — MCP client method

**Modified:** Added `getApiUsageStats` to `TaskApiClient` interface and implementation

- Interface: `getApiUsageStats(from?: string, to?: string): Promise<Record<string, unknown>>`
- Implementation: GET `/api/usage/stats` with optional time filters

**Reason:** Enable MCP tools to query usage analytics.

**Risk:** Low — additive interface method + implementation.

### 7. `src/mcp-server/tools.ts` — MCP tool

**Modified:** Added `get_api_usage` tool registration (45 lines)

- Tool name: `get_api_usage`
- Input schema: optional `from` and `to` strings (ISO 8601)
- Calls `client.getApiUsageStats(from, to)` and returns the stats JSON

**Reason:** Expose usage analytics to Codex CLI via MCP.

**Risk:** Low — new tool, no existing tools modified.

### 8. `test/mcp-server/tools.test.ts` — Test updates

**Modified:**
- Added `escalateOverduePriorities()` and `getApiUsageStats()` to mock client
- Updated tool count assertion from 65 → 66
- Added 6 new tests:
  - `get_api_usage` tool registration and description
  - `get_api_usage` handler returns stats
  - `get_api_usage` passes time filters
  - `get_api_usage` error handling
  - `escalate_overdue_priorities` tool registration
  - `escalate_overdue_priorities` handler call

**Reason:** Cover the new tool and fix missing mock methods for `escalateOverduePriorities`.

**Risk:** Low — additive tests.

## Structural Summary

- **New modules:** `src/server/apiusage/` (store, middleware, routes)
- **New types:** `ApiUsageEntry`, `ApiUsageCallerStats`, `ApiUsageStats`
- **New API endpoints:** `GET /api/usage/stats`, `GET /api/usage/entries/:callerId`
- **New MCP tool:** `get_api_usage`
- **New SQLite file:** `.usage.sqlite` (auto-created on startup)

## Verification

1. `npm run typecheck` — PASS
2. `npm run build` — PASS
3. `npm run test` — 267/267 PASS (6 new tests)
4. All existing tests unaffected
