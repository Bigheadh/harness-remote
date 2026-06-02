# Changelog: Task Tags/Labels System

## 概览

| 项目 | 值 |
|------|-----|
| 日期 | 2026-06-02 |
| 任务 | Phase 20: Task tags/labels system |
| 涉及文件数 | 10 |
| 新增测试数 | 22 (11 store + 4 feishu + 7 mcp tools) |

## 文件改动

### 1. src/shared/types.ts

**改动 1**: Task interface 添加 tags 字段
- 位置: 行 33 (Task interface)
- 改前: `priority: TaskPriority;` 后直接是 `attachments?: Attachment[];`
- 改后: 新增 `tags?: string[];` 字段
- 原因: 支持任务标签分类功能
- 影响: 所有使用 Task 类型的代码自动获得 tags 支持

**改动 2**: AuditAction 类型扩展
- 位置: 行 51-63
- 改前: 12 种审计动作
- 改后: 新增 `task.tags_added` 和 `task.tags_removed`
- 原因: 标签操作需要审计日志记录

### 2. src/server/tasks/store.ts

**改动 1**: parseTags 辅助函数
- 位置: 行 69-80 (新增)
- 改后: 新增 `parseTags(raw: unknown): string[] | undefined`
- 原因: 从 SQLite JSON 字段解析标签数组

**改动 2**: rowToTask 包含 tags
- 位置: 行 91
- 改后: `tags: parseTags(row["tags"]),`
- 原因: 查询结果映射时包含 tags

**改动 3**: SearchOptions 添加 tags 过滤
- 位置: 行 13
- 改后: `tags?: string[];`
- 原因: 搜索接口支持按标签过滤

**改动 4**: SQLite 表结构添加 tags 列
- 位置: 行 108, 147-152
- 改后: CREATE TABLE 添加 `tags TEXT`，ALTER TABLE 迁移
- 原因: 持久化存储标签数据

**改动 5**: insertTask 语句添加 tags 参数
- 位置: 行 173-175
- 改后: INSERT 语句新增 tags 列和 ? 占位符
- 原因: 创建任务时保存标签

**改动 6**: createTask 方法序列化 tags
- 位置: 行 239-241
- 改后: `const tagsJson = task.tags && task.tags.length > 0 ? JSON.stringify(task.tags) : null;`
- 原因: 将标签数组序列化为 JSON 字符串存储

**改动 7**: searchTasks 方法支持 tags 过滤
- 位置: 行 304-309
- 改后: 循环添加 `tags LIKE ?` 条件
- 原因: SQL 层面实现标签过滤

**改动 8**: addTags 方法
- 位置: 行 472-490 (新增)
- 改后: 新增 `addTags(taskId, tags): Promise<Task>`
- 原因: API 层添加标签操作

**改动 9**: removeTag 方法
- 位置: 行 492-510 (新增)
- 改后: 新增 `removeTag(taskId, tag): Promise<Task>`
- 原因: API 层移除标签操作

**改动 10**: listAllTags 方法
- 位置: 行 512-525 (新增)
- 改后: 新增 `listAllTags(): Promise<string[]>`
- 原因: 查询所有唯一标签

### 3. src/server/tasks/routes.ts

**改动 1**: GET /api/tasks/tags 端点
- 位置: 行 48-63 (新增)
- 改后: 新增标签列表 API
- 原因: 提供标签列表查询接口

**改动 2**: search 端点支持 tags 参数
- 位置: 行 99-100
- 改后: 解析 `tags` 查询参数并传入 searchTasks
- 原因: 搜索 API 支持标签过滤

**改动 3**: POST /api/tasks/:id/tags 端点
- 位置: 行 361-428 (新增)
- 改后: 新增添加标签 API
- 原因: 提供标签添加操作

**改动 4**: DELETE /api/tasks/:id/tags/:tag 端点
- 位置: 行 430-477 (新增)
- 改后: 新增移除标签 API
- 原因: 提供标签移除操作

