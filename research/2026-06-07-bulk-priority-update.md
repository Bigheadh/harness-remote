# Research: Bulk Priority Update — Gap Analysis

**Date**: 2026-06-07
**Phase**: 61
**Gap Pattern**: #3 — Field setter asymmetry (bulk operations)

## 发现过程

通过对比现有 bulk 操作和单字段 setter 操作，发现以下不对称：

| 操作 | 单任务 MCP 工具 | 批量 MCP 工具 |
|------|----------------|--------------|
| 状态更新 | ❌ (通过 mark_task_running) | ✅ bulk_update_status |
| 设备分配 | ❌ (通过 assign_task) | ✅ bulk_assign_tasks |
| 任务删除 | ✅ (DELETE route) | ✅ bulk_delete_tasks |
| 添加标签 | ✅ manage_task_tags (add) | ✅ bulk_add_tags |
| 移除标签 | ✅ manage_task_tags (remove) | ✅ bulk_remove_tags |
| 优先级更新 | ✅ set_task_priority | ❌ **缺失** |
| 归档/恢复 | ✅ archive_task / unarchive_task | ✅ bulk_archive_tasks / bulk_unarchive_tasks |

`bulk_update_priority` 是唯一缺失的批量操作。其他字段（状态、分配、标签、归档）都有对应的批量工具。

## 参考项目

- **Linear**: 支持批量更新 issue priority（快捷键操作）
- **Plane**: 支持批量修改属性（优先级、状态、标签）
- **Jira**: 支持批量编辑优先级（Bulk Edit → Priority 字段）

这些工具都提供批量优先级更新功能，说明这是任务管理工具的常见需求。

## 实现方案

遵循现有 bulk 操作的分层架构模式：

1. **Store 层**: `bulkUpdatePriority(ids, priority)` — 逐个验证任务存在后更新 priority
2. **API 路由**: `POST /api/tasks/bulk/priority` — 带 auth、priority 验证、审计日志、SSE 广播
3. **MCP 客户端**: `bulkUpdatePriority(ids, priority)` — HTTP fetch 调用新路由
4. **MCP 工具**: `bulk_update_priority` — AI 代理可批量更新优先级

实现难度: ⭐ (1/5) — 完全遵循现有模式, 无新技术栈

## 下一步研究方向

- 检查是否有更多字段级别的不对称（如批量设置 due date）
- 研究自定义字段（custom fields）的可行性
- 考虑添加批量设置 estimated_minutes 的能力
