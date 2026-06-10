# Phase 92: List All Tags MCP Tool

## Date
2026-06-10

## Summary
Added `list_all_tags` MCP tool that wraps the existing `GET /api/tasks/tags` endpoint, enabling AI agents to discover all unique tags used across tasks in the system.

## Files Modified

### src/mcp-server/client.ts
- **Line 34**: `listAllTags()` already existed in the interface (added by prior session)
- **Line 520**: Implementation already existed (added by prior session)
- No changes needed — the method was already present from a previous phase

### src/mcp-server/tools.ts
- **Line 6333**: Added `list_all_tags` tool registration
- Tool accepts no input parameters (empty `inputSchema: {}`)
- Calls `client.listAllTags()` and returns tags array with count
- Error handling follows standard pattern (catch → isError response)

### test/mcp-server/tools.test.ts
- **Line 2092**: Added `listAllTags()` mock method returning `["bug", "feature", "urgent"]`
- **Line 2151**: Updated tool count assertion from 158 → 159
- **Line 5063**: Added 3 new tests:
  1. Registration test — verifies tool exists and description contains expected text
  2. Success test — verifies tags returned from mock client
  3. Error test — verifies error handling when client fails

### FEATURES.md
- Added Phase 92 section with 6 completed items

## Risk
Low — wraps an existing, tested API endpoint. No store/route changes needed.

## Verification
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm test` — 575 passed (12 files) ✅
