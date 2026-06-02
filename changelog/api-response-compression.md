# 变更记录 — API Response Compression

## 概览

| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-03 |
| 功能 | API response compression (gzip/deflate via @fastify/compress) |
| 涉及文件数 | 2 |

---

## 文件 1：`package.json`

### 改动 1：新增 @fastify/compress 依赖

**改后**：新增 `"@fastify/compress": "^x.x.x"` 依赖

**原因**：需要 Fastify 官方压缩插件来为所有 HTTP 响应启用 gzip/deflate 自动压缩，减少网络传输体积。

**影响范围**：仅新增依赖，不影响现有功能。

---

## 文件 2：`src/server/index.ts`

### 改动 1：导入 @fastify/compress

**位置**：文件顶部 import 区域，`import { createLogger }` 之前

**改前**：
```typescript
import { recordHttpRequest } from "./metrics/collector.js";
import { createLogger } from "../shared/logger.js";
```

**改后**：
```typescript
import { recordHttpRequest } from "./metrics/collector.js";
import compress from "@fastify/compress";
import { createLogger } from "../shared/logger.js";
```

**原因**：需要导入 Fastify 压缩插件以注册到服务器实例。

**影响范围**：仅新增导入语句。

---

### 改动 2：注册压缩插件

**位置**：Fastify 实例创建后、请求日志中间件之前

**改后**：
```typescript
const server = Fastify({
  logger: false,
});

// Enable response compression (gzip/deflate) for all routes
await server.register(compress, {
  threshold: 1024,
  encodings: ["gzip", "deflate"],
});
```

**原因**：注册 `@fastify/compress` 插件，启用所有路由的响应自动压缩。配置说明：
- `threshold: 1024` — 仅压缩大于 1KB 的响应，避免小响应因压缩元数据反而变大
- `encodings: ["gzip", "deflate"]` — 支持两种编码，客户端通过 `Accept-Encoding` 协商

**影响范围**：所有 API 响应将自动根据客户端 `Accept-Encoding` 头进行压缩。MCP stdio 通信不受影响（不经过 HTTP）。

---

## 结构性摘要

- **新增依赖**：`@fastify/compress` — Fastify 官方响应压缩插件
- **修改**：`src/server/index.ts` — 导入插件并注册到 Fastify 服务器

## 风险说明

- **低风险**：插件由 Fastify 官方维护，成熟稳定
- **性能影响**：增加少量 CPU 开销用于压缩/解压，但网络带宽显著减少（通常 60-80% 压缩率）
- **兼容性**：客户端需支持 gzip/deflate（所有现代 HTTP 客户端均支持）
- **阈值设置**：1KB 阈值避免小响应（如 health check JSON）的无效压缩

## 验证步骤

1. ✅ `npm run typecheck` 通过
2. ✅ `npm run build` 通过
3. ✅ 压缩插件正确注册，所有响应自动压缩
