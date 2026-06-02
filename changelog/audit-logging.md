# Audit Logging Feature

## 概览
| 日期 | 任务 | 涉及文件数 | 新增行数 | 删除行数 |
|------|------|-----------|---------|---------|
| 2026-06-02 | Audit logging (who did what when) | 10 | ~280 | ~15 |

## 逐文件改动

### 1. src/shared/types.ts
- **新增** `AuditLogEntry` 接口 (id, action, taskId, actor, actorType, details, timestamp)
- **新增** `AuditAction` 联合类型 (12 种操作类型)
- **新增** `AuditLogSearchOptions` 接口 (action, taskId, actor, actorType, from, to, limit)
- **原因**: 为审计日志提供类型定义，供 store、routes、MCP 工具共享
- **影响**: 所有导入 types.ts 的模块可使用审计相关类型

### 2. src/server/audit/store.ts (新文件)
- **创建** `AuditLogStore` 接口和 `createAuditLogStore()` 工厂函数
- **实现**: SQLite WAL 模式，`audit_log` 表 (id AUTOINCREMENT, action, task_id, actor, actor_type, details JSON, timestamp)
- **方法**: log(), query(), count(), cleanup()
- **索引**: action, task_id, timestamp, actor_type 四个索引
- **原因**: 独立 SQLite 文件存储审计日志，避免污染主 tasks 表
- **影响**: 服务器启动时自动创建 `data/tasks.audit.sqlite`

### 3. src/server/audit/routes.ts (新文件)
- **创建** `registerAuditRoutes()` 注册三个端点:
  - `GET /api/audit` — 查询审计日志 (支持 action, taskId, actor, actorType, from, to, limit 过滤)
  - `GET /api/audit/count` — 总条数
  - `POST /api/audit/cleanup` — 清理旧日志
- **原因**: 提供 HTTP API 供 MCP 工具和外部系统查询审计日志
- **影响**: 需要 Bearer token 认证

### 4. src/server/tasks/routes.ts
- **修改** `registerTaskRoutes()` 签名，新增可选参数 `auditStore?: AuditLogStore`
- **新增** 审计日志调用点:
  - `POST /api/tasks/:id/status` → `task.status_changed`
  - `POST /api/tasks/:id/result` → `task.result_reported`
  - `POST /api/tasks/:id/assign` → `task.assigned`
  - `POST /api/tasks/:id/unassign` → `task.unassigned`
  - `POST /api/tasks/reset-stale` → `task.reset_stale`
  - `POST /api/tasks/cleanup-events` → `cleanup.processed_events`
  - `POST /api/tasks/:id/reply` → `feishu.reply_sent` / `feishu.reply_failed`
- **原因**: 记录所有任务状态变更和操作的审计追踪
- **影响**: auditStore 可选，不影响现有功能

### 5. src/server/feishu/events.ts
- **修改** `registerFeishuRoutes()` 签名，新增可选参数 `auditStore?: AuditLogStore`
- **新增** 审计日志调用点:
  - 重复事件 → `event.duplicate`
  - 非白名单用户 → `event.non_allowed_user`
  - 任务创建 → `task.created` (包含 chatType, priority 详情)
- **原因**: 记录飞书事件处理的审计追踪
- **影响**: auditStore 可选，不影响现有功能

### 6. src/server/index.ts
- **新增** import `createAuditLogStore` 和 `registerAuditRoutes`
- **创建** audit store: `config.storagePath.replace(/\.sqlite$/, ".audit.sqlite")`
- **传递** auditStore 给 `registerTaskRoutes()`, `registerFeishuRoutes()`, `registerAuditRoutes()`
- **原因**: 在服务器启动时初始化审计日志存储并注入到各路由模块
- **影响**: 新增 `data/tasks.audit.sqlite` 文件

### 7. src/mcp-server/client.ts
- **新增** import `AuditLogEntry`, `AuditLogSearchOptions`
- **新增** `queryAuditLog()` 方法到 `TaskApiClient` 接口和实现
- **实现**: 调用 `GET /api/audit` 并传递过滤参数
- **原因**: MCP server 需要通过 HTTP 查询审计日志
- **影响**: MCP 工具可调用此方法

### 8. src/mcp-server/tools.ts
- **新增** `query_audit_log` MCP 工具
- **输入参数**: action, taskId, actor, actorType, from, to, limit
- **返回**: 审计日志条目列表 (最新优先)
- **原因**: 让 Codex CLI 用户通过 MCP 查询审计日志
- **影响**: 工具总数从 7 增加到 8

### 9. test/mcp-server/tools.test.ts
- **修改** `toHaveLength(7)` → `toHaveLength(8)` (工具数量断言)
- **原因**: 新增了 query_audit_log 工具
- **影响**: 测试通过

### 10. FEATURES.md
- **修改** `- [ ] Audit logging` → `- [x] Audit logging`
- **原因**: 标记功能完成
- **影响**: 项目进度更新

## 结构性摘要
- **新增文件**: 2 (src/server/audit/store.ts, src/server/audit/routes.ts)
- **修改文件**: 8
- **新增类型**: 3 (AuditLogEntry, AuditAction, AuditLogSearchOptions)
- **新增 API 端点**: 3 (/api/audit, /api/audit/count, /api/audit/cleanup)
- **新增 MCP 工具**: 1 (query_audit_log)

## 风险说明
- 审计日志存储在独立 SQLite 文件中，不影响主数据库性能
- auditStore 参数为可选，向后兼容
- 审计日志自动记录所有关键操作，无性能瓶颈 (异步写入)
- cleanup 端点可手动清理旧日志，默认保留 30 天

## 验证步骤
- [x] npm run typecheck — 通过
- [x] npm run build — 通过
- [x] npm run test — 158/158 通过
- [ ] 服务器启动后验证 /api/audit 端点可访问
- [ ] 通过 MCP 工具查询审计日志
