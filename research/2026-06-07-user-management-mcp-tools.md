# 2026-06-07 User Management MCP Tools Research

## 研究方向
用户管理 MCP 工具 — 让 AI 代理可以通过 MCP 协议管理用户账户

## 发现的 Gap
通过对比 API 路由和 MCP 工具注册发现：
- `/api/users` 路由有 6 个端点（POST, GET, GET/:id, PATCH/:id/role, DELETE/:id, POST/:id/token/regenerate）
- 但 MCP 工具中没有任何用户管理工具
- 这是 gap pattern #6（API routes without MCP tools）的典型案例

## 参考项目
- **Plane** (github.com/makeplane/plane) — 开源项目管理工具，有完整的用户/成员管理 MCP 集成
- **Linear** — 有用户角色管理和团队成员管理的 API 设计
- **Dify** (github.com/langgenius/dify) — AI 平台的用户管理机制

## 实现决策
1. 压缩实现模式：跳过 types/store/routes（已存在），只添加 client + tools + tests
2. 6 个工具覆盖完整用户生命周期：list → get → create → update role → delete → regenerate token
3. 所有工具遵循统一的 try/catch 错误处理模式
4. Zod schema 使用 enum 约束 role 值（admin/operator/viewer）

## 下一步研究方向
- API Key 管理 MCP 工具（`/api/keys` 路由同样没有 MCP 工具）
- SSE 事件流的 MCP 工具化
- Prometheus metrics 的 MCP 查询工具
