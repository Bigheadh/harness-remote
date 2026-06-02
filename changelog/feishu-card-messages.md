# Changelog: Feishu Card Message Format

**Date:** 2026-06-03
**Task:** Implement rich card notifications for Feishu messages
**Files Modified:** 5
**Lines Added:** ~180
**Lines Removed:** ~15

## Overview

Replaced plain-text-only Feishu replies with rich interactive card messages.
Cards provide structured, visually distinct notifications for task lifecycle events.

## File Changes

### 1. `src/server/feishu/card-builder.ts` (NEW)
- **Before:** Did not exist
- **After:** Complete card builder module with 5 exported functions:
  - `buildTaskCreatedCard()` — blue header card with command, priority, tags, due date
  - `buildTaskResultCard()` — green/red header card with success/failure status, summary, details
  - `buildTaskStatusCard()` — color-themed card showing status transitions
  - `buildCustomCard()` — generic card from title + markdown body
  - `serializeCard()` — JSON serialization for Feishu API
- **Reason:** Centralized card construction logic, reusable across all reply points
- **Impact:** All Feishu notification points can now send rich cards

### 2. `src/server/feishu/client.ts` (MODIFIED)
- **Before:** Interface had only `replyToMessage()` for plain text
- **After:** Added `sendCardMessage()` method to `FeishuReplyClient` interface and implementation
  - New `FeishuSendCardInput` interface with `messageId` and `card` fields
  - Uses `msg_type: "interactive"` instead of `msg_type: "text"`
  - Serializes card object via `serializeCard()`
- **Reason:** Feishu API requires different msg_type and content format for cards
- **Impact:** All consumers can now choose between text and card replies

### 3. `src/server/feishu/events.ts` (MODIFIED)
- **Before:** Task creation returned 201 with no Feishu reply
- **After:** Sends a task-created card confirmation to the original chat
  - Added `FeishuReplyClient` parameter to `registerFeishuRoutes()`
  - Imports `buildTaskCreatedCard` from card-builder
  - After task creation, sends card asynchronously (fire-and-forget with error logging)
- **Reason:** Users want visual confirmation that their task was received
- **Impact:** Every new task from Feishu now gets a rich card acknowledgment

### 4. `src/server/tasks/routes.ts` (MODIFIED)
- **Before:** POST /api/tasks/:id/result saved result but sent no Feishu reply;
  POST /api/tasks/:id/reply only supported plain text
- **After:**
  - Result endpoint now auto-sends a task-result card to Feishu (green/red themed)
  - Reply endpoint now accepts optional `format: "card"` and `title` fields
  - When format=card, sends interactive card instead of plain text
  - Audit log now includes format information
- **Reason:** Task results should be visually distinct; callers may want card-format replies
- **Impact:** Automatic result notifications + flexible reply format

### 5. `src/server/index.ts` (MODIFIED)
- **Before:** `registerFeishuRoutes()` called without feishuClient
- **After:** Passes `feishuClient` to `registerFeishuRoutes()`
- **Reason:** Feishu events handler needs the client to send card confirmations
- **Impact:** Wires up the card-sending capability to the event handler

### 6. `test/server/feishu.card-builder.test.ts` (NEW)
- **Before:** Did not exist
- **After:** 17 tests covering all card builder functions
  - Task created card: basic info, command, priority, tags, due date, task ID
  - Task result card: success/failure, summary, details presence/absence
  - Task status card: status transitions, color themes
  - Custom card: title, body, default template
  - Serialization: valid JSON output
- **Reason:** Verify card construction logic is correct
- **Impact:** All card builder behavior is tested

## Risk Assessment
- **Low risk:** Card sending is fire-and-forget (non-blocking, errors logged but don't fail the request)
- **Backward compatible:** Existing plain-text reply still works as default; card format is opt-in for the reply endpoint
- **No breaking changes:** All existing tests pass (243/243)

## Verification
- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [x] `npm run test` — 243 tests pass (226 existing + 17 new)
- [x] No breaking changes to existing API contracts
