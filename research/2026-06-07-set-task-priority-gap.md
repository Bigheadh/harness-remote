# Phase 57 研究文档: 字段 Setter 不对称分析

## 研究方向
Gap Pattern #3 — 字段 Setter 不对称 (Field Setter Asymmetry)

## 问题描述
Task 模型有多个可独立修改的字段（dueDate, reminderAt, description, priority, dependsOn, tags, pinned, assignedDeviceId），但 MCP 工具只覆盖了部分字段的独立 setter：
- ✅ set_task_due_date
- ✅ set_task_reminder  
- ✅ set_task_description
- ✅ set_task_dependencies
- ❌ set_task_priority ← 缺失
- ❌ set_task_pinned (有 pin_task/unpin_task)
- ❌ set_task_assigned_device (有 bulk_assign_tasks)

## 决策
优先实现 `set_task_priority`，原因：
1. **优先级是最高频操作** — 任务调度、自动升级、排序都依赖 priority
2. **数据模型已存在** — TaskPriority 类型、DB 列、STORE 排序逻辑全部就绪
3. **模式完全复用** — 只需照搬 set_task_due_date 的 layered architecture 模式
4. **Zod enum 验证** — MCP SDK 的 z.enum() 直接约束合法值，无需额外验证

## 实现难度
⭐ (1/5) — 纯模式复制，无新架构引入

## 参考项目
- **Linear**: Priority 四级制 (No Priority, Low, Medium, High, Urgent) — 与 harness-remote 的 low/normal/high/urgent 类似
- **Plane**: Priority 字段可独立设置，支持批量更新
- **Huly**: Priority setter 是独立 API 端点，非 PATCH 全量更新

## 下一步研究方向
1. 检查 set_task_pinned 是否需要独立 MCP 工具（当前有 pin_task/unpin_task，已覆盖）
2. 检查 set_task_assigned_device 是否需要独立 MCP 工具（当前有 bulk_assign_tasks，但无单任务 assign setter）
3. 研究 MCP 生态中的权限控制模式 — 如何在 MCP 工具层面实现 RBAC
