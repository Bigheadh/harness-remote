# Changelog: Task Attachment Support

**Date**: 2026-06-02
**Task**: Task attachment support (file metadata on tasks)
**Files Modified**: 5
**Lines Added**: ~120
**Lines Removed**: ~15

## 概览表

| 日期 | 任务 | 涉及文件数 | 增行数 | 删行数 |
|------|------|-----------|--------|--------|
| 2026-06-02 | Task attachment support | 5 | ~120 | ~15 |

## 逐文件改动

### 1. `src/shared/types.ts`

**改动 1: 新增 `FeishuFileType` 类型和 `Attachment` 接口**
- 位置: 行 5-15 (新增)
- 改前: 无
- 改后:
  ```ts
  export type FeishuFileType = "text" | "image" | "file" | "audio" | "media" | "sticker" | "post" | "interactive";

  export interface Attachment {
    fileKey: string;
    fileName: string;
    fileType: string;
    fileSize?: number;
    feishuFileType: FeishuFileType;
  }
  ```
- 修改原因: 定义附件元数据结构，支持飞书文件/图片/音频/视频消息的元数据存储
- 影响范围: 全项目类型系统，所有引用 Task 类型的文件

**改动 2: Task 接口新增 `attachments` 可选字段**
- 位置: 行 24 (新增)
- 改前: `Task` 接口无 `attachments` 字段
- 改后: `attachments?: Attachment[];`
- 修改原因: 允许任务携带附件元数据
- 影响范围: 所有创建/读取 Task 的代码

### 2. `src/server/tasks/store.ts`

**改动 1: 导入 `Attachment` 类型**
- 位置: 行 4
- 改前: `import type { Task, TaskStatus, TaskPriority } from "../../shared/types.js";`
- 改后: `import type { Task, TaskStatus, TaskPriority, Attachment } from "../../shared/types.js";`
- 修改原因: 需要 Attachment 类型来解析 JSON 列

**改动 2: 新增 `parseAttachments` 辅助函数**
- 位置: 行 46-56 (新增)
- 改前: 无
- 改后:
  ```ts
  function parseAttachments(raw: unknown): Attachment[] | undefined {
    if (!raw || typeof raw !== "string") return undefined;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
      return parsed as Attachment[];
    } catch {
      return undefined;
    }
  }
  ```
- 修改原因: SQLite 中附件以 JSON TEXT 存储，需要反序列化
- 影响范围: `rowToTask` 函数

**改动 3: `rowToTask` 解析 attachments**
- 位置: 行 68
- 改前: `source: row["source"] as "feishu",`
- 改后: `source: "feishu",` (硬编码，避免类型断言)
- 位置: 行 71 (新增)
- 改后: `attachments: parseAttachments(row["attachments"]),`
- 修改原因: 从数据库行中提取并解析附件 JSON

