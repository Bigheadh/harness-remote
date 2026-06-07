# Research: Individual Task Assignment MCP Tools

**Date**: 2026-06-07
**Phase**: 62
**Gap Pattern**: #7 — API routes without MCP tools

## 发现过程

通过 Fast Gap Discovery Protocol 发现：

1. **API 路由存在但无 MCP 工具**：`POST /api/tasks/:id/assign` 和 `POST /api/tasks/:id/unassign` 路由在 Phase 19-20 中已实现，store 层有 `assignTask()` 和 `unassignTask()` 方法，但从未添加对应的 MCP 工具。

2. **不对称分析**：
   - 批量分配：`bulk_assign_tasks` MCP 工具 ✅
   - 单任务分配：`assign_task` MCP 工具 ❌ ← 缺失
   - 批量取消分配：通过 bulk 实现 ✅
   - 单任务取消分配：`unassign_task` MCP 工具 ❌ ← 缺失

3. **参考项目启发**：
   - **Plane** (⭐ 30k+): 支持单任务和批量任务分配到 Issue 入口
   - **Linear** (⭐ 10k+): 支持 assignee 字段的独立设置
   - **Huly** (⭐ 15k+): 支持任务分配到特定工作区

## 实现方案

采用压缩实现模式（Compressed Implementation Pattern）：
- Store 层和 API 路由已存在，跳过
- 直接添加：Client 接口 → Client 实现 → MCP 工具 → 测试

### 新增工具
1. `assign_task` — 将单个任务分配给指定设备
   - 输入：taskId, deviceId
   - 输出：更新后的 task 对象 + 消息
   
2. `unassign_task` — 取消任务的设备分配
   - 输入：taskId
   - 输出：更新后的 task 对象 + 消息

## 文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| src/mcp-server/client.ts | 修改 | 添加 assignTask/unassignTask 接口和实现 |
| src/mcp-server/tools.ts | 修改 | 添加 assign_task/unassign_task 工具注册 |
| test/mcp-server/tools.test.ts | 修改 | 添加 mock 方法、更新计数、添加 6 个测试 |
| FEATURES.md | 修改 | 添加 Phase 62 |

## 验证结果

- ✅ Typecheck 通过
- ✅ Build 通过
- ✅ 464/464 测试通过
- ✅ 工具计数：122 → 124

## 下一步研究方向

1. **Task command text editing** — 任务创建后无法编辑 commandText，缺少 set_task_command_text 工具
2. **Audit log MCP tools** — /api/audit/cleanup 和 /api/audit/count 路由无 MCP 工具
3. **Usage stats MCP tool** — /api/usage/stats 路由无 MCP 工具
