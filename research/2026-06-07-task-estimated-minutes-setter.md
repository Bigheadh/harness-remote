# Phase 60 Research: Task Time Estimate Setter

## 研究方向
任务时间管理 — 参考 Linear、Plane、Huly 等项目管理工具的时间估算功能

## 研究背景
harness-remote 的 Task 类型在 Phase 49 添加了 `estimatedMinutes` 字段和数据库列，
但一直没有对应的 setter 工具。这意味着用户/AI 代理无法通过 MCP 设置任务时间估算，
只能在创建任务时由系统自动设置。这限制了时间估算的实际使用价值。

## 参考项目分析

### Linear
- 任务有 `estimate` 字段（story points），可在任务详情页手动设置
- 支持按估算值筛选和排序
- 估算与实际完成时间对比用于团队 velocity 计算

### Plane
- 任务有 `estimate_point` 字段
- 支持在看板视图中显示估算值
- 提供估算 vs 实际的统计图表

### Huly
- 任务有 `estimate` 字段
- 支持时间跟踪与估算对比
- 提供团队工作量分析

## 实现决策
- **选择**: 实现 `set_task_estimated_minutes` MCP 工具
- **原因**: 
  1. 数据库列已存在，只需添加 setter
  2. 遵循已有的 setter 模式（set_task_priority、set_task_due_date）
  3. 支持 null 值以清除估算
  4. 为后续的时间估算 vs 实际对比分析功能打下基础
- **难度**: ⭐⭐ (2/5) — 标准分层架构，模式成熟

## 下一步研究方向
1. **时间估算 vs 实际对比报告** — 新增 MCP 工具返回估算与实际的对比数据
2. **任务活动流按类型过滤** — get_task_activity 支持按 action 类型筛选
3. **批量设置任务属性** — 批量设置估算、优先级等
4. **任务标签颜色** — 为标签添加颜色属性，提升可视化效果
