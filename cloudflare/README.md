# Cloudflare 配置文件

本目录包含用于在 Cloudflare 中配置 Claude Relay Service OpenAI Responses API 代理的配置文件。

## 文件说明

| 文件 | 用途 |
|------|------|
| `openapi-config.yaml` | OpenAPI 3.1 规范，用于 API Gateway / API Shield |
| `wrangler.toml` | Cloudflare Workers 配置文件 |
| `worker.js` | Cloudflare Worker 代理脚本 |
| `api-gateway-config.json` | API Gateway 通用配置（JSON格式） |

## 支持的端点

| 路径 | 方法 | 描述 |
|------|------|------|
| `/openai/responses` | POST | OpenAI Responses API 主端点 |
| `/openai/v1/responses` | POST | v1 别名路由 |
| `/openai/responses/compact` | POST | 紧凑格式端点 |
| `/openai/v1/responses/compact` | POST | 紧凑格式 v1 别名 |
| `/openai/usage` | GET | API Key 使用统计 |
| `/openai/key-info` | GET | API Key 详细信息 |

## 部署方式

### 方式一：Cloudflare Workers（推荐）

1. **安装 Wrangler CLI**
   ```bash
   npm install -g wrangler
   ```

2. **登录 Cloudflare**
   ```bash
   wrangler login
   ```

3. **配置环境变量**

   编辑 `wrangler.toml`，设置你的上游服务地址：
   ```toml
   [env.production.vars]
   UPSTREAM_URL = "https://your-relay-service.example.com"
   ```

4. **部署到生产环境**
   ```bash
   cd cloudflare
   wrangler deploy --env production
   ```

5. **配置自定义域名（可选）**

   在 Cloudflare Dashboard 中为 Worker 添加自定义路由。

### 方式二：Cloudflare API Shield

1. 登录 Cloudflare Dashboard
2. 进入 **Security** > **API Shield**
3. 点击 **Add API**
4. 上传 `openapi-config.yaml` 文件
5. 配置端点验证和速率限制规则

### 方式三：Cloudflare Gateway

使用 `api-gateway-config.json` 作为参考配置：

1. 在 Cloudflare Gateway 中创建新的 API
2. 按照 JSON 配置添加路由规则
3. 配置上游服务和健康检查

## 配置说明

### 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `UPSTREAM_URL` | 上游 Claude Relay Service 地址 | 必填 |
| `DEBUG` | 启用调试日志 | `false` |

### 请求头处理

**透传的请求头：**
- `Authorization` - API Key 认证
- `Content-Type` - 内容类型
- `Accept` - 接受的响应类型
- `User-Agent` - 客户端标识
- `Session_Id` / `X-Session-Id` - 会话 ID
- `Version` - API 版本
- `OpenAI-Beta` - Beta 功能标识

**透传的响应头：**
- `Content-Type` - 内容类型
- `OpenAI-Version` - OpenAI 版本
- `X-Request-Id` - 请求 ID
- `OpenAI-Processing-Ms` - 处理时间

### 流式响应

Worker 完全支持 SSE 流式响应：
- 自动检测 `stream: true` 请求
- 禁用响应缓冲
- 正确设置流式响应头

### CORS 配置

默认允许所有来源的跨域请求。如需限制，修改 `worker.js` 中的 `CORS_HEADERS`：

```javascript
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://yourdomain.com',
  // ...
}
```

## 使用示例

### cURL 请求

```bash
curl -X POST "https://your-worker.workers.dev/openai/responses" \
  -H "Authorization: Bearer cr_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "input": "Hello, world!",
    "stream": true
  }'
```

### Codex CLI 配置

在 Codex CLI 中设置自定义 API 端点：

```bash
export OPENAI_API_BASE="https://your-worker.workers.dev/openai"
export OPENAI_API_KEY="cr_your_api_key"
```

## 监控和日志

### 查看 Worker 日志

```bash
wrangler tail --env production
```

### Cloudflare Analytics

在 Cloudflare Dashboard 中查看：
- 请求量统计
- 错误率
- 响应时间分布
- 地理分布

## 故障排除

### 常见问题

1. **502 Bad Gateway**
   - 检查 `UPSTREAM_URL` 是否正确
   - 确认上游服务正常运行

2. **401 Unauthorized**
   - 确认请求包含 `Authorization` 头
   - 检查 API Key 是否有效

3. **流式响应中断**
   - 确认 Worker 配置了足够的 CPU 时间
   - 检查上游服务的超时配置

### 调试模式

设置 `DEBUG=true` 启用详细日志：

```bash
wrangler deploy --env development
```

## 安全建议

1. **限制来源域名** - 在生产环境配置 CORS 白名单
2. **启用 WAF** - 使用 Cloudflare WAF 规则保护 API
3. **配置速率限制** - 在 Cloudflare 层面添加额外的限流保护
4. **监控异常** - 设置告警规则监控错误率和延迟

## 许可证

与主项目保持一致。
