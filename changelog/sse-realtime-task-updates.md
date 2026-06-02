# Changelog: Server-Sent Events (SSE) for Real-Time Task Updates

## Overview

| Item | Detail |
|------|--------|
| Date | 2026-06-02 |
| Feature | SSE real-time task streaming |
| Files modified | 4 new, 3 modified |
| Lines added | ~280 |
| Lines removed | 0 |

## Changes by File

### New Files

#### `src/server/sse/broadcaster.ts`
- **Purpose**: SSE event broadcasting engine
- **Before**: N/A (new file)
- **After**: Event emitter pool that manages connected SSE clients, sends typed events with `event:` and `data:` fields, auto-cleans dead connections, sends heartbeats every 30s
- **Key exports**: `addClient()`, `removeClient()`, `broadcast()`, `broadcastTaskCreated()`, `broadcastTaskUpdated()`, `broadcastTaskDeleted()`, `broadcastTaskStatusChanged()`, `broadcastTaskResultReported()`, `broadcastTaskAssigned()`, `getClientCount()`
- **Risk**: Low — self-contained module, no side effects beyond SSE connections

#### `src/server/sse/routes.ts`
- **Purpose**: SSE endpoint registration
- **Before**: N/A (new file)
- **After**: Registers `GET /api/tasks/stream` (authenticated SSE endpoint with optional event filter via `?events=` query param) and `GET /api/sse/status` (connection count)
- **Auth**: Accepts bearer token via header or query param (SSE in browsers can't set custom headers)
- **Risk**: Low — standard SSE pattern

### Modified Files

#### `src/server/index.ts`
- **Line 25**: Added import for `registerSseRoutes`
- **Line 98**: Added `registerSseRoutes(server, config.personalToken)` call after stats routes
- **Reason**: Wire up SSE endpoint on server startup
- **Impact**: Server now serves SSE endpoint

#### `src/server/feishu/events.ts`
- **Line 8**: Added import for `broadcastTaskCreated` from `../sse/broadcaster.js`
- **Line 344-345**: Added `broadcastTaskCreated(task)` call after `store.createTask(task)`
- **Reason**: Broadcast new task events to all connected SSE clients in real-time
- **Impact**: Every new Feishu task triggers an SSE `task.created` event

#### `src/server/tasks/routes.ts`
- **Lines 15-21**: Added imports for 5 broadcast functions from `../sse/broadcaster.js`
- **Line 626-627**: Added `broadcastTaskStatusChanged(task, previousStatus ?? "")` in POST /api/tasks/:id/status handler
- **Line 695-696**: Added `broadcastTaskResultReported(task, body.success, body.summary)` in POST /api/tasks/:id/result handler
- **Line 749-750**: Added `broadcastTaskAssigned(task, body.deviceId.trim())` in POST /api/tasks/:id/assign handler
- **Lines 463-468**: Added loop broadcasting `broadcastTaskDeleted(taskId)` for each successfully deleted task in POST /api/tasks/bulk/delete handler
- **Reason**: Real-time notification for all task mutation operations
- **Impact**: Connected SSE clients receive instant updates on task changes

## Structural Summary

- **New module**: `src/server/sse/` — broadcaster engine + route registration
- **Modified modules**: 3 existing files (index, feishu events, task routes)
- **No new dependencies** — uses native Node.js SSE pattern (text/event-stream)
- **No new DB tables** — SSE is stateless server-side

## Risk Assessment

- **Low risk** — SSE is a unidirectional push mechanism with no database mutations
- **Connection cleanup** — Dead clients are auto-removed on write failure
- **Memory** — Client map is in-memory; bounded by concurrent connections (no persistence)
- **Auth** — SSE endpoint requires valid bearer token (header or query param)
- **Heartbeat** — 30s keepalive prevents proxy/browser timeouts

## Verification

1. `npm run typecheck` — passes
2. `npm run build` — passes
3. Manual test: connect via `curl -N "http://localhost:PORT/api/tasks/stream?token=TOKEN"` and observe events when tasks are created/updated
4. Verify `/api/sse/status` returns connected client count
