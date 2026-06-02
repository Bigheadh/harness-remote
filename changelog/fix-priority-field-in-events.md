# 变更记录：修复 createTaskFromFeishuEvent 缺少 priority 字段

## 概览

| 项目 | 值 |
|------|-----|
| 日期 | 2026-06-02 |
| 任务 | 修复 typecheck 错误：events.ts 中 createTaskFromFeishuEvent 缺少 priority 字段 |
| 涉及文件数 | 1 |
| 新增行数 | ~5 |
| 删除行数 | ~3 |

## 逐文件改动

### src/server/feishu/events.ts

**改动 1：createTaskFromFeishuEvent 添加 priority 和 commandText 清理**

- 位置：第 139-153 行（函数体）
- 改前：`createTaskFromFeishuEvent` 返回的 Task 对象缺少 `priority` 字段，`commandText` 直接使用原始文本
- 改后：添加 `const priority = parsePriority(event.text)` 解析优先级标记；添加 `const commandText = stripPriorityMarkers(event.text)` 清理标记文本；返回对象中包含 `priority` 和清理后的 `commandText`
- 修改原因：TypeScript strict mode 下，Task 接口要求 `priority: TaskPriority` 字段，缺失会导致 TS2741 编译错误。同时 `parsePriority` 和 `stripPriorityMarkers` 两个辅助函数已存在但未被调用，浪费了已有的优先级解析功能
- 影响范围：飞书事件处理流程。所有从飞书消息创建的任务现在会正确解析优先级标记（如 `#priority:urgent`、`!high`），并在存储前清理这些标记

## 结构性摘要

- 新增：`createTaskFromFeishuEvent` 中的 priority 解析和文本清理逻辑
- 无删除、无重构

## 风险说明

- **低风险**：这是一个纯 additive 改动，只添加了之前缺失的字段
- 优先级解析逻辑已有独立测试覆盖（parsePriority 单元测试）
- 对不包含优先级标记的消息，默认返回 `"normal"` 优先级，与之前行为一致

## 验证步骤

1. `npm run typecheck` — 通过（之前报 TS2741，现在 0 errors）
2. `npm run build` — 通过
3. `npm run test` — 108 tests passed across 6 files
4. `git push` — 成功推送到 origin/master