**改动 4: 新增 `attachments` 列迁移**
- 位置: 行 109-114 (新增)
- 改前: 无
- 改后:
  ```ts
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN attachments TEXT`);
  } catch {
    // Column already exists, ignore
  }
  ```
- 修改原因: 向后兼容已有数据库，自动添加新列

**改动 5: INSERT 语句增加 `attachments` 列**
- 位置: 行 130-131
- 改前: `INSERT INTO tasks (..., created_at, updated_at) VALUES (?, ?, ..., ?, ?)`
- 改后: `INSERT INTO tasks (..., attachments, created_at, updated_at) VALUES (?, ?, ..., ?, ?, ?)`
- 修改原因: 新列需要在插入时写入

**改动 6: `createTask` 方法序列化 attachments**
- 位置: 行 185-187 (新增)
- 改后:
  ```ts
  const attachmentsJson = task.attachments && task.attachments.length > 0
    ? JSON.stringify(task.attachments)
    : null;
  ```
- 位置: 行 198 (新增参数)
- 改后: `attachmentsJson,` 作为 INSERT 参数
- 修改 reason: 将 TypeScript 对象序列化为 JSON 存入 SQLite

### 3. `src/server/feishu/events.ts`

**改动 1: 导入新类型**
- 位置: 行 2
- 改前: `import type { Task, TaskPriority } from "../../shared/types.js";`
- 改后: `import type { Task, TaskPriority, Attachment, FeishuFileType } from "../../shared/types.js";`

**改动 2: `FeishuEventContext` 接口扩展**
- 位置: 行 36-37 (新增)
- 改后: `messageType: string;` 和 `attachments: Attachment[];`
- 修改原因: 事件上下文需要传递消息类型和附件信息

**改动 3: `FeishuEvent` 接口增加 `message_type`**
- 位置: 行 59 (新增)
- 改后: `message_type?: string;`
- 修改原因: 飞书事件体包含 message_type 字段

**改动 4: `parseFeishuEvent` 解析多种消息类型**
- 位置: 行 114-176 (大幅重写)
- 改前: 只解析 `{ text: string }` 格式
- 改后: 根据 `message_type` 分支处理 text/file/image/audio/media 等类型
- 修改原因: 飞书用户可能发送文件、图片、语音、视频等非文本消息
- 影响范围: 所有飞书事件处理流程

**改动 5: 返回值增加 `messageType` 和 `attachments`**
- 位置: 行 198-199 (新增)
- 改后: 在 return 对象中添加 `messageType` 和 `attachments`

**改动 6: `createTaskFromFeishuEvent` 传递 attachments**
- 位置: 行 219 (新增)
- 改后: `attachments: event.attachments.length > 0 ? event.attachments : undefined,`
- 修改原因: 将解析出的附件元数据存入任务

### 4. `test/server/feishu.events.test.ts`

**改动: 完全重写测试文件**
- 原有 19 个测试扩展为 28 个测试
- 更新所有 `parseFeishuEvent` 测试以期望 `messageType` 和 `attachments` 字段
- 更新 `createTaskFromFeishuEvent` 测试的 event 对象以包含新字段
- 新增 9 个测试:
  - file 消息解析和附件提取
  - image 消息解析和附件提取
  - audio 消息解析和附件提取
  - media (video) 消息解析和附件提取
  - messageType 默认值测试
  - 未知消息类型处理
  - file 消息缺少 file_key 的容错
  - attachments 为空时 task.attachments 为 undefined
  - attachments 非空时正确传递

### 5. `test/server/tasks.store.test.ts`

**改动: 新增 5 个 attachment 存储测试**
- 位置: 行 396-507 (新增)
- 新增测试:
  - 存储和读取带附件的任务
  - 无附件任务的 attachments 为 undefined
  - 存储多个附件
  - listTasks 保留 attachments
  - searchTasks 保留 attachments

### 6. `FEATURES.md`

**改动: 标记 task attachment support 为已完成**
- 位置: 行 122
- 改前: `- [ ] Task attachment support (file metadata on tasks)`
- 改后: `- [x] Task attachment support (file metadata on tasks)`

## 结构性摘要

- **新增**: `Attachment` 接口、`FeishuFileType` 类型、`parseAttachments` 辅助函数
- **新增**: SQLite `attachments TEXT` 列（带迁移）
- **新增**: 飞书 file/image/audio/media 消息类型解析
- **新增**: 14 个测试（9 个事件解析 + 5 个存储）
- **重构**: `parseFeishuEvent` 从单分支 text 解析扩展为多分支消息类型解析

## 风险说明

- **低风险**: `attachments` 列为可选，已有任务不受影响
- **低风险**: `rowToTask` 中 `parseAttachments` 对空值/无效 JSON 返回 undefined，不会崩溃
- **中风险**: `parseFeishuEvent` 的 text 分支逻辑未变，但代码结构大幅调整——已通过所有现有测试验证

## 验证步骤

```bash
cd /opt/harness-remote
npm run typecheck   # ✅ EXIT: 0
npm run build       # ✅ EXIT: 0
npm run test        # ✅ 141/141 tests passed
```
