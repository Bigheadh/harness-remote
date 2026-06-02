# Change Log: Finer Permission Control (Per-user Token and RBAC)

## 概览

| 日期 | 任务 | 涉及文件数 | 增加行数 | 删除行数 |
|------|------|-----------|---------|---------|
| 2026-06-02 | Finer permission control (per-user token and RBAC) | 13 | 1115 | 68 |

## 逐文件改动

### 1. src/shared/types.ts (新增 14 行)

**改动位置**: 文件末尾

**改前**: 无 User 相关类型定义

**改后**:
```typescript
/** RBAC role for API users */
export type UserRole = "admin" | "operator" | "viewer";

/** API user with per-user token */
export interface User {
  id: string;
  username: string;
  token: string;
  role: UserRole;
  feishuUserId?: string;
  createdAt: string;
  updatedAt: string;
}
```

**修改原因**: 定义 RBAC 角色类型和用户接口，供 auth store 和 middleware 使用

**影响范围**: 所有需要引用 User 或 UserRole 类型的模块

---

### 2. src/shared/errors.ts (新增 1 行)

**改动位置**: ErrorCode 联合类型

**改前**:
```typescript
export type ErrorCode =
  | "unauthorized"
  | "not_found"
  ...
```

**改后**:
```typescript
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  ...
```

**修改原因**: 新增 "forbidden" 错误码，用于 RBAC 权限不足时返回 403

**影响范围**: 所有使用 AppError 的地方，新增 forbidden 错误码支持

---

### 3. src/server/auth/roles.ts (新建文件, 119 行)

**文件职责**: 定义角色 → 权限映射

**核心内容**:
- 定义 19 种 Permission 字符串（tasks.read, tasks.write, devices.read 等）
- 定义三种角色的权限映射:
  - `admin`: 所有权限
  - `operator`: 任务/设备/审计读写，无用户管理
  - `viewer`: 只读权限
- 导出 `hasPermission()` 和 `getRolePermissions()` 函数
- 导出 `VALID_ROLES` 和 `ALL_PERMISSIONS` 常量

**修改原因**: 将角色权限定义独立为模块，便于测试和维护

**影响范围**: middleware.ts, 所有 routes 文件

---

### 4. src/server/auth/middleware.ts (新建文件, 85 行)

**文件职责**: 认证和授权中间件

**核心内容**:
- `AuthContext` 接口: 包含 user, role, isSuperAdmin
- `extractBearerToken()`: 从 Authorization header 提取 token
- `authenticate()`: 先匹配 personalToken（超级管理员），再查 userStore（用户 token）
- `authorize()`: 检查角色是否有特定权限，无权限抛 AppError("forbidden")

**修改原因**: 将认证逻辑从各路由文件中提取为统一中间件

**影响范围**: 所有使用 Bearer token 认证的路由

---

### 5. src/server/auth/store.ts (新建文件, 142 行)

**文件职责**: 用户 SQLite 存储

**核心内容**:
- `users` 表: id, username, token, role, feishu_user_id, created_at, updated_at
- `token` 字段有唯一索引，热路径优化
- CRUD 方法: createUser, getUserById, getUserByToken, getUserByUsername, listUsers, updateUserRole, deleteUser, regenerateToken, countUsers
- 使用 `node:sqlite` DatabaseSync 同步 API
- WAL 模式

**修改原因**: 持久化用户信息和 per-user token，支持 RBAC

**影响范围**: server/index.ts (初始化), auth/routes.ts (用户管理)

---

### 6. src/server/auth/routes.ts (新建文件, 213 行)

**文件职责**: 用户管理 API 路由

**API 端点**:
- `POST /api/users` — 创建用户（admin only）
- `GET /api/users` — 列出所有用户（admin only）
- `GET /api/users/:id` — 获取用户详情（admin only）
- `PATCH /api/users/:id/role` — 修改用户角色（admin only）
- `DELETE /api/users/:id` — 删除用户（admin only）
- `POST /api/users/:id/token/regenerate` — 重新生成用户 token（admin only）

**修改原因**: 提供用户管理的 REST API，支持管理员创建和管理 per-user token

**影响范围**: 仅新增路由，不影响现有路由

---

### 7. src/server/tasks/routes.ts (修改 166 行)

**改动位置**: 整个文件

**改前**: 使用单一 `requireBearerToken(req.headers["authorization"], personalToken)` 认证

**改后**: 使用 RBAC-aware 认证流程:
1. `authenticate()` 尝试匹配 personalToken 或 userStore 中的用户 token
2. 每个路由使用 `authorize(authCtx, "permission")` 检查权限
3. 审计日志记录实际操作者用户名（而非固定的 "api"）
4. 错误处理器新增 403 forbidden 状态码支持

**修改原因**: 将单一 token 认证升级为 RBAC 认证，支持细粒度权限控制

