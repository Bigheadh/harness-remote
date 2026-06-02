# Changelog: Multi-device Task Assignment

## 概览

| 日期 | 任务 | 涉及文件数 | 新增行数 | 删除行数 |
|------|------|-----------|---------|---------|
| 2026-06-02 | Multi-device task assignment (device registry and routing) | 9 | ~350 | ~30 |

## 逐文件改动

### 1. `src/shared/types.ts`

**改动 1**: 新增 `Device` 接口

- **改前**: 无 Device 类型
- **改后**:
  ```typescript
  export interface Device {
    id: string;
    name: string;
    token: string;
    capabilities?: string;
    lastSeen?: string;
    createdAt: string;
  }
  ```
- **原因**: 支持多设备注册和管理，每个设备有唯一 ID 和 token
- **影响范围**: 所有使用 Device 类型的模块

**改动 2**: Task 接口新增 `assignedDeviceId` 字段

- **改前**: `Task` 接口无设备分配字段
- **改后**: 新增 `assignedDeviceId?: string;`
- **原因**: 支持将任务分配给特定设备
- **影响范围**: Task 创建、列表、搜索都会包含此字段

### 2. `src/server/devices/store.ts` (新增文件)

**功能**: SQLite 设备注册表存储

- 创建 `devices` 表（id, name, token, capabilities, last_seen, created_at）
- 提供 CRUD 操作：registerDevice, listDevices, getDevice, getDeviceByToken, updateDeviceHeartbeat, deleteDevice
- 使用 WAL 模式提升并发读性能
- token 使用 `crypto.randomBytes` 生成，确保唯一性和安全性

### 3. `src/server/devices/routes.ts` (新增文件)

**功能**: 设备管理 API 路由

- `POST /api/devices` — 注册新设备（返回设备 ID 和 token）
- `GET /api/devices` — 列出所有设备
- `GET /api/tasks/:id` — 获取设备详情
- `POST /api/devices/:id/heartbeat` — 更新设备心跳
- `DELETE /api/devices/:id` — 删除设备

### 4. `src/server/tasks/store.ts`

**改动 1**: 新增 `assigned_device_id` 列（数据库迁移）

- **改前**: tasks 表无设备分配列
- **改后**: `ALTER TABLE tasks ADD COLUMN assigned_device_id TEXT`
- **原因**: 支持任务与设备的关联
- **影响范围**: 所有查询都会包含此列

**改动 2**: `listTasks` 方法新增 `deviceId` 参数

- **改前**: `listTasks(status?, limit?)`
- **改后**: `listTasks(status?, limit?, deviceId?)`
- **原因**: 支持按设备过滤任务列表
- **影响范围**: MCP list_tasks 工具和 API 都会使用此参数

**改动 3**: `searchTasks` 方法新增 `deviceId` 过滤

- **改前**: SearchOptions 无 deviceId
- **改后**: SearchOptions 新增 `deviceId?: string`
- **原因**: 支持按设备搜索历史任务

**改动 4**: 新增 `assignTask` 和 `unassignTask` 方法

- **改前**: 无任务分配方法
- **改后**: 提供 assignTask(taskId, deviceId) 和 unassignTask(taskId)
- **原因**: 支持手动分配和取消分配任务

### 5. `src/server/tasks/routes.ts`

**改动 1**: `GET /api/tasks` 新增 `deviceId` 查询参数

- **改前**: 仅支持 status 和 limit
- **改后**: 新增 `deviceId` 查询参数
- **原因**: 支持按设备过滤任务列表

**改动 2**: `GET /api/tasks/search` 新增 `deviceId` 查询参数

- **改前**: 仅支持 q, status, from, to, limit
- **改后**: 新增 `deviceId` 查询参数
- **原因**: 支持按设备搜索历史任务

**改动 3**: 新增 `POST /api/tasks/:id/assign` 路由

- **改前**: 无任务分配端点
- **改后**: 支持将任务分配给指定设备
- **原因**: 提供任务分配的 HTTP API

**改动 4**: 新增 `POST /api/tasks/:id/unassign` 路由

- **改前**: 无取消分配端点
- **改后**: 支持取消任务的设备分配
- **原因**: 提供取消分配的 HTTP API

### 6. `src/server/index.ts`

**改动 1**: 导入并注册 Device Store 和 Routes

- **改前**: 仅导入 Task Store 和 Routes
- **改后**: 新增导入 createDeviceStore 和 registerDeviceRoutes
- **原因**: 在服务器启动时初始化设备注册表

