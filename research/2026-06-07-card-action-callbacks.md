# 2026-06-07 Feishu Card Action Callbacks Research

## Research Direction
Feishu/Lark interactive card callbacks — enabling users to take actions directly from task cards.

## Reference Projects

### 1. lark-coding-agent-bridge (⭐997)
- **URL**: https://github.com/zarazhangrui/lark-coding-agent-bridge
- **Key Feature**: Interactive cards with clickable buttons (`/help`, `/ws list`, `/status`)
- **Insight**: Users prefer clicking buttons over typing commands for common actions
- **Borrowed**: Button-based task lifecycle management (pick, complete, archive)

### 2. Feishu Open Platform Documentation
- **URL**: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication
- **Key Feature**: `card.action.trigger` callback with value-based action routing
- **Insight**: Cards support buttons, dropdowns, date pickers, and form containers
- **Implementation**: Button value carries `{ action, taskId }` for server-side routing

### 3. todo-for-ai (⭐1167)
- **URL**: https://github.com/todo-for-ai/todo-for-ai
- **Key Feature**: AI-native task management with MCP integration
- **Insight**: Task lifecycle should be manageable from both CLI and UI

## Implementation Decisions

### Why card action callbacks?
- **User experience**: Clicking a button is faster than typing `/pick task_123`
- **Discoverability**: Buttons are visible on every task card, no need to remember commands
- **Low risk**: Server already has `updateTaskStatus()` and `archiveTask()` — just wiring them up

### Why not update cards in-place?
- Feishu card update requires a response token with 30-minute expiry and max 2 updates
- Initial implementation returns toast only (simpler, no token management)
- Future enhancement: return updated card in response for in-place updates

### Button design
- **Pick Task** (primary/blue): Most common action, prominent placement
- **Mark Done** (default): Quick completion without typing result
- **Archive** (danger/red): Destructive action, visually distinct

## Next Research Directions
- Card form containers for structured input (priority picker, due date picker)
- Card update responses (return updated card on button click)
- Message queueing for rapid-fire messages
- File download API for bot-received files
