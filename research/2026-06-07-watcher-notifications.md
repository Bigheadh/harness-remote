# Research: Task Watcher Notifications — Gap Analysis

## Date: 2026-06-07

## Discovery
Phase 49 implemented Task Watchers (CRUD: add/remove/list watchers per task), but the feature had a critical gap: **no notifications were sent to watchers when task status changed**. Users could subscribe to tasks but never received updates.

## Gap Pattern: Cross-system notification gaps (#8)
The watcher system recorded subscriptions in the database, but the status update route only sent Feishu notifications based on the `notifyOnStatusChange` config (which notifies the task creator's chat). Individual watchers with linked Feishu user IDs received nothing.

## Solution: Phase 50 — Task Watcher Notifications

### Feishu Direct Message API
- Endpoint: `POST /open-apis/im/v1/messages?receive_id_type=user_id`
- Sends a card message directly to a user (not a reply to an existing message)
- Requires the user's Feishu `open_id` (stored as `feishuUserId` in the User model)

### Implementation
1. Added `sendDirectCardMessage` to `FeishuReplyClient` interface
2. Created `buildWatcherNotificationCard` card builder function
3. Wired notification logic into both single and bulk status update routes
4. Notifications are fire-and-forget (`.catch()` — failures don't block status updates)

### Design Decisions
- **Direct messages vs replies**: Replies only work in the original chat. Watchers may not be in that chat. Direct messages ensure delivery regardless of chat membership.
- **User lookup required**: Watchers are stored by internal `userId`, but Feishu needs `feishuUserId`. The route looks up each watcher's User record to get the Feishu ID.
- **Graceful skip**: If a watcher has no `feishuUserId` linked, they're silently skipped. No error, no notification.

## Reference Projects
- **Linear**: Sends in-app + email notifications for task updates to followers
- **Plane**: Real-time notifications via WebSocket for subscribed users
- **n8n**: Webhook-based notifications for workflow state changes

## Files Modified
- `src/server/feishu/client.ts` — new `sendDirectCardMessage` method
- `src/server/feishu/card-builder.ts` — new `buildWatcherNotificationCard` function
- `src/server/tasks/routes.ts` — watcher notification logic in status update routes
- `test/server/feishu.card-builder.test.ts` — 9 new tests
- `changelog/phase-50-watcher-notifications.md` — detailed changelog

## Next Research Directions
- Email notification channel (for watchers without Feishu)
- Notification preferences per watcher (which status changes to notify about)
- Batch notification digest (accumulate changes, send periodic summary)
