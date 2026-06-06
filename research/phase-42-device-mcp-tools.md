# Phase 42 Research: Device Management MCP Tools

## Gap Detection

Used the "API routes without MCP tools" pattern (skill gap #6):

```
# Device API routes found:
POST /api/devices          → register (MCP tool existed ✓)
GET  /api/devices          → list (NO MCP tool ✗)
GET  /api/devices/:id      → get (NO MCP tool ✗)
DELETE /api/devices/:id    → delete (NO MCP tool ✗)
```

Only `register_device` MCP tool existed. AI agents couldn't discover, inspect, or remove devices — making multi-device task routing a black box.

## Implementation

- **Client layer**: Added `listDevices()`, `getDevice()`, `deleteDevice()` to `TaskApiClient` interface and implementation
- **Tools layer**: Added `list_devices`, `get_device`, `delete_device` MCP tools with Zod input schemas
- **Tests**: 9 new test cases (registration, happy path, error handling for each tool)

## Next Research Directions

1. **Stats/Analytics MCP tools** — GET /api/stats/summary, /api/stats/timeseries, /api/stats/processing, /api/stats/users have no MCP tools. AI agents can't query task statistics.
2. **Audit cleanup MCP tool** — /api/audit/cleanup exists but no MCP tool for it.
3. **Event cleanup MCP tool** — /api/tasks/cleanup-events exists but no MCP tool.
4. **User management MCP tools** — /api/users CRUD exists but no MCP tools.
