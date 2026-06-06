# Phase 50: Task Watcher Notifications

## Overview
| Item | Detail |
|------|--------|
| Date | 2026-06-07 |
| Feature | Task Watcher Feishu Notifications |
| Files Modified | 4 |
| Lines Added | ~120 |
| Lines Removed | ~5 |

## Changes by File

### 1. `src/server/feishu/client.ts`
- **Added**: `FeishuDirectCardInput` interface (`feishuUserId: string`, `card: FeishuCard`)
- **Added**: `sendDirectCardMessage` method to `FeishuReplyClient` interface
- **Added**: Implementation using Feishu `POST /open-apis/im/v1/messages?receive_id_type=user_id` endpoint
- **Reason**: Watchers need direct Feishu messages, not replies to original task messages
- **Impact**: Enables sending card notifications to any user by their Feishu user ID

### 2. `src/server/feishu/card-builder.ts`
- **Added**: `buildWatcherNotificationCard(task, previousStatus, newStatus, watcherUsername)` function
- **Added**: Rich card with task ID, command, status transition (Previous → New), priority, tags, description (truncated at 200 chars)
- **Reason**: Watchers need a clear notification showing what changed and why it matters
- **Impact**: New card type for watcher notifications, follows existing card-builder patterns

### 3. `src/server/tasks/routes.ts`
- **Added**: Watcher notification logic in single task status update route (POST /api/tasks/:id/status)
- **Added**: Watcher notification logic in bulk status update route (POST /api/tasks/bulk/status)
- **Added**: Import for `buildWatcherNotificationCard`
- **Reason**: Task watchers (Phase 49) had CRUD but no notification — gap pattern #8
- **Impact**: When task status changes, all watchers with linked Feishu user IDs receive direct card notifications

### 4. `test/server/feishu.card-builder.test.ts`
- **Added**: 9 new tests for `buildWatcherNotificationCard`
- **Added**: Import for `buildWatcherNotificationCard`
- **Tests cover**: card structure, status transition display, task ID/command, priority, tags (present/absent), description (present/truncated), JSON serialization
- **Reason**: Verify card builder produces correct Feishu card format

## Risk Assessment
- **Low risk**: Additive feature — no existing behavior changed
- **Feishu API dependency**: Direct message sending requires valid Feishu app credentials and user bindings
- **Graceful degradation**: Notifications are fire-and-forget (`.catch()`), failures don't block status updates
- **User lookup**: Only notifies watchers who have a linked `feishuUserId` in their User record

## Verification
- [x] `npm run typecheck` — passes
- [x] `npm run build` — passes
- [x] `npm test` — 396 tests pass (9 new)
- [x] No TODO/FIXME introduced
