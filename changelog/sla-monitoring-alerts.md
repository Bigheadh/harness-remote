# SLA Monitoring and Alerts Feature

## Overview
| Date | Task | Files Modified | Lines Added | Lines Removed |
|------|------|----------------|-------------|---------------|
| 2026-06-02 | SLA monitoring and alerts | 6 | ~750 | 0 |

## Files Modified

### 1. `src/shared/types.ts`
- **Changes**: Added SLA-related type definitions
- **New Types**:
  - `SlaPolicy` — Defines SLA targets (target minutes, warning threshold, priority/tag matching)
  - `SlaBreachLog` — Records when tasks exceed SLA targets
  - `SlaBreachType` — Union type: "warning" | "breach"
  - `SlaStatus` — Per-task SLA status (ok, warning, breach, no_policy)
  - `SlaSummary` — Aggregate SLA metrics with per-policy breakdown

### 2. `src/server/tasks/store.ts`
- **Changes**: Added SLA database tables and method implementations
- **New Tables**:
  - `sla_policies` — Stores SLA policy definitions
  - `sla_breach_log` — Records SLA breach/warning events
- **New Methods** (9 total):
  - `createSlaPolicy()`, `listSlaPolicies()`, `getSlaPolicy()`, `updateSlaPolicy()`, `deleteSlaPolicy()`
  - `getSlaStatusForTask()`, `listSlaBreaches()`, `getSlaSummary()`, `checkAndRecordSlaBreaches()`
- **Helper Functions**:
  - `parsePriorities()` — JSON array parsing for policy matching
  - `rowToSlaPolicy()`, `rowToSlaBreachLog()` — DB row to type conversion

### 3. `src/server/tasks/routes.ts`
- **Changes**: Added SLA REST API endpoints
- **New Endpoints**:
  - `GET/POST /api/sla/policies` — List/create SLA policies
  - `GET/PUT/DELETE /api/sla/policies/:id` — CRUD for individual policies
  - `GET /api/sla/summary` — Aggregate SLA metrics
  - `GET /api/sla/breaches` — Breach log history
  - `POST /api/sla/check` — Trigger breach detection
  - `GET /api/tasks/:id/sla` — Per-task SLA status

### 4. `src/mcp-server/client.ts`
- **Changes**: Added SLA client methods to `TaskApiClient` interface and implementation
- **New Methods** (9 total): Mirror the store methods via HTTP client

### 5. `src/mcp-server/tools.ts`
- **Changes**: Added MCP tool definitions for SLA management
- **New Tools** (9 total):
  - `list_sla_policies`, `get_sla_policy`, `create_sla_policy`
  - `update_sla_policy`, `delete_sla_policy`
  - `get_sla_summary`, `list_sla_breaches`
  - `check_sla_breaches`, `get_task_sla_status`

### 6. `test/mcp-server/tools.test.ts`
- **Changes**: Updated mock client and tool count assertion
- **Mock Methods Added**: 9 SLA mock implementations
- **Tool Count**: Updated from 34 to 43

## Verification
- TypeCheck: ✅ Pass
- Build: ✅ Pass
- Tests: ✅ 223/223 pass

## Risk Assessment
- **Low Risk**: All new code follows existing patterns
- **Backward Compatible**: No breaking changes to existing APIs
- **Database Migration**: New tables only, no schema changes to existing tables

## Commit
```
feat: Add SLA monitoring and alerts feature

- Add SLA policy CRUD (create, read, update, delete)
- Add SLA breach detection and logging
- Add per-task SLA status tracking
- Add aggregate SLA summary metrics
- Add MCP tools for SLA management
- Add REST API endpoints for SLA operations
```
