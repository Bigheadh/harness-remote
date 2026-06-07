# Research: Feishu Card Update (Streaming Cards)

## Date: 2026-06-07

## Source Project
**zarazhangrui/lark-coding-agent-bridge** (1008★)
- A bot that bridges Feishu/Lark messenger with local Claude Code or Codex CLI
- Key feature: **Streaming card** - text replies and tool calls update on one Lark card in real time
- Session continuity per chat/topic
- Queueing and batching of messages

## Feature Analysis
The lark-coding-agent-bridge updates Feishu interactive cards in real-time as the AI agent processes tasks. This lets users see:
- Current status of the task processing
- Tool calls being made
- Intermediate results
- Final output

Our harness-remote currently only **creates** new cards (via `sendCardMessage`) but cannot **update** existing cards. Adding card update capability would let agents:
1. Update a task creation card to show "🔄 Processing..." when picked up
2. Show progress updates as work proceeds
3. Show final results on the original card

## Feishu API
- Endpoint: `PATCH /open-apis/im/v1/messages/:message_id`
- Body: `{ "content": "<JSON card string>" }`
- Auth: tenant_access_token

## Implementation Plan (Phase 65)
1. `FeishuReplyClient.updateCardMessage(messageId, card)` - new interface method
2. `McpClient.updateTaskCard(taskId, cardContent)` - HTTP client method
3. MCP tool: `update_task_card` - agents can update Feishu cards by taskId
4. Tests

## Priority
🔴 High - Directly improves user experience in the core Feishu interaction loop
