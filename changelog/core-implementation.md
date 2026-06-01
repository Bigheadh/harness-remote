# Changelog: Core Implementation (Phases 1-12)

**Date**: 2026-06-01
**Task**: Implement Phases 1-12 of harness-remote
**Files Modified**: 14 source files, 2 config files, 1 docs, 1 tracker
**Lines Added**: ~7,271
**Lines Removed**: 0

## Overview

Implemented the complete harness-remote project from skeleton to functional code. Phases 1-12 cover all source code: shared layer, server, Feishu integration, and MCP server.

## Files Changed

### Modified Files
| File | Change | Reason | Risk |
|------|--------|--------|------|
| `tsconfig.json` | Changed `"types": []` to `"types": ["node"]` | Enable Node.js type definitions for `node:fs`, `node:sqlite` imports | Low |
| `package.json` | Added dependencies: fastify, @modelcontextprotocol/sdk, vitest, zod | Required for HTTP server, MCP SDK, testing, schema validation | None |
| `FEATURES.md` | Marked Phases 1-12 as complete | Track implementation progress | None |

### Created/Replaced Source Files
| File | Change | Reason |
|------|--------|--------|
| `src/shared/http.ts` | Replaced TODO stub with `requireBearerToken()` | Bearer token validation for API auth |
| `src/server/config.ts` | Replaced TODO stub with full config loader | Load and validate server.json with field checks |
| `src/server/tasks/store.ts` | Replaced TODO stub with SQLite-backed TaskStore | Persistent task storage with state machine |
| `src/server/tasks/routes.ts` | Replaced TODO stub with Fastify routes | API endpoints for task CRUD |
| `src/server/feishu/events.ts` | Replaced TODO stub with event processing + route registration | Feishu webhook handling |
| `src/server/feishu/client.ts` | Replaced TODO stub with Feishu reply client | Reply to Feishu messages via API |
| `src/server/index.ts` | Replaced TODO stub with Fastify bootstrap | Server startup, config, shutdown |
| `src/mcp-server/config.ts` | Replaced TODO stub with MCP config loader | Load and validate mcp.json |
| `src/mcp-server/client.ts` | Replaced TODO stub with HTTP client | MCP server calls server API |
| `src/mcp-server/tools.ts` | Replaced TODO stub with 5 MCP tools | Tools for Codex CLI integration |
| `src/mcp-server/index.ts` | Replaced TODO stub with MCP server bootstrap | Stdio MCP server startup |

## Structural Summary

- **New**: Bearer token validation, config loading (server + MCP), SQLite task store, task API routes, Feishu event processing, Feishu reply client, MCP HTTP client, 5 MCP tools
- **Modified**: tsconfig.json (types), package.json (deps), FEATURES.md (progress)
- **Refactored**: events.ts (combined parsing + route registration to avoid circular imports)

## Key Decisions

1. Combined Feishu event parsing and route registration in `events.ts` to avoid circular dependency issues
2. Used `registerTool()` with Zod v4 schemas (MCP SDK v1.29.0 API) instead of deprecated `server.tool()`
3. SQLite store uses `node:sqlite` `DatabaseSync` (synchronous API) as specified
4. Config validation includes URL checks, minimum token length, and required field assertions
5. Feishu event handler returns 200 immediately for non-actionable events (dedup, allowlist) to avoid retries

## Verification

- `npm run typecheck`: ✅ PASS
- `npm run build`: ✅ PASS
- `git commit`: ✅ b640a02
- `git push`: ⏳ Pending (network timeout, will retry next run)

## Next Steps

- Phase 13: Write unit tests (http.test.ts, tasks.store.test.ts, feishu.events.test.ts, tools.test.ts)
- Phase 14: Polish and deploy (README, deploy script, error logging)
