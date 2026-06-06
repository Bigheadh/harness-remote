# Phase 42: Device Management MCP Tools

**Date**: 2026-06-06
**Task**: Add list_devices, get_device, delete_device MCP tools for full device lifecycle management
**Files modified**: 3 (+ FEATURES.md, changelog)
**Lines added**: ~200 | **Lines removed**: 0

## Per-File Changes

### 1. src/mcp-server/client.ts

| Change | Location | Before | After | Reason |
|--------|----------|--------|-------|--------|
| Import Device type | Line 1 | `import type { Task, TaskStatus, AuditLogEntry, AuditLogSearchOptions } from "../shared/types.js"` | Added `Device` to import | Client methods now return Device objects |
| Interface: listDevices | Line 122 | (none) | `listDevices(): Promise<Device[]>` | New interface method for listing devices |
| Interface: getDevice | Line 123 | (none) | `getDevice(deviceId: string): Promise<Device>` | New interface method for getting device details |
| Interface: deleteDevice | Line 124 | (none) | `deleteDevice(deviceId: string): Promise<void>` | New interface method for deleting devices |
| Implementation: listDevices | Line 302-318 | (none) | GET /api/devices → Device[] | HTTP client calling existing device list route |
| Implementation: getDevice | Line 320-336 | (none) | GET /api/devices/:id → Device | HTTP client calling existing device detail route |
| Implementation: deleteDevice | Line 338-352 | (none) | DELETE /api/devices/:id → void | HTTP client calling existing device delete route |

### 2. src/mcp-server/tools.ts

| Change | Location | Before | After | Reason |
|--------|----------|--------|-------|--------|
| Tool: list_devices | Line 364-400 | (none) | 37-line tool registration | AI agents can now discover available devices |
| Tool: get_device | Line 402-438 | (none) | 37-line tool registration with deviceId input | AI agents can inspect device details |
| Tool: delete_device | Line 440-476 | (none) | 37-line tool registration with deviceId input | AI agents can remove devices |

### 3. test/mcp-server/tools.test.ts

| Change | Location | Before | After | Reason |
|--------|----------|--------|-------|--------|
| Mock: listDevices | Line 270-282 | (none) | Mock returning 1 device | Test fixture for list_devices handler |
| Mock: getDevice | Line 284-295 | (none) | Mock returning device by ID | Test fixture for get_device handler |
| Mock: deleteDevice | Line 297-300 | (none) | Mock void implementation | Test fixture for delete_device handler |
| Assertion: tool count | Line 1260 | `toHaveLength(77)` | `toHaveLength(80)` | 3 new tools added |
| Test: list_devices registration | Line 2036-2040 | (none) | Verifies tool exists and description mentions device | Ensures tool is registered |
| Test: list_devices handler | Line 2042-2049 | (none) | Calls handler, verifies listDevices called, parses JSON | Verifies tool works end-to-end |
| Test: get_device registration | Line 2051-2055 | (none) | Verifies tool exists and description mentions device | Ensures tool is registered |
| Test: get_device handler | Line 2057-2065 | (none) | Calls handler with deviceId, verifies getDevice called | Verifies tool works end-to-end |
| Test: get_device error | Line 2067-2073 | (none) | Sets failWith, verifies isError=true | Verifies error handling |
| Test: delete_device registration | Line 2075-2079 | (none) | Verifies tool exists and description mentions device | Ensures tool is registered |
| Test: delete_device handler | Line 2081-2089 | (none) | Calls handler, verifies deleteDevice called, checks message | Verifies tool works end-to-end |
| Test: delete_device error | Line 2091-2097 | (none) | Sets failWith, verifies isError=true | Verifies error handling |

### 4. FEATURES.md

| Change | Location | Before | After | Reason |
|--------|----------|--------|-------|--------|
| Phase 42 section | End of file | (none) | 8 checkbox items | Track feature completion |

## Structural Summary

- **New**: 3 MCP tools (list_devices, get_device, delete_device)
- **New**: 3 client interface methods + implementations
- **New**: 9 test cases for device tool handlers
- **Modified**: Tool count assertion (77 → 80)
- **No breaking changes**: Additive only — existing register_device tool unchanged

## Risk

- **Low risk**: All changes are additive. Existing `register_device` tool and all other tools unaffected.
- API routes already existed — only the MCP layer was missing.
- Mock client additions follow established pattern (calls.push + return fixture).

## Verification

```bash
npm run typecheck   # ✅ passes
npm run build       # ✅ passes
npm test            # ✅ 303 tests pass (11 files)
```
