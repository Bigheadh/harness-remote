# Phase 65: Feishu Card Update (Streaming Cards)

**Date**: 2026-06-07
**Feature**: AI agents can now update existing Feishu interactive cards in real-time

## Overview

| Metric | Value |
|--------|-------|
| Files Modified | 5 |
| Lines Added | ~90 |
| Lines Removed | 0 |
| MCP Tools Added | 1 (update_task_card) |
| Tool Count | 137 → 138 |
| Tests | All 502 passing |

## Per-File Changes

### 1. src/server/feishu/client.ts

**Change**: Added `FeishuUpdateCardInput` interface and `updateCardMessage` method to `FeishuReplyClient`

**Before**:
```typescript
export interface FeishuReplyClient {
  replyToMessage(input: FeishuReplyInput): Promise<void>;
  sendCardMessage(input: FeishuSendCardInput): Promise<void>;
  sendDirectCardMessage(input: FeishuDirectCardInput): Promise<void>;
  downloadFile(...): Promise<...>;
}
```

**After**:
```typescript
export interface FeishuUpdateCardInput {
  messageId: string;
  card: FeishuCard;
}

export interface FeishuReplyClient {
  replyToMessage(input: FeishuReplyInput): Promise<void>;
  sendCardMessage(input: FeishuSendCardInput): Promise<void>;
  sendDirectCardMessage(input: FeishuDirectCardInput): Promise<void>;
  updateCardMessage(input: FeishuUpdateCardInput): Promise<void>;
  downloadFile(...): Promise<...>;
}
```

Implementation calls `PATCH /open-apis/im/v1/messages/:message_id` with serialized card content. Follows existing `sendCardMessage` pattern with error handling and metrics recording.

**Reason**: Enables real-time card updates — the core "streaming card" pattern from lark-coding-agent-bridge.
**Impact**: All FeishuReplyClient consumers now have access to card update capability.

### 2. src/server/tasks/routes.ts

**Change**: Added `PUT /api/tasks/:id/card` route handler

**Before**: No card update endpoint existed.

**After**: New route that:
1. Authenticates and authorizes (tasks.write permission)
2. Checks Feishu client availability (503 if not configured)
3. Validates markdown input (400 if missing)
4. Looks up task by ID (404 if not found)
5. Checks task has a Feishu message ID (400 if not)
6. Builds a card with `buildCustomCard()` using provided markdown, title, and color
7. Calls `feishuClient.updateCardMessage()` to update the existing card

**Reason**: Provides the server-side API that the MCP client calls.
**Impact**: New endpoint, no existing routes affected.

### 3. src/mcp-server/client.ts

**Change**: Added `updateTaskCard` to `TaskApiClient` interface and implementation

**Before**: No card update method in MCP client.

**After**:
```typescript
// Interface
updateTaskCard(taskId: string, markdown: string, title?: string, color?: string): Promise<{ success: boolean; messageId: string }>;

// Implementation
async updateTaskCard(...) {
  const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/card`, {
    method: "PUT", headers, body: JSON.stringify({ markdown, title, color }),
  });
  ...
}
```

**Reason**: MCP client layer bridges MCP tools to server API.
**Impact**: New method, no existing methods affected.

### 4. src/mcp-server/tools.ts

**Change**: Added `update_task_card` MCP tool registration (tool #138)

**Before**: 137 tools registered.

**After**: 138 tools registered.

**Tool definition**:
- Name: `update_task_card`
- Description: "Update the Feishu interactive card for a task with new markdown content..."
- Input: `taskId` (required), `markdown` (required), `title` (optional), `color` (optional enum)
- Calls `client.updateTaskCard()` and returns the result

**Reason**: Exposes card update to AI agents via MCP protocol.
**Impact**: New tool, no existing tools affected.

### 5. test/mcp-server/tools.test.ts

**Change**: Added mock `updateTaskCard` method and updated tool count assertion

**Before**: 137 tools assertion, no `updateTaskCard` in mock.

**After**: 138 tools assertion, mock returns `{ success: true, messageId: "msg_001" }`.

**Reason**: Mock must satisfy TaskApiClient interface; tool count must match actual registrations.
**Impact**: Tests pass with new tool.

## Risk Assessment

**Risk Level**: Low
- New interface method on FeishuReplyClient — all existing consumers unaffected (optional interface)
- New API route — no existing routes affected
- New MCP tool — no existing tools affected
- Feishu PATCH API is a standard, well-documented endpoint
- Card update is idempotent (safe to retry)

**Potential Issues**:
- If the original Feishu message was deleted, the PATCH will fail (handled with error propagation)
- Card content must be valid JSON — the `buildCustomCard` helper ensures this
- Rate limiting on Feishu API may affect rapid card updates (existing rate handling applies)

## Verification

1. ✅ `npm run typecheck` — passes
2. ✅ `npm run build` — passes  
3. ✅ `npm test` — all 502 tests pass
4. ✅ Tool count: 138 registered
5. ✅ Mock client: `updateTaskCard` method present
