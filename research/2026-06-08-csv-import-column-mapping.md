# Research: CSV Import with Column Mapping — Phase 66

**Date**: 2026-06-08
**Direction**: Data Import/Export Enhancement
**Reference**: Plane (50454★), Todoist MCP (392★), Jira CSV import patterns

## 搜索关键词

- `task management CSV import column mapping` — 常见需求
- `mcp server data import export` — MCP 生态中的数据迁移模式
- `plane csv import` — Plane 的 CSV 导入功能
- `jira csv import field mapping` — Jira 的 CSV 导入字段映射

## 参考项目分析

### Plane (50454★) — 开源 Jira/Linear 替代品
- **核心特性**: CSV/JSON 导入导出、字段映射、批量操作
- **可借鉴**: "CSV Import with Column Mapping" — 用户可自定义 CSV 列到任务字段的映射
- **决策**: 验证了 CSV 导入在任务管理工具中的普遍需求

### Jira CSV Import (闭源参考)
- **核心特性**: 支持从 CSV 导入 issues，自动检测列映射，支持自定义字段
- **可借鉴**: 灵活的列映射机制 — 用户可将任意 CSV 列映射到任务字段
- **决策**: 采用类似的 columnMap 模式，让用户自定义映射关系

### Todoist MCP (392★)
- **核心特性**: 任务管理、自然语言处理、项目组织
- **可借鉴**: 简洁的 API 设计 — 单一工具完成导入操作
- **决策**: 保持工具接口简洁，一个 `import_tasks_csv` 工具完成所有操作

## Gap 发现过程

1. harness-remote 已有 JSON 格式的 `import_tasks` 工具
2. 但用户经常从 Jira、Trello、Asana 等工具导出 CSV 格式数据
3. 现有的 `import_tasks` 只接受 JSON，无法处理 CSV
4. CSV 是最常见的数据交换格式，缺少 CSV 导入是实际使用中的痛点

## 实现决策

### 为什么选择这个功能
- **用户价值高**: CSV 是最常见的数据交换格式，用户经常需要从其他工具迁移数据
- **实现难度低**: 只需添加路由、客户端方法和 MCP 工具，不需要修改数据模型
- **模式清晰**: 遵循现有的 import_tasks 模式，只是输入格式从 JSON 变为 CSV

### 技术方案
- 新增 `POST /api/tasks/import-csv` 路由
- 接受 CSV 文本 + 可选的 columnMap（列名映射）
- 支持自定义分隔符、默认优先级、默认标签
- 返回导入数量、错误列表、任务 ID 列表

### 实现难度
- ⭐⭐ (2/5) — 标准的 CRUD 扩展，不需要修改数据模型

## 下一步研究方向
- 任务模板变量替换（`{{variable}}` 语法）
- 批量任务创建（从结构化数据列表）
- 任务活动时间线增强
