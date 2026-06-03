# Task Attachment Download

**Date**: 2026-06-03
**Feature**: GET /api/tasks/:id/attachments/:attachmentIndex — download task attachment files from Feishu
**Files Modified**: 5
**Lines Added**: ~120
**Lines Removed**: ~5

## Overview

Added an API endpoint and MCP tool to download file attachments stored on Feishu. Attachments are referenced by metadata (fileKey, fileName, fileType) on the Task object, but the actual binary content is fetched live from Feishu's IM resource download API.

## Per-File Changes

### 1. `src/server/feishu/client.ts`
**Risk**: Medium — new method makes external HTTP call to Feishu API
**Before**: `FeishuReplyClient` interface had `replyToMessage` and `sendCardMessage`
**After**: Added `downloadFile(messageId, fileKey, type)` method that:
- Calls `GET /open-apis/im/v1/messages/{message_id}/resources/{file_key}?type={type}`
- Returns `{ buffer, contentType, fileName }`
- Extracts filename from Content-Disposition header
- Uses cached tenant access token (same as other methods)

### 2. `src/server/tasks/routes.ts`
**Risk**: Low — new route only, no changes to existing routes
**Before**: No attachment download endpoint
**After**: Added `GET /api/tasks/:id/attachments/:attachmentIndex` that:
- Validates auth (tasks.read permission)
- Checks Feishu client is configured (returns 503 if not)
- Validates attachmentIndex is non-negative integer
- Fetches task, validates attachment exists at given index
- Maps FeishuFileType to Feishu API resource type (file/image/audio/media)
- Streams binary response with Content-Type, Content-Disposition, Content-Length headers
- Returns 502 with error details if Feishu download fails

### 3. `src/mcp-server/client.ts`
**Risk**: Low — new client method
**Before**: `TaskApiClient` interface did not have attachment download
**After**: Added `downloadAttachment(taskId, attachmentIndex)` method that:
- Calls `GET /api/tasks/{taskId}/attachments/{attachmentIndex}`
- Returns `{ fileName, contentType, base64Data }` (base64 for MCP text transport)

### 4. `src/mcp-server/tools.ts`
**Risk**: Low — new tool registration
**Before**: 60 MCP tools registered
**After**: 61 MCP tools — added `download_attachment` tool with:
- Input: taskId (string), attachmentIndex (number, min 0)
- Returns: fileName, contentType, sizeBytes, base64Data, message
- Error handling with isError flag

### 5. `test/mcp-server/tools.test.ts`
**Risk**: None — test only
**Changes**:
- Added `downloadAttachment` mock method to `createMockClient()`
- Updated tool count assertion from 60 → 61
- Added 3 tests: registration check, successful download, error handling

## Verification
- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — 246/246 tests pass (10 test files)
