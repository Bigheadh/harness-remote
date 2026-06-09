# Phase 84: Dashboard Settings - Cycles Management UI

## 概览

| 项目 | 值 |
|------|-----|
| 日期 | 2026-06-09 |
| 任务 | 添加 Dashboard Settings 标签页中的 Cycles（迭代周期）管理 UI |
| 涉及文件 | 1 个 |
| 增加行数 | ~75 行 |

## 涉及文件

### src/server/dashboard/templates/dashboard.ts

#### 改动 1: HTML — Cycles 设置卡片 (line ~811)

**改前**: Settings 标签页有 8 个管理卡片（Users, Devices, Webhooks, Templates, Scheduled Tasks, SLA, Saved Views, Modules），无 Cycles 管理 UI。

**改后**: 新增第 9 个卡片 "🔄 Cycles (Sprints)"，包含：
- 列表表格（Name, Status, Dates, Tasks, Actions）
- "+ Add Cycle" 按钮
- 创建表单（name, description, start date, end date）

**原因**: Cycles 已有完整的后端支持（store + 9 条 API 路由 + 9 个 MCP 工具），但缺少 Dashboard 管理界面。属于 gap pattern #5（Missing dashboard management UI）。

**影响范围**: Dashboard Settings 标签页新增一个实体管理卡片。

#### 改动 2: JS — loadSettings() 函数 (line ~1865)

**改前**: `loadSettings()` 调用 8 个 load 函数。

**改后**: 新增 `loadSettingsCycles()` 调用。

**原因**: 确保切换到 Settings 标签时自动加载 Cycles 数据。

#### 改动 3: JS — Cycles 管理函数 (line ~2193)

**改前**: 无 Cycles 相关 JS 函数。

**改后**: 新增 4 个函数：
- `loadSettingsCycles()` — 调用 `GET /api/cycles`，渲染表格（状态 emoji、日期范围、任务计数）
- `openCreateCycleModal()` — 切换创建表单显示
- `submitCreateCycle()` — 调用 `POST /api/cycles` 创建新周期
- `deleteCycle(id, name)` — 调用 `DELETE /api/cycles/:id` 删除周期（带确认提示）

**原因**: 实现 Cycles 的 Dashboard CRUD 管理功能。

**影响范围**: Dashboard 前端 JS 逻辑。

## 风险说明

- **低风险**: 纯前端变更，不涉及后端逻辑修改。
- Cycles API 已存在且经过测试，Dashboard 只是新增调用方。
- 创建表单验证确保必填字段（name, startDate, endDate）非空。

## 验证步骤

1. ✅ `npm run typecheck` — 通过
2. ✅ `npm run build` — 通过
3. ✅ `npm test` — 560 测试全部通过
4. 手动验证：打开 Dashboard → Settings → 应看到 "🔄 Cycles (Sprints)" 卡片
