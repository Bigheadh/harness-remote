# Export/Import Tasks (JSON Backup and Restore)

**Date**: 2026-06-02  
**Feature**: Export/import tasks (JSON backup and restore across instances)  
**Files Modified**: 6  
**Lines Added**: ~280  
**Lines Removed**: ~2  

## 概览表

| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-02 |
| 任务 | 实现任务导出/导入功能，支持跨实例 JSON 备份和恢复 |
| 涉及文件数 | 6 |
| 新增行数 | ~280 |
| 删除行数 | ~2 |

## 逐文件改动

### 1. src/server/tasks/store.ts

**改动 1**: 新增 `TaskExportPayload` 接口（第 6-16 行）

```typescript
// 改前: 无
// 改后:
export interface TaskExportPayload {
  exportedAt: string;
  version: 1;
  tasks: Task[];
  comments: Array<{ taskId: string; author: string; authorType: AuditLogEntry["actorType"]; body: string; createdAt: string }>;
  dependencies: Array<{ taskId: string; dependsOnIds: string[] }>;
  templates: TaskTemplate[];
  scheduledTasks: ScheduledTask[];
}
```

**原因**: 定义导出数据的类型结构，确保类型安全。  
**影响**: 所有使用 store 导出/导入的代码都依赖此类型。

**改动 2**: TaskStore 接口新增 `exportAll()` 和 `importAll()` 方法（第 89-91 行）

```typescript
// 改前: 无
// 改后:
exportAll(): Promise<TaskExportPayload>;
importAll(data: TaskExportPayload, mode: "skip" | "overwrite"): Promise<{ imported: number; skipped: number; errors: string[] }>;
```

**原因**: 定义 store 层的导出/导入契约。  
**影响**: 所有实现 TaskStore 的代码必须实现这两个方法。

**改动 3**: 实现 `exportAll()` 方法（第 1220-1260 行）

导出所有 tasks、comments、dependencies、templates、scheduled tasks，按 created_at 排序。

**原因**: 提供完整的数据导出能力，支持备份和跨实例迁移。  
**影响**: 新增功能，无破坏性变更。

**改动 4**: 实现 `importAll()` 方法（第 1262-1419 行）

支持 `skip`（跳过重复）和 `overwrite`（覆盖）两种模式。按顺序导入 tasks → dependencies → comments → templates → scheduled tasks，确保外键约束满足。

**原因**: 提供完整的数据导入能力，支持从备份恢复。  
**影响**: 新增功能，无破坏性变更。

### 2. src/server/tasks/routes.ts

**改动 1**: 新增 `GET /api/tasks/export` 路由（第 477-497 行）

需要 `tasks.read` 权限，返回完整导出 JSON。

**原因**: 提供 HTTP API 导出端点。  
**影响**: 新增 API 端点，无破坏性变更。

**改动 2**: 新增 `POST /api/tasks/import` 路由（第 499-540 行）

需要 `tasks.write` 权限，接受 JSON body，支持 `mode` 参数（skip/overwrite）。记录审计日志。

**原因**: 提供 HTTP API 导入端点。  
**影响**: 新增 API 端点，无破坏性变更。

### 3. src/mcp-server/client.ts

**改动 1**: TaskApiClient 接口新增 `exportTasks()` 和 `importTasks()` 方法

**原因**: MCP 客户端需要调用导出/导入 API。  
**影响**: 所有实现 TaskApiClient 的代码必须实现这两个方法。

**改动 2**: 实现 `exportTasks()` — 调用 `GET /api/tasks/export`  
**改动 3**: 实现 `importTasks()` — 调用 `POST /api/tasks/import`

### 4. src/mcp-server/tools.ts

**改动 1**: 新增 `export_tasks` MCP 工具

无需参数，调用 client.exportTasks()，返回导出 JSON。

**改动 2**: 新增 `import_tasks` MCP 工具

接受 `data`（JSON 对象）和 `mode`（skip/overwrite），调用 client.importTasks()。

### 5. test/mcp-server/tools.test.ts

**改动 1**: Mock client 新增 `exportTasks()` 和 `importTasks()` mock 方法

**改动 2**: 工具数量断言从 32 更新为 34

### 6. FEATURES.md

**改动 1**: 将 `- [ ] Export/import tasks` 标记为 `- [x]`

## 结构性摘要

- **新增**: `TaskExportPayload` 接口
- **新增**: `exportAll()` store 方法
- **新增**: `importAll()` store 方法
- **新增**: `GET /api/tasks/export` API 路由
- **新增**: `POST /api/tasks/import` API 路由
- **新增**: `exportTasks()` MCP 客户端方法
- **新增**: `importTasks()` MCP 客户端方法
- **新增**: `export_tasks` MCP 工具
- **新增**: `import_tasks` MCP 工具

## 风险说明

- **低风险**: 所有改动为纯新增功能，不修改现有逻辑
- **数据完整性**: importAll 按正确顺序导入（tasks → deps → comments → templates → scheduled），确保外键约束
- **幂等性**: skip 模式下重复导入不会产生副作用

## 验证步骤

- [x] `npm run typecheck` 通过
- [x] `npm run build` 通过
- [x] `npm run test` 全部 223 个测试通过
- [x] 工具数量断言正确（34）
