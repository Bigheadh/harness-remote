# Research: Template Utilization Gap

## Date: 2026-06-06

## 方向: 任务模板的实际使用

### 问题发现
扫描代码库发现 TaskTemplate CRUD 完整（list/get/create/update/delete），但缺少「从模板创建任务」的能力。这意味着模板只能被管理，不能被使用。

### 参考来源
- **Linear**: 模板功能允许从预定义配置快速创建 issue，支持字段覆盖
- **n8n**: 工作流模板可以一键实例化，保留模板配置同时支持参数定制
- **ClickUp**: 任务模板支持「使用模板创建」按钮，保留默认值并允许即时修改

### 实现方案
- API: `POST /api/templates/:id/create-task` + optional overrides body
- MCP tool: `create_task_from_template` with field overrides
- 支持的 overrides: commandText, description, priority, tags, assignedDeviceId, dueDate, reminderAt
- 模板的 dueDateOffsetMs/reminderOffsetMs 自动转换为绝对时间

### 决策
- 使用合成 feishuMessageId（`tmpl_${id}_${ts}`）避免与真实消息冲突
- dueDate/reminderAt 支持两种模式：绝对时间覆盖 vs 模板偏移量自动计算
- 不修改 store 层，直接调用现有 createTask()

### 下一步研究方向
- 任务依赖关系的可视化（依赖图 DAG）
- 批量从模板创建（一次创建多个实例）
- 模板版本控制（支持模板历史版本）
