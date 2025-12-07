/**
 * Cloudflare Worker - Claude Relay Service OpenAI Responses API Proxy
 *
 * 此 Worker 将请求代理到 Claude Relay Service 的 OpenAI Responses 端点
 * 支持流式响应、CORS、请求头透传等功能
 */

// 允许的路由路径
const ALLOWED_PATHS = [
  '/openai/responses',
  '/openai/v1/responses',
  '/openai/responses/compact',
  '/openai/v1/responses/compact',
  '/openai/usage',
  '/openai/key-info'
]

// 需要透传的请求头
const PASSTHROUGH_REQUEST_HEADERS = [
  'authorization',
  'content-type',
  'accept',
  'user-agent',
  'session_id',
  'x-session-id',
  'version',
  'openai-beta'
]

// 需要透传的响应头
const PASSTHROUGH_RESPONSE_HEADERS = [
  'content-type',
  'openai-version',
  'x-request-id',
  'openai-processing-ms',
  'x-ratelimit-limit-requests',
  'x-ratelimit-limit-tokens',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-requests',
  'x-ratelimit-reset-tokens'
]

// CORS 配置
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, User-Agent, Session_Id, X-Session-Id, Version, OpenAI-Beta',
  'Access-Control-Max-Age': '86400'
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      })
    }

    // 健康检查端点
    if (path === '/health' || path === '/openai/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'claude-relay-openai-proxy',
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        }
      )
    }

    // 验证路径是否允许
    const isAllowedPath = ALLOWED_PATHS.some(
      (allowed) => path === allowed || path.startsWith(allowed + '/')
    )

    if (!isAllowedPath) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Not Found',
            type: 'invalid_request_error',
            code: 'not_found'
          }
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        }
      )
    }

    // 验证 Authorization 头
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Missing Authorization header',
            type: 'authentication_error',
            code: 'missing_api_key'
          }
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        }
      )
    }

    try {
      // 构建上游 URL
      const upstreamUrl = new URL(path, env.UPSTREAM_URL)
      upstreamUrl.search = url.search

      // 构建请求头
      const headers = new Headers()
      for (const headerName of PASSTHROUGH_REQUEST_HEADERS) {
        const value = request.headers.get(headerName)
        if (value) {
          headers.set(headerName, value)
        }
      }

      // 添加客户端真实 IP
      const clientIP =
        request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')
      if (clientIP) {
        headers.set('x-real-ip', clientIP)
        headers.set('x-forwarded-for', clientIP)
      }

      // 添加 Cloudflare 请求 ID
      const cfRay = request.headers.get('cf-ray')
      if (cfRay) {
        headers.set('x-cf-ray', cfRay)
      }

      // 调试日志
      if (env.DEBUG === 'true') {
        console.log(`[Proxy] ${request.method} ${path} -> ${upstreamUrl.toString()}`)
      }

      // 判断是否为流式请求
      let isStreamRequest = false
      let requestBody = null

      if (request.method === 'POST') {
        const clonedRequest = request.clone()
        try {
          const body = await clonedRequest.json()
          isStreamRequest = body.stream !== false
          requestBody = JSON.stringify(body)
        } catch (e) {
          // 如果解析失败，直接透传原始 body
          requestBody = await request.text()
        }
      }

      // 发送请求到上游
      const upstreamResponse = await fetch(upstreamUrl.toString(), {
        method: request.method,
        headers,
        body: requestBody
      })

      // 构建响应头
      const responseHeaders = new Headers()

      // 透传上游响应头
      for (const headerName of PASSTHROUGH_RESPONSE_HEADERS) {
        const value = upstreamResponse.headers.get(headerName)
        if (value) {
          responseHeaders.set(headerName, value)
        }
      }

      // 添加 CORS 头
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(key, value)
      }

      // 处理流式响应
      if (isStreamRequest && upstreamResponse.headers.get('content-type')?.includes('text/event-stream')) {
        responseHeaders.set('Content-Type', 'text/event-stream')
        responseHeaders.set('Cache-Control', 'no-cache')
        responseHeaders.set('Connection', 'keep-alive')
        responseHeaders.set('X-Accel-Buffering', 'no')

        // 使用 TransformStream 处理流式响应
        const { readable, writable } = new TransformStream()

        // 在后台处理流
        ctx.waitUntil(
          (async () => {
            const reader = upstreamResponse.body.getReader()
            const writer = writable.getWriter()

            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                await writer.write(value)
              }
            } catch (error) {
              console.error('[Stream Error]', error)
            } finally {
              await writer.close()
            }
          })()
        )

        return new Response(readable, {
          status: upstreamResponse.status,
          headers: responseHeaders
        })
      }

      // 非流式响应
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders
      })
    } catch (error) {
      console.error('[Proxy Error]', error)

      return new Response(
        JSON.stringify({
          error: {
            message: 'Internal proxy error',
            type: 'internal_error',
            details: env.DEBUG === 'true' ? error.message : undefined
          }
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        }
      )
    }
  }
}
