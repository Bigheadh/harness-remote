# Phase 66: CSV Import with Column Mapping

## 概览
| 项目 | 详情 |
|------|------|
| 日期 | 2026-06-08 |
| 任务 | 新增 CSV 导入功能，支持列名映射 |
| 涉及文件数 | 5 |
| 新增功能 | 1 个 API 路由 + 1 个 MCP 工具 |

## 逐文件改动

### 1. src/server/tasks/routes.ts
**改动**: 新增 `POST /api/tasks/import-csv` 路由

**改前**: 无 CSV 导入路由

**改后**: 
```typescript
server.post("/api/tasks/import-csv", async (req, reply) => {
  // 接受 CSV 文本 + columnMap + defaultPriority + defaultTags + delimiter
  // 解析 CSV header，映列到任务字段，逐行创建任务
  // 返回 { ok, imported, errors, taskIds }
});
```

**原因**: 用户需要从 Jira/Trello/Asana 等工具导出的 CSV 文件导入任务

**影响范围**: 新增 API 端点，不影响现有功能

### 2. src/mcp-server/client.ts
**改动**: 新增 `importTasksFromCsv` 接口方法和实现

**改前**: 无 CSV 导入客户端方法

**改后**:
```typescript
// 接口
importTasksFromCsv(csv: string, options?: { columnMap?, defaultPriority?, defaultTags?, delimiter? }): Promise<{ imported, errors, taskIds }>;

// 实现
async importTasksFromCsv(csv, options) {
  // POST /api/tasks/import-csv
}
```

**原因**: MCP 工具需要通过客户端调用 API 路由

**影响范围**: 新增客户端方法，不影响现有功能

### 3. src/mcp-server/tools.ts
**改动**: 新增 `import_tasks_csv` MCP 工具注册

**改前**: 无 CSV 导入 MCP 工具

**改后**:
```typescript
server.registerTool("import_tasks_csv", {
  description: "Import tasks from CSV text with column mapping...",
  inputSchema: { csv, columnMap?, defaultPriority?, defaultTags?, delimiter? },
}, async (args) => {
  const result = await client.importTasksFromCsv(args.csv, options);
  // 返回导入结果
});
```

**原因**: AI 代理需要通过 MCP 协议导入 CSV 数据

**影响范围**: 新增 MCP 工具，工具总数 138 → 139

### 4. test/mcp-server/tools.test.ts
**改动**: 新增 `importTasksFromCsv` mock 方法，更新工具计数

**改前**: mock 客户端无 `importTasksFromCsv` 方法，工具计数 138

**改后**: mock 客户端新增方法，工具计数 139

**原因**: 测试需要 mock 新的客户端方法，工具计数需与实际一致

**影响范围**: 测试文件更新

### 5. FEATURES.md
**改动**: 新增 Phase 66 条目

**改前**: 无 Phase 66

**改后**: 新增 Phase 66: CSV Import with Column Mapping（6 个子项全部完成）

**原因**: 记录功能实现进度

**影响范围**: 项目文档

## 风险说明
- **低风险**: 新增功能，不修改现有代码逻辑
- **CSV 解析**: 使用简单的 split 实现，不依赖外部库
- **列映射**: 灵活的 columnMap 机制，兼容各种 CSV 格式

## 验证步骤
1. `npm run typecheck` — ✅ 通过
2. `npm run build` — ✅ 通过
3. `npm test` — ✅ 502/502 测试通过
