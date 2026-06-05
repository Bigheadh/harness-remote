# Phase 38: Dashboard Settings/Management Tab

## 概览 (Overview)

**日期**: 2026-06-06
**功能**: 在 Dashboard 中添加 Settings 管理标签页，提供 Users、Devices、Webhooks、Templates、Scheduled Tasks、SLA Policies 的管理界面。
**涉及文件数**: 2
**新增行数**: ~414 (dashboard.ts: +414, FEATURES.md: +10)

## 改动明细 (File Changes)

### src/server/dashboard/templates/dashboard.ts

| 改动位置 | 改前 | 改后 | 原因 | 影响 |
|---------|------|------|------|------|
| CSS 样式 (line ~426) | 无 Settings 相关样式 | 新增 `.settings-grid`, `.settings-card`, `.settings-table`, `.settings-form`, `.role-badge-*` 样式 | 保持与现有暗色主题一致 | Settings 卡片以响应式网格布局显示 |
| 导航标签 (line ~453) | 2 个标签: Tasks, Analytics | 3 个标签: Tasks, Analytics, Settings | 新增管理标签 | 用户可从 header 访问设置 |
| HTML: settings 视图面板 (line ~524) | 仅有 `analyticsView` 面板 | 新增 `settingsView` 面板，含 6 个卡片 (Users, Devices, Webhooks, Templates, Scheduled, SLA) | 管理分区容器 | 每个卡片有表格 + 内联创建表单 |
| JS: switchView 函数 | 2 分支 (tasks/analytics) | 3 分支 (tasks/analytics/settings) | 路由到 settings 面板 | 点击标签时加载 settings |
| JS: loadSettings + 6 个 load* 函数 | 无 | 6 个异步函数，从 API 获取并渲染各实体列表 | 管理视图的数据加载 | 表格从 `/api/users`, `/api/devices` 等接口填充 |
| JS: create/delete/regenerate 函数 | 无 | 每个实体的 CRUD 函数 (submitCreate*, delete*, regenerate*) | 管理的写操作 | 表单显示/隐藏，API 调用，列表刷新 |
| HTML: 内联创建表单 | 无 | 6 个表单 (user, device, webhook, template, scheduled, SLA) 嵌入 settings 卡片中 | 创建新实体的输入 | 表单默认隐藏，点击 + 按钮切换 |

### FEATURES.md

新增 Phase 38 区段，含 8 个已完成项：Settings 标签 CSS、Users、Devices、Webhooks、Templates、Scheduled Tasks、SLA Policies 管理，以及 switchView 更新。

## 风险说明 (Risk)

**低风险** — 纯前端添加，无后端改动，所有 API 已存在且已测试。

## 验证步骤 (Verification)

1. `npm run typecheck` — 通过 (0 错误)
2. `npm run build` — 通过
3. `npm run test` — 11 个测试文件，270/270 测试通过
4. 手动验证: 打开 `/dashboard?token=...` → 点击 ⚙️ Settings 标签 → 验证 6 个管理分区正确加载
