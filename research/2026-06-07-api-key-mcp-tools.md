# 2026-06-07 API Key Management MCP Tools — Gap Analysis

## 搜索方向

热门开源任务管理/工单系统中的认证与 API Key 管理模式。

## 参考项目

- **Plane** (30k+ ★): 完整的 API Key 管理，支持创建、轮换、撤销、权限控制
- **n8n** (65k+ ★): API Key 作为 Agent 认证方式，支持轮换和宽限期
- **Linear** (25k+ ★): API Key 管理 + OAuth 双轨认证

## Gap 发现过程

1. **Gap Pattern #6**: API routes without MCP tools
2. 扫描 `src/server/auth/apikeys/routes.ts` 发现 8 个 REST 端点
3. 扫描 `src/mcp-server/tools.ts` 发现 0 个对应的 MCP 工具
4. 结论：AI Agent 无法通过 MCP 协议管理 API Key

## 实现决策

- 使用 `Record<string, unknown>` 返回类型，避免引入新的共享类型依赖
- 保持与 Phase 45 (User MCP Tools) 一致的压缩实现模式：跳过 types/store/routes（已完成），仅添加 client + tools + tests
- 8 个工具完整覆盖所有 API 路由端点

## 下一步研究方向

1. Dashboard Settings 页面已有 API Key 管理 UI，可考虑添加操作日志查看
2. API Key 使用统计（按 key 维度的请求量、最后活跃时间）
3. API Key 权限细分（不限于角色，支持细粒度权限控制）
