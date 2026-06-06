# Phase 45: User Management MCP Tools

## 概览
| 指标 | 数值 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | User Management MCP Tools |
| 涉及文件数 | 4 |
| 新增行数 | ~270 |

## 逐文件改动

### src/mcp-server/client.ts
- **行 1**: 新增 `User, UserRole` 到 import 语句
- **行 131-137**: TaskApiClient 接口新增 6 个用户管理方法签名：
  - `listUsers(): Promise<User[]>`
  - `getUser(userId: string): Promise<User>`
  - `createUser(username: string, role?: UserRole, feishuUserId?: string): Promise<User>`
  - `updateUserRole(userId: string, role: UserRole): Promise<User>`
  - `deleteUser(userId: string): Promise<void>`
  - `regenerateUserToken(userId: string): Promise<User>`
- **行 1523-1606**: 实现 6 个 HTTP client 方法，调用已有的 `/api/users` 路由：
  - `listUsers` → `GET /api/users`
  - `getUser` → `GET /api/users/:id`
  - `createUser` → `POST /api/users`
  - `updateUserRole` → `PATCH /api/users/:id/role`
  - `deleteUser` → `DELETE /api/users/:id`
  - `regenerateUserToken` → `POST /api/users/:id/token/regenerate`

### src/mcp-server/tools.ts
- **行 3622-3808**: 新增 6 个 MCP 工具注册：
  - `list_users` — 列出所有用户（无输入参数）
  - `get_user` — 按 ID 获取用户详情（userId）
  - `create_user` — 创建用户（username, role?, feishuUserId?）
  - `update_user_role` — 更新用户角色（userId, role）
  - `delete_user` — 删除用户（userId）
  - `regenerate_user_token` — 重新生成用户 token（userId）
- 所有工具遵循统一的 try/catch 错误处理模式

### test/mcp-server/tools.test.ts
- **行 4**: 新增 `User, UserRole` 到 import
- **行 1256-1328**: Mock client 新增 6 个用户管理方法实现
- **行 1383-1384**: 工具计数断言更新 `84 → 90`
- **行 2357-2531**: 新增 12 个测试用例：
  - 每个工具 2 个测试：注册验证 + 功能验证
  - 6 个错误处理测试：模拟 failWith 场景

### FEATURES.md
- 新增 Phase 45 条目，11 个子项全部标记为 `[x]`

## 结构性摘要
- **新增**: 6 个 MCP 工具（用户管理 CRUD + token 重生成）
- **新增**: 6 个 TaskApiClient 接口方法 + 实现
- **新增**: 12 个测试用例
- **无删除/重构**

## 风险说明
- **低风险**: 仅新增代码，不修改已有逻辑
- **注意**: 用户管理操作需要 admin 权限，MCP 工具本身不做权限检查（由 API 路由层的 authenticate/authorize 中间件处理）
- **注意**: `create_user` 返回的 token 包含在响应中，确保 MCP 客户端不会无意中泄露

## 验证步骤
```bash
cd /opt/harness-remote
npm run typecheck   # ✅ 通过
npm run build       # ✅ 通过
npm test            # ✅ 340 tests, 11 files passed
```
