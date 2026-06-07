# Phase 64: Comment & Note Deletion MCP Tools

## 概览

| 指标 | 数值 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 添加 delete_task_comment 和 delete_task_note MCP 工具 |
| 涉及文件数 | 4 |
| 新增测试 | 10 |
| MCP 工具数 | 135 → 137 |
| 测试总数 | 492 → 502 |

## 逐文件改动

### 1. src/mcp-server/client.ts

**改动 1: 接口声明 — 添加 deleteTaskComment 方法**
- 位置: TaskApiClient 接口，第 40 行后
- 改前: 无
- 改后: `deleteTaskComment(taskId: string, commentId: number): Promise<void>;`
- 原因: 接口需要声明新方法以满足类型安全
- 影响: 所有实现 TaskApiClient 的对象必须实现此方法

**改动 2: 接口声明 — 添加 deleteTaskNote 方法**
- 位置: TaskApiClient 接口，第 102 行后
- 改前: 无
- 改后: `deleteTaskNote(taskId: string, noteId: number): Promise<void>;`
- 原因: 接口需要声明新方法以满足类型安全
- 影响: 所有实现 TaskApiClient 的对象必须实现此方法

**改动 3: 实现 deleteTaskComment**
- 位置: createApiClient 函数内，addComment 方法之后
- 改前: 无
- 改后: 新的 async 方法，调用 DELETE /api/tasks/:id/comments/:commentId
- 原因: MCP 工具需要通过 HTTP 客户端调用已有的 API 路由
- 影响: 无（新增方法，不影响现有代码）

**改动 4: 实现 deleteTaskNote**
- 位置: createApiClient 函数内，addNote 方法之后
- 改前: 无
- 改后: 新的 async 方法，调用 DELETE /api/tasks/:id/notes/:noteId
- 原因: MCP 工具需要通过 HTTP 客户端调用已有的 API 路由
- 影响: 无（新增方法，不影响现有代码）

### 2. src/mcp-server/tools.ts

**改动 5: 添加 delete_task_comment 工具注册**
- 位置: list_task_comments 工具之后，bulk_update_status 工具之前
- 改前: 无
- 改后: 新的 server.registerTool("delete_task_comment", ...) 调用
- 原因: AI 代理需要能够删除任务评论
- 影响: MCP 工具总数 +1

**改动 6: 添加 delete_task_note 工具注册**
- 位置: add_task_note 工具之后，list_user_tasks 工具之前
- 改前: 无
- 改后: 新的 server.registerTool("delete_task_note", ...) 调用
- 原因: AI 代理需要能够删除内部备注
- 影响: MCP 工具总数 +1

### 3. test/mcp-server/tools.test.ts

**改动 7: Mock client — 添加 deleteTaskComment mock**
- 位置: createMockClient 函数内，addComment mock 之后
- 改前: 无
- 改后: mock 方法，push 到 calls 数组并支持 failWith
- 原因: 测试需要模拟客户端行为

**改动 8: Mock client — 添加 deleteTaskNote mock**
- 位置: createMockClient 函数内，addNote mock 之后
- 改前: 无
- 改后: mock 方法，push 到 calls 数组并支持 failWith
- 原因: 测试需要模拟客户端行为

**改动 9: 更新工具计数断言**
- 位置: tool registration describe 块
- 改前: `expect(mockServer.registrations).toHaveLength(135)` 和 "registers all 135 tools"
- 改后: `expect(mockServer.registrations).toHaveLength(137)` 和 "registers all 137 tools"
- 原因: 新增了 2 个工具

**改动 10: 添加 delete_task_comment 测试（3 个）**
- 位置: list_task_comments 错误测试之后
- 改前: 无
- 改后: 注册验证、成功删除、错误处理三个测试用例
- 原因: 验证工具注册、正常调用和错误处理

**改动 11: 添加 note 相关测试（7 个）**
- 位置: delete_task_comment 测试之后，list_tasks_by_user 测试之前
- 改前: 无
- 改后: add_task_note 注册、list_task_notes 注册、delete_task_note 注册、添加备注、列出备注、删除备注、删除失败共 7 个测试
- 原因: 之前缺少 note 相关工具的测试覆盖

### 4. FEATURES.md

**改动 12: 添加 Phase 64 追踪条目**
- 位置: 文件末尾
- 改前: 无
- 改后: Phase 64 完整的 checklist
- 原因: 记录功能进展

## 风险说明

- **低风险**: 本次改动仅添加新的客户端方法和工具注册，不修改任何现有代码逻辑
- **向后兼容**: 新增的接口方法不影响现有实现
- **测试覆盖**: 所有新功能都有对应的测试用例

## 验证步骤

1. `npm run typecheck` — 通过 ✅
2. `npm run build` — 通过 ✅
3. `npm test` — 502 tests passed ✅ (11 test files)
4. MCP 工具总数: 137 ✅
