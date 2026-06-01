# Change Log: Bearer Token Validation Tests

## 概览

| 日期 | 任务 | 涉及文件数 | 增加行数 | 删除行数 |
|------|------|-----------|---------|---------|
| 2026-06-02 | Phase 13: shared/http.test.ts | 4 | +109 | -5 |

## 逐文件改动

### 1. test/shared/http.test.ts

**改前**: 空桩文件，仅含 `// TODO: add shared HTTP/auth helper tests.`（1 行）

**改后**: 10 个测试用例覆盖 `requireBearerToken` 的所有分支：
- 验证正确 token 返回 token 字符串
- 验证 Bearer 前缀大小写不敏感
- 验证 token 前后空格被 trim
- 验证 undefined header 抛出 AppError(code="unauthorized")
- 验证空字符串 header 抛出 AppError
- 验证非 Bearer 格式（如 Token、Basic）抛出格式错误
- 验证 token 不匹配抛出 "Invalid bearer token"
- 验证 "Bearer " 后无 token 抛出格式错误
- 验证 AUTHORIZATION_HEADER 常量值

**修改原因**: Phase 13 测试阶段的第一项，为共享 HTTP 鉴权工具建立回归测试基线。

**影响范围**: 仅测试文件，不影响生产代码。

**风险**: 低。纯测试新增。

### 2. test/server/tasks.store.test.ts

**改前**: 空桩 `// TODO: add task store tests after the SQLite implementation exists.`

**改后**: 最小占位测试（2 个 todo），避免 vitest 报 "No test suite found" 错误。

**修改原因**: vitest 运行时会因空文件报错，需至少一个 describe 块。

### 3. test/server/feishu.events.test.ts

**改前**: 空桩 `// TODO: add Feishu event parsing and deduplication tests.`

**改后**: 最小占位测试（2 个 todo）。

### 4. test/mcp-server/tools.test.ts

**改前**: 空桩 `// TODO: add MCP tool contract tests.`

**改后**: 最小占位测试（2 个 todo）。

### 5. FEATURES.md

**改前**: `- [ ] shared/http.test.ts - Bearer token validation`

**改后**: `- [x] shared/http.test.ts - Bearer token validation`

## 结构性摘要

- **新增**: `test/shared/http.test.ts` 完整测试（10 个测试用例）
- **重构**: 3 个占位测试文件从空桩改为最小 describe 块（避免 vitest 报错）
- **更新**: FEATURES.md 进度追踪

## 验证结果

- `npm run typecheck`: EXIT 0 ✅
- `npm run build`: EXIT 0 ✅
- `npm run test`: 10 passed, 6 todo ✅
- Git commit: `06cf6d8`
- GitHub push: 成功 (master -> origin/master)