### 4. src/mcp-server/client.ts

**改动 1**: searchTasks 接口添加 tags 参数
- 位置: 行 11
- 改后: `tags?: string[];`

**改动 2**: searchTasks 实现支持 tags
- 位置: 行 80-82
- 改后: 将 tags 数组用逗号连接传入查询参数

**改动 3**: addTags 方法
- 位置: 行 226-243 (新增)
- 改后: 调用 POST /api/tasks/:id/tags

**改动 4**: removeTag 方法
- 位置: 行 245-262 (新增)
- 改后: 调用 DELETE /api/tasks/:id/tags/:tag

**改动 5**: listAllTags 方法
- 位置: 行 264-280 (新增)
- 改后: 调用 GET /api/tasks/tags

### 5. src/mcp-server/tools.ts

**改动 1**: search_tasks 工具添加 tags 输入
- 位置: 行 64-66, 94-97
- 改后: description 更新，inputSchema 新增 tags 数组参数

**改动 2**: manage_task_tags 工具
- 位置: 行 408-514 (新增)
- 改后: 新增 MCP 工具支持 add/remove/list 三种操作
- 原因: 本地 Codex CLI 通过 MCP 管理任务标签

### 6. src/server/feishu/events.ts

**改动 1**: parseTagsFromText 函数
- 位置: 行 28-39 (新增)
- 改后: 解析 `#tag:name` 格式的标签

**改动 2**: stripTagMarkers 函数
- 位置: 行 42-44 (新增)
- 改后: 从文本中移除标签标记

**改动 3**: createTaskFromFeishuEvent 包含 tags
- 位置: 行 227-228
- 改后: 解析标签并设置到 Task 对象

### 7. test/server/tasks.store.test.ts

**改动**: 新增 11 个标签测试
- 存储和检索标签
- 无标签任务
- 添加标签（含去重）
- 移除标签（含清空）
- 列出所有唯一标签
- 按标签搜索（单标签和多标签）
- 非存在任务的错误处理

### 8. test/server/feishu.events.test.ts

**改动**: 新增 4 个标签解析测试
- 从消息文本解析标签
- 标签去重
- 无标签消息
- 标签与优先级组合

### 9. test/mcp-server/tools.test.ts

**改动**: 新增 7 个 manage_task_tags 测试 + 1 个 search_tasks tags 测试
- 工具注册验证
- list/add/remove 操作
- 缺少必填参数的错误处理
- 客户端失败的错误处理

### 10. FEATURES.md

**改动**: Phase 20 第一项标记为完成
- `- [ ]` -> `- [x]`

## 结构性摘要

- **新增**: 3 个 store 方法 (addTags, removeTag, listAllTags)
- **新增**: 3 个 API 端点 (GET /api/tasks/tags, POST /api/tasks/:id/tags, DELETE /api/tasks/:id/tags/:tag)
- **新增**: 1 个 MCP 工具 (manage_task_tags)
- **新增**: 2 个 Feishu 解析函数 (parseTagsFromText, stripTagMarkers)
- **修改**: Task 类型新增 tags 字段
- **修改**: searchTasks 支持 tags 过滤
- **修改**: search_tasks MCP 工具支持 tags 参数
- **新增**: 22 个测试用例

## 风险说明

- **低风险**: tags 字段为可选，不影响现有任务创建流程
- **低风险**: SQLite 迁移使用 try/catch，兼容已有数据库
- **低风险**: 标签使用 JSON 数组存储，查询使用 LIKE 模式匹配，性能可接受
- **中风险**: 标签搜索使用 `tags LIKE '%"tag"%'` 模式，如果标签名包含引号可能产生误匹配（极端边界情况）

## 验证步骤

```bash
cd /opt/harness-remote
npm run typecheck    # TypeScript 编译检查
npm run build        # 构建验证
npm run test         # 208 个测试全部通过
```
