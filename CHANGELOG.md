# Changelog

本文档记录 Claude Relay Service 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### Added - 新增功能

#### 🆕 统一 v1 路由系统

引入全新的统一路由架构，简化 API 端点结构：

**核心端点:**
- `POST /v1/messages` - Claude 消息处理
- `GET /v1/me` - 用户信息
- `POST /v1/models/:model:generateContent` - Gemini 生成
- `POST /v1/models/:model:streamGenerateContent` - Gemini 流式
- `POST /v1/chat/completions` - OpenAI 兼容（智能路由）
- `GET /v1/models` - 模型列表
- `GET /v1/usage` - 使用统计
- `GET /v1/key-info` - API Key 信息

**Droid 路由:**
- `POST /droid/v1/messages` - Droid Claude 端点
- `POST /droid/v1/chat/completions` - Droid OpenAI 端点

**智能路由功能:**
- `/v1/chat/completions` 支持根据 `model` 参数自动识别服务类型
- 自动路由到 Claude、Gemini 或 OpenAI 服务
- 根据 API Key 权限智能选择默认服务

**文档和工具:**
- 新增 `docs/ROUTE_MIGRATION.md` - 详细的路由迁移指南
- 新增 `scripts/test-v1-routes.js` - 路由功能测试脚本
- 更新所有 README 文件中的配置示例

### Changed - 变更

#### 路由注册优化

- 统一路由 `/v1/*` 现在具有最高优先级
- 优化路由注册顺序，提高匹配效率
- 改进路由组织结构，按功能分组

#### 文档更新

- README.md 和 README_EN.md 中所有客户端配置示例已更新
- CLAUDE.md 文档中的端点列表已更新
- 所有配置示例现在标注了新旧路由的区别

### Deprecated - 废弃（但继续支持）

以下路由仍然可用，但建议迁移到新的 `/v1/*` 路由：

- `/api/v1/*` → 推荐使用 `/v1/*`
- `/claude/v1/*` → 推荐使用 `/v1/*`
- `/gemini/v1/*` → 推荐使用 `/v1/*`
- `/openai/v1/*` → 推荐使用 `/v1/*`
- `/droid/claude/v1/*` → 推荐使用 `/droid/v1/*`
- `/droid/openai/v1/*` → 推荐使用 `/droid/v1/*`

**重要说明:** 所有旧路由将**永久保持向后兼容**，不会被移除。

### Fixed - 修复

无

### Security - 安全

无

---

## 优势和收益

### 🎯 更简洁的 API 设计

- **路径更短**: `/v1/messages` vs `/api/v1/messages`
- **结构统一**: 所有服务使用相同的路径前缀
- **易于记忆**: 符合 REST API 最佳实践

### 🔀 智能路由

- 一个端点支持多种模型（Claude、Gemini、OpenAI）
- 自动根据模型名称识别服务类型
- 减少客户端配置复杂度

### 📊 更好的用户体验

- 降低配置门槛，新手更容易上手
- 统一的端点减少记忆负担
- 灵活的迁移策略，无需强制升级

### ⚡ 性能优化

- 优化路由匹配顺序，提高请求处理速度
- 减少路由规则数量，降低维护成本

---

## 迁移指南

### 快速迁移（推荐）

如果你想立即享受新路由的优势：

```bash
# Claude Code
export ANTHROPIC_BASE_URL="http://your-server:3000/v1/"

# Gemini CLI
export GOOGLE_GEMINI_BASE_URL="http://your-server:3000/v1"

# Cherry Studio / 其他第三方工具
API地址: http://your-server:3000/v1
```

### 渐进迁移（稳妥）

如果你需要时间测试：

1. 在开发环境先测试新路由
2. 使用 `scripts/test-v1-routes.js` 验证功能
3. 逐步迁移生产环境的客户端

### 不迁移（兼容）

如果你不想更改现有配置：

- 旧路由将**永久支持**，没有时间压力
- 功能完全一致，性能差异可忽略
- 可以随时选择迁移

详细迁移指南请参考: [docs/ROUTE_MIGRATION.md](docs/ROUTE_MIGRATION.md)

---

## 测试和验证

### 运行测试脚本

```bash
# 使用默认配置
node scripts/test-v1-routes.js http://localhost:3000 cr_your_api_key

# 使用环境变量
export TEST_API_KEY=cr_your_api_key
node scripts/test-v1-routes.js
```

### 手动测试

```bash
# 测试健康检查
curl http://localhost:3000/health

# 测试用户信息（需要 API Key）
curl -H "Authorization: Bearer cr_your_api_key" \
     http://localhost:3000/v1/me

# 测试模型列表
curl -H "Authorization: Bearer cr_your_api_key" \
     http://localhost:3000/v1/models
```

---

## 技术细节

### 新增文件

- `src/routes/v1Routes.js` - 统一 v1 路由实现
- `docs/ROUTE_MIGRATION.md` - 迁移指南文档
- `scripts/test-v1-routes.js` - 测试脚本
- `CHANGELOG.md` - 变更日志

### 修改文件

- `src/app.js` - 路由注册和优先级调整
- `src/routes/droidRoutes.js` - 新增 `/v1/*` 路由
- `README.md` - 更新中文文档
- `README_EN.md` - 更新英文文档
- `CLAUDE.md` - 更新开发文档

### 架构改进

- 智能服务类型检测（基于 model 参数和 modelService）
- 权限检查抽象化为可复用函数
- 统一的错误响应格式
- 完整的向后兼容保证

---

## 反馈和支持

如果在使用新路由过程中遇到问题：

1. **查看文档**: [docs/ROUTE_MIGRATION.md](docs/ROUTE_MIGRATION.md)
2. **运行测试**: `node scripts/test-v1-routes.js`
3. **查看日志**: `logs/claude-relay-*.log`
4. **提交 Issue**: [GitHub Issues](https://github.com/Wei-Shaw/claude-relay-service/issues)
5. **Telegram 群组**: [claude_relay_service](https://t.me/claude_relay_service)

---

**更新日期**: 2025-01-06  
**影响范围**: 新增功能，完全向后兼容  
**建议操作**: 建议迁移到新路由，但不强制

