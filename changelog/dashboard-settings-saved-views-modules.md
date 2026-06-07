# Phase 71: Dashboard Settings — Saved Views & Modules Management UI

## Overview

| 项目 | 值 |
|------|-----|
| 日期 | 2026-06-08 |
| 任务 | 添加 Saved Views 和 Modules 管理到 Dashboard Settings 标签 |
| 涉及文件数 | 2 |
| 增行数 | ~85 |
| 删行数 | 0 |

## 文件改动

### 1. `src/server/dashboard/templates/dashboard.ts`

#### 改动 1: HTML — 新增 Saved Views 和 Modules settings 卡片

**位置**: Settings grid HTML（SLA 卡片之后）

**改前**: Settings grid 只有 6 个卡片（Users, Devices, Webhooks, Templates, Scheduled, SLA）

**改后**: 新增 2 个卡片：
- 👁️ Saved Views — 显示所有保存的视图，支持创建（名称 + JSON filters）和删除
- 📦 Modules (Epics) — 显示所有模块，支持创建（名称 + 描述）和删除

**原因**: Saved Views 和 Modules 是已实现的后端实体（完整 CRUD API + MCP 工具），但 Dashboard 缺少对应的管理 UI。这是 gap pattern #5（Dashboard management UI gap）的典型场景。

**影响范围**: Dashboard Settings 标签页，用户可通过浏览器管理 Saved Views 和 Modules。

#### 改动 2: JavaScript — 新增 6 个 JS 函数

**位置**: `<script>` 标签内，SLA 函数之前

**新增函数**:
1. `loadSettingsSavedViews()` — 从 `/api/saved-views` 加载并渲染视图列表表格
2. `openCreateSavedViewModal()` — 切换创建视图表单显示
3. `submitCreateSavedView()` — 提交创建视图请求（解析 JSON filters）
4. `deleteSavedView(id)` — 确认后删除视图
5. `loadSettingsModules()` — 从 `/api/modules` 加载并渲染模块列表表格
6. `openCreateModuleModal()` — 切换创建模块表单显示
7. `submitCreateModule()` — 提交创建模块请求
8. `deleteModule(id)` — 确认后删除模块（任务会被取消关联，不会删除）

**原因**: Dashboard 需要前端函数来与后端 API 交互，实现 CRUD 操作。

**影响范围**: Dashboard 前端 JavaScript。

#### 改动 3: loadSettings() 初始化

**位置**: `loadSettings()` 函数

**改前**: 调用 6 个 load 函数
**改后**: 调用 8 个 load 函数（新增 `loadSettingsSavedViews()` 和 `loadSettingsModules()`）

**原因**: 确保切换到 Settings 标签时自动加载新卡片的数据。

### 2. `FEATURES.md`

新增 Phase 71 条目，记录 7 个子任务均为 `[x]` 完成状态。

## 结构性摘要

- **新增**: Saved Views 管理卡片（HTML + JS CRUD）
- **新增**: Modules 管理卡片（HTML + JS CRUD）
- **修改**: loadSettings() 初始化函数

## 风险说明

- **低风险**: 仅修改 Dashboard 前端模板，不涉及后端逻辑
- **无数据库变更**: 使用已有的 `/api/saved-views` 和 `/api/modules` API
- **无类型变更**: 纯 HTML/JS 模板修改

## 验证步骤

1. `npm run typecheck` — ✅ 通过
2. `npm run build` — ✅ 通过
3. 浏览器访问 Dashboard → Settings 标签 → 确认 Saved Views 和 Modules 卡片可见
4. 创建一个 Saved View → 确认出现在列表中
5. 创建一个 Module → 确认出现在列表中
6. 删除测试数据 → 确认删除操作正常
