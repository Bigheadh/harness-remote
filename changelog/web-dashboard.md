# Changelog: Web Management Dashboard (Read-Only Task Viewer)

**Date**: 2026-06-02  
**Feature**: Phase 19 — Web management dashboard  
**Files modified**: 4  
**Lines added**: ~280  
**Lines removed**: 0  

## Overview

| Item | Detail |
|------|--------|
| Task | Implement read-only web dashboard for task management |
| Files changed | 4 |
| New files | 3 (`src/server/dashboard/routes.ts`, `src/server/dashboard/templates/dashboard.ts`) |
| Modified files | 2 (`src/server/tasks/store.ts`, `src/server/index.ts`) |
| Tests | 141 passed (existing + no regressions) |

## File-by-File Changes

### 1. `src/server/tasks/store.ts` (Modified)

**Change A**: Added `TaskCounts` interface  
- **Location**: After `SearchOptions` interface (line ~12)  
- **Before**: N/A  
- **After**: New interface with `total`, `pending`, `picked`, `running`, `done`, `failed` fields  
- **Reason**: Dashboard needs aggregated status counts for stat cards  
- **Impact**: Extends `TaskStore` interface contract  

**Change B**: Added `countTasksByStatus()` to `TaskStore` interface  
- **Location**: Interface definition (line ~37)  
- **Before**: Interface did not include this method  
- **After**: `countTasksByStatus(): Promise<TaskCounts>` added  
- **Reason**: Dashboard stats API needs this query  

**Change C**: Implemented `countTasksByStatus()` in store factory  
- **Location**: Return object of `createTaskStore()` (line ~365)  
- **Before**: N/A  
- **After**: SQL `GROUP BY status` query returning aggregated counts  
- **Reason**: Provides efficient single-query status distribution  
- **Risk**: Low — read-only aggregate query, no mutation  

### 2. `src/server/dashboard/routes.ts` (New)

- **Purpose**: Fastify route registration for `/dashboard` and `/dashboard/stats`  
- **Auth**: Supports both `Authorization: Bearer <token>` header and `?token=<token>` query param (for browser URL access)  
- **Routes**:
  - `GET /dashboard` — Serves the HTML dashboard page  
  - `GET /dashboard/stats` — Returns task count JSON  
- **Design decisions**:
  - Token query param auth allows bookmarkable dashboard URLs
  - Dashboard HTML uses client-side JS to call existing `/api/tasks/*` endpoints
  - No server-side rendering of task data — keeps routes thin

### 3. `src/server/dashboard/templates/dashboard.ts` (New)

- **Purpose**: Generates complete HTML page with embedded CSS and vanilla JS  
- **Features**:
  - Dark theme UI matching modern dashboard aesthetics  
  - Status stat cards (Total, Pending, Picked, Running, Done, Failed)  
  - Clickable stat cards to filter by status  
  - Task table with ID, status badge, priority badge, command text, timestamps  
  - Text search across command, ID, and result summary  
  - Status and priority dropdown filters  
  - Task detail modal overlay (click any row)  
  - Detail modal shows all task fields including attachments  
  - Auto-refresh every 30 seconds  
  - Responsive layout for mobile  
  - Escape key closes detail modal  
- **No external dependencies**: Pure HTML/CSS/JS, no React/Vue/etc.

### 4. `src/server/index.ts` (Modified)

- **Change A**: Added import for `registerDashboardRoutes`  
- **Change B**: Called `registerDashboardRoutes(server, store, config.personalToken, config.publicBaseUrl)` after existing route registrations  
- **Reason**: Wires dashboard into server startup  
- **Risk**: None — new route, no existing routes affected  

## Structural Summary

- **New**: `src/server/dashboard/` directory with 2 files  
- **Modified**: `TaskStore` interface + implementation (1 new method)  
- **Modified**: Server bootstrap (1 new import + 1 function call)  

## Risk Assessment

- **Low risk**: All changes are additive — no existing routes or behavior modified  
- **Auth**: Dashboard uses same `personalToken` as API, no new secrets  
- **Performance**: Dashboard fetches tasks via existing `/api/tasks` endpoint (already working)  
- **Auto-refresh**: 30-second interval is conservative, no WebSocket needed  

## Verification Steps

1. ✅ `npm run typecheck` — passes (exit 0)  
2. ✅ `npm run build` — passes (exit 0)  
3. ✅ `npm run test` — 141/141 tests pass  
4. Manual verification: Access `http://<server>:<port>/dashboard?token=<token>` in browser  
5. Verify stat cards show correct counts  
6. Verify task table loads and filters work  
7. Verify task detail modal opens on row click  
