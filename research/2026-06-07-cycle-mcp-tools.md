# 2026-06-07 Cycle (Sprint) Management MCP Tools

## 研究方向
Gap pattern #7: API routes without MCP tools — 发现 cycle 子系统有 8 个 API 路由和 8 个客户端方法，但缺少 MCP 工具。

## 研究过程
1. 运行 gap discovery protocol（路由 vs 工具交叉对比）
2. 发现 `/api/cycles` 相关的 8 个路由没有对应的 MCP 工具
3. 确认客户端方法已完整实现（listCycles, getCycle, createCycle, updateCycle, deleteCycle, addTaskToCycle, removeTaskFromCycle, listCycleTasks）
4. 直接实现 8 个 MCP 工具，无需修改 store/routes/client 层

## 实现决策
- 采用 compressed implementation 模式（跳过 types/store/routes 层，直接 client → tools → tests）
- 遵循现有工具注册模式（try/catch + isError + JSON.stringify）
- 每个工具包含完整的错误处理和用户友好的响应消息

## 下一步研究方向
- 检查其他可能的 API routes without MCP tools gap
- 考虑 cycle 的 dashboard 可视化增强（如 sprint burndown chart）
- 研究项目管理工具（Linear, Plane）的 sprint 功能特性
