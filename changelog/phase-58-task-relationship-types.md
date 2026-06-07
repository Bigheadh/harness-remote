# Phase 58: Task Relationship Types

## 概览

| 项目 | 详情 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 实现任务关系类型系统 |
| 涉及文件数 | 6 |
| 参考项目 | Linear (task linking), Jira (issue links), Plane (work item relations) |

## 逐文件改动

### src/shared/types.ts
- **新增** `TaskRelationshipType` 联合类型: `"depends_on" | "blocks" | "relates_to" | "duplicates"`
- **新增** `TaskRelationship` 接口: taskId, relatedTaskId, relationshipType, createdAt
- **影响**: 所有依赖 shared/types 的模块均可使用新类型
- **风险**: 低 — 纯新增类型，不修改现有接口

### src/server/tasks/store.ts
- **新增迁移**: `ALTER TABLE task_dependencies ADD COLUMN relationship_type TEXT NOT NULL DEFAULT 'depends_on'`
- **新增迁移**: `ALTER TABLE task_dependencies ADD COLUMN created_at TEXT NOT NULL DEFAULT ''`
- **新增方法** `addRelationship(taskId, relatedTaskId, type)`: 验证两个任务存在，upsert 关系
- **新增方法** `removeRelationship(taskId, relatedTaskId, type?)`: 删除指定或所有关系
- **新增方法** `listRelationships(taskId)`: 查询任务的所有关系（双向）
- **接口更新**: TaskStore 接口新增 3 个方法声明
- **影响**: 既有 depends_on 查询不受影响（默认值为 'depends_on'）
- **风险**: 低 — ALTER TABLE 使用 try/catch 幂等迁移

### src/server/tasks/routes.ts
- **新增路由** `GET /api/tasks/:id/relationships`: 列出任务的所有关系
- **新增路由** `POST /api/tasks/:id/relationships`: 添加关系（含类型验证）
- **新增路由** `DELETE /api/tasks/:id/relationships/:relatedId`: 删除关系（可选类型过滤）
- **影响**: 新增 3 个 API 端点，不影响现有路由
- **风险**: 低 — 全局 auth hook 已覆盖 /api/* 路径

### src/mcp-server/client.ts
- **新增接口方法**: addRelationship, removeRelationship, listRelationships
- **新增实现**: 3 个 HTTP client 方法调用新 API 路由
- **影响**: TaskApiClient 接口扩展，mock client 需同步更新
- **风险**: 低 — 纯新增方法

### src/mcp-server/tools.ts
- **新增工具** `add_task_relationship`: 创建任务关系（blocks/relates_to/duplicates/depends_on）
- **新增工具** `remove_task_relationship`: 删除任务关系（可选类型过滤）
- **新增工具** `list_task_relationships`: 列出任务的所有关系
- **工具总数**: 117 → 120
- **影响**: AI 代理可管理任务间的语义关系
- **风险**: 低 — 纯新增工具注册

### test/mcp-server/tools.test.ts
- **新增 mock 方法**: addRelationship, removeRelationship, listRelationships
- **新增测试**: 9 个测试用例覆盖 3 个新工具（注册、CRUD、错误处理）
- **工具计数更新**: 117 → 120
- **测试总数**: 442 → 451（全部通过）

## 结构性摘要

- **新增**: 2 个共享类型、3 个 store 方法、3 个 API 路由、3 个 client 方法、3 个 MCP 工具
- **修改**: task_dependencies 表增加 2 列（幂等迁移）
- **无删除**: 所有现有功能保持不变

## 风险说明

1. **数据库迁移**: 使用 `ALTER TABLE ... ADD COLUMN` + `try/catch` 模式，已有数据自动获得默认值 `depends_on`，完全向后兼容
2. **API 认证**: 新路由通过全局 `onRequest` hook 自动获得认证，无需额外配置
3. **MCP 工具**: 新工具使用 Zod enum 约束输入，防止无效关系类型

## 验证步骤

1. `npm run typecheck` — ✅ 通过
2. `npm run build` — ✅ 通过
3. `npm test` — ✅ 451/451 通过