**改动 2**: 初始化设备存储并注册路由

- **改前**: 无设备相关初始化
- **改后**: 创建 deviceStore 并调用 registerDeviceRoutes
- **原因**: 启动设备管理 API

### 7. `src/mcp-server/config.ts`

**改动**: 新增可选 `deviceId` 字段

- **改前**: McpConfig 无 deviceId
- **改后**: 新增 `deviceId?: string`
- **原因**: MCP 服务器可以配置自己的设备 ID，用于自动过滤任务

### 8. `src/mcp-server/client.ts`

**改动 1**: `listTasks` 方法新增 `deviceId` 参数

- **改前**: `listTasks(status?, limit?)`
- **改后**: `listTasks(status?, limit?, deviceId?)`
- **原因**: 支持按设备过滤任务列表

**改动 2**: `searchTasks` 方法新增 `deviceId` 参数

- **改前**: SearchOptions 无 deviceId
- **改后**: SearchOptions 新增 `deviceId?: string`
- **原因**: 支持按设备搜索历史任务

**改动 3**: 新增 `registerDevice` 方法

- **改前**: 无设备注册方法
- **改后**: 提供 registerDevice(name, capabilities?) 方法
- **原因**: 支持 MCP 服务器自动注册为设备

### 9. `src/mcp-server/tools.ts`

**改动 1**: `list_tasks` 工具新增 `deviceId` 参数

- **改前**: 仅支持 status 和 limit
- **改后**: 新增 `deviceId` 可选参数
- **原因**: 支持按设备过滤任务列表

**改动 2**: `search_tasks` 工具新增 `deviceId` 参数

- **改前**: 仅支持 q, status, from, to, limit
- **改后**: 新增 `deviceId` 可选参数
- **原因**: 支持按设备搜索历史任务

**改动 3**: 新增 `register_device` 工具

- **改前**: 无设备注册工具
- **改后**: 提供 register_device(name, capabilities?) 工具
- **原因**: 允许 MCP 服务器自动注册为设备

### 10. `src/mcp-server/index.ts`

**改动**: 传递 deviceId 到 TaskApiClient

- **改前**: `createTaskApiClient(config.serverBaseUrl, config.personalToken)`
- **改后**: `createTaskApiClient(config.serverBaseUrl, config.personalToken, config.deviceId)`
- **原因**: 使用配置的 deviceId 自动过滤任务

### 11. `test/server/devices.store.test.ts` (新增文件)

**功能**: Device Store 单元测试

- 17 个测试用例覆盖所有 CRUD 操作
- 测试设备注册、列表、查询、心跳、删除
- 测试 token 唯一性和设备 ID 唯一性

### 12. `test/mcp-server/tools.test.ts`

**改动**: 更新工具数量检查

- **改前**: `expect(mockServer.registrations).toHaveLength(6)`
- **改后**: `expect(mockServer.registrations).toHaveLength(7)`
- **原因**: 新增了 register_device 工具

### 13. `FEATURES.md`

**改动**: 标记已完成

- **改前**: `- [ ] Multi-device task assignment (device registry and routing)`
- **改后**: `- [x] Multi-device task assignment (device registry and routing)`
- **原因**: 功能已实现并测试通过

## 结构性摘要

### 新增
- Device 类型定义
- Device Store（SQLite 设备注册表）
- Device Routes（设备管理 API）
- Task assign/unassign 方法
- register_device MCP 工具
- 17 个新的单元测试

### 修改
- Task 类型新增 assignedDeviceId 字段
- tasks 表新增 assigned_device_id 列
- listTasks 和 searchTasks 支持 deviceId 过滤
- MCP 配置支持 deviceId
- MCP Client 支持 deviceId 过滤和设备注册

## 风险说明

1. **数据库迁移**: 新增 assigned_device_id 列使用 ALTER TABLE，对现有数据库兼容
2. **向后兼容**: deviceId 是可选参数，不影响现有 API 使用
3. **Token 安全**: 设备 token 使用 crypto.randomBytes 生成，确保安全性

## 验证步骤

1. ✅ `npm run typecheck` — TypeScript 类型检查通过
2. ✅ `npm run build` — 构建成功
3. ✅ `npm run test` — 158 个测试全部通过
4. ✅ 设备注册 API 可正常工作
5. ✅ 任务分配/取消分配 API 可正常工作
6. ✅ 按设备过滤任务列表可正常工作