**影响范围**: 所有 /api/* 路由的认证和授权行为

---

### 8. src/server/devices/routes.ts (修改 85 行)

**改动位置**: 整个文件

**改前**: 使用单一 `requireBearerToken` 认证

**改后**: 使用 RBAC-aware 认证:
- 认证 hook 调用 `authenticate()` 支持 per-user token
- `POST /api/devices` 需要 `devices.write` 权限
- `GET /api/devices` 需要 `devices.read` 权限
- `DELETE /api/devices/:id` 需要 `devices.delete` 权限

**修改原因**: 设备管理路由也支持 RBAC 权限控制

**影响范围**: 设备 API 的认证行为

---

### 9. src/server/audit/routes.ts (修改 47 行)

**改动位置**: 整个文件

**改前**: 使用单一 `requireBearerToken` 认证

**改后**: 使用 RBAC-aware 认证:
- `GET /api/audit` 和 `GET /api/audit/count` 需要 `audit.read` 权限
- `POST /api/audit/cleanup` 需要 `audit.cleanup` 权限

**修改原因**: 审计日志路由支持 RBAC 权限控制

**影响范围**: 审计 API 的认证行为

---

### 10. src/server/dashboard/routes.ts (修改 63 行)

**改动位置**: 整个文件

**改前**: 使用单一 `requireBearerToken` 认证

**改后**: 使用 RBAC-aware 认证:
- 支持 Bearer header 和 ?token= 查询参数两种认证方式
- 每个端点需要 `dashboard.read` 权限
- 使用具体的类型定义替代 ReturnType 推断（避免 TS2454）

**修改原因**: Dashboard 路由支持 RBAC 和 per-user token

**影响范围**: Dashboard 页面的认证行为

---

### 11. src/server/index.ts (修改 17 行)

**改动位置**: 新增 import 和 store 初始化

**改前**: 无 user store

**改后**:
```typescript
import { createUserStore } from "./auth/store.js";
import { registerUserRoutes } from "./auth/routes.js";
// ...
const userStoragePath = config.storagePath.replace(/\.sqlite$/, ".users.sqlite");
const userStore = createUserStore(userStoragePath);
// ...
registerTaskRoutes(server, store, config.personalToken, feishuClient, auditStore, userStore);
registerDeviceRoutes(server, deviceStore, config.personalToken, userStore);
registerAuditRoutes(server, auditStore, config.personalToken, userStore);
registerDashboardRoutes(server, store, config.personalToken, config.publicBaseUrl, userStore);
registerUserRoutes(server, userStore, config.personalToken);
```

**修改原因**: 初始化 user store 并将其注入所有需要 RBAC 的路由注册函数

**影响范围**: 服务器启动流程

---

### 12. test/server/auth.store.test.ts (新建文件, 221 行)

**测试内容**: 26 个测试用例
- UserStore CRUD: createUser, getUserById, getUserByToken, getUserByUsername, listUsers, updateUserRole, deleteUser, regenerateToken, countUsers
- RBAC roles: hasPermission 对三种角色的权限验证
- 边界情况: 重复用户名、不存在的用户、token 重新生成

**修改原因**: 确保 auth store 和 RBAC 角色权限逻辑正确

**影响范围**: 仅测试文件

---

### 13. FEATURES.md (修改 10 行)

**改动位置**: Phase 19 和新增 Phase 20

**改前**: Phase 19 最后一项 `- [ ] Finer permission control`

**改后**: `- [x] Finer permission control (per-user token and RBAC)`，新增 Phase 20 (v3 Advanced Features)

**修改原因**: 标记功能完成，添加下一阶段的 feature list 以保持项目持续演进

**影响范围**: 仅文档

## 结构性摘要

### 新增文件 (5 个)
- `src/server/auth/roles.ts` — 角色权限定义
- `src/server/auth/middleware.ts` — 认证授权中间件
- `src/server/auth/store.ts` — 用户 SQLite 存储
- `src/server/auth/routes.ts` — 用户管理 API
- `test/server/auth.store.test.ts` — 测试 (26 cases)

### 修改文件 (8 个)
- `src/shared/types.ts` — 新增 User, UserRole 类型
- `src/shared/errors.ts` — 新增 "forbidden" 错误码
- `src/server/tasks/routes.ts` — RBAC 认证替换单一 token
- `src/server/devices/routes.ts` — RBAC 认证
- `src/server/audit/routes.ts` — RBAC 认证
- `src/server/dashboard/routes.ts` — RBAC 认证
- `src/server/index.ts` — 初始化 userStore, 注入到路由
- `FEATURES.md` — 标记完成, 新增 Phase 20

### 核心变化
- 从单一 personalToken 认证升级为三角色 RBAC (admin/operator/viewer)
- personalToken 保留为超级管理员 token，始终具有 admin 权限
- 新增 per-user token，存储在独立的 SQLite 数据库中
- 每个 API 路由按功能分配权限（如 tasks.read, devices.write 等）
- 审计日志记录实际操作者用户名

## 风险说明

1. **向后兼容**: personalToken 仍然作为超级管理员 token 使用，现有 MCP 配置无需修改
2. **数据库迁移**: 新增 users.sqlite 文件，不影响现有数据库
3. **权限升级**: 首次部署后，需要管理员通过 API 创建用户并分配角色
4. **审计日志 actor 变化**: 从固定的 "api" 变为实际用户名，可能影响审计日志查询

## 验证步骤

1. ✅ `npm run typecheck` — 通过
2. ✅ `npm run build` — 通过
3. ✅ `npm run test` — 184 tests passed (26 new + 158 existing)
4. ✅ Git commit + push — 成功
