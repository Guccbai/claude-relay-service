const express = require('express')
const router = express.Router()
const { authenticateApiKey } = require('../middleware/auth')
const logger = require('../utils/logger')

// 导入各服务的处理函数
const apiRoutes = require('./api')
const { handleMessagesRequest: apiHandleMessagesRequest } = require('./api')
const geminiRoutes = require('./geminiRoutes')
const openaiRoutes = require('./openaiRoutes')
const unifiedRoutes = require('./unified')

// 导入服务
const apiKeyService = require('../services/apiKeyService')
const modelService = require('../services/modelService')
const claudeAccountService = require('../services/claudeAccountService')
const geminiAccountService = require('../services/geminiAccountService')
const openaiAccountService = require('../services/openaiAccountService')

/**
 * 🔍 智能检测服务类型
 * 根据请求路径、model 参数、权限等判断应该路由到哪个服务
 */
function detectServiceType(req) {
  const path = req.path
  const model = req.body?.model || req.params?.model || ''

  // 1. 路径优先：Gemini 特定路径
  if (path.includes(':generateContent') || path.includes(':streamGenerateContent')) {
    return 'gemini'
  }

  // 2. 模型判断
  if (model) {
    try {
      const provider = modelService.getModelProvider(model)
      if (provider === 'anthropic') return 'claude'
      if (provider === 'google') return 'gemini'
      if (provider === 'openai') return 'openai'
    } catch (error) {
      // 降级到前缀匹配
      const modelLower = model.toLowerCase()
      if (modelLower.startsWith('claude-')) return 'claude'
      if (modelLower.startsWith('gemini-')) return 'gemini'
      if (
        modelLower.startsWith('gpt-') ||
        modelLower.startsWith('o1-') ||
        modelLower.startsWith('o3-')
      ) {
        return 'openai'
      }
    }
  }

  // 3. 路径默认：/v1/messages -> Claude
  if (path === '/messages' || path === '/v1/messages') {
    return 'claude'
  }

  // 4. /v1/chat/completions 默认 Claude（兼容 OpenAI 格式）
  if (path === '/chat/completions' || path === '/v1/chat/completions') {
    // 如果没有指定 model，检查权限决定默认服务
    const permissions = req.apiKey?.permissions || 'all'
    if (permissions === 'claude') return 'claude'
    if (permissions === 'gemini') return 'gemini'
    if (permissions === 'openai') return 'openai'
    return 'claude' // 默认 Claude
  }

  // 默认 Claude
  return 'claude'
}

/**
 * 🚦 权限检查
 */
function checkServicePermission(req, serviceType) {
  const permissions = req.apiKey?.permissions || 'all'

  if (permissions === 'all') {
    return { allowed: true }
  }

  if (permissions === serviceType) {
    return { allowed: true }
  }

  const serviceNames = {
    claude: 'Claude',
    gemini: 'Gemini',
    openai: 'OpenAI'
  }

  return {
    allowed: false,
    error: {
      type: 'permission_error',
      message: `此 API Key 无权访问 ${serviceNames[serviceType]} 服务`
    }
  }
}

// ============================================================================
// 📍 Claude 服务路由
// ============================================================================

/**
 * POST /v1/messages - Claude 消息处理（支持流式）
 */
router.post('/messages', authenticateApiKey, async (req, res) => {
  const serviceType = detectServiceType(req)
  const permissionCheck = checkServicePermission(req, serviceType)

  if (!permissionCheck.allowed) {
    return res.status(403).json({ error: permissionCheck.error })
  }

  // 路由到 api.js 的 handleMessagesRequest
  return apiHandleMessagesRequest(req, res)
})

/**
 * GET /v1/me - 用户信息
 */
router.get('/me', authenticateApiKey, async (req, res) => {
  try {
    // 返回模拟的用户信息（Claude Code 客户端需要）
    res.json({
      id: req.apiKey.id || 'user_' + Date.now(),
      name: req.apiKey.name || 'API User',
      email: `${req.apiKey.id}@relay.local`,
      created_at: new Date().toISOString(),
      api_key_id: req.apiKey.id,
      permissions: req.apiKey.permissions || 'all'
    })
  } catch (error) {
    logger.error('❌ Error fetching user info:', error)
    res.status(500).json({
      error: {
        type: 'server_error',
        message: 'Failed to fetch user information'
      }
    })
  }
})

/**
 * POST /v1/messages/count_tokens - Token 计数（Beta API）
 */
router.post('/messages/count_tokens', authenticateApiKey, async (req, res) => {
  const permissionCheck = checkServicePermission(req, 'claude')
  if (!permissionCheck.allowed) {
    return res.status(403).json({ error: permissionCheck.error })
  }

  // 简单的 token 估算
  const messages = req.body?.messages || []
  const totalChars = messages.reduce((sum, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    return sum + content.length
  }, 0)

  // 粗略估算：1 token ≈ 4 字符
  const estimatedTokens = Math.ceil(totalChars / 4)

  res.json({
    input_tokens: estimatedTokens
  })
})

// ============================================================================
// 📍 Gemini 服务路由
// ============================================================================

/**
 * POST /v1/models/:model:generateContent - Gemini 标准格式
 */
router.post('/models/:model\\:generateContent', authenticateApiKey, async (req, res) => {
  const permissionCheck = checkServicePermission(req, 'gemini')
  if (!permissionCheck.allowed) {
    return res.status(403).json({ error: permissionCheck.error })
  }

  // 调用 geminiRoutes 的处理函数
  return geminiRoutes.handleGenerateContent(req, res)
})

/**
 * POST /v1/models/:model:streamGenerateContent - Gemini 流式
 */
router.post('/models/:model\\:streamGenerateContent', authenticateApiKey, async (req, res) => {
  const permissionCheck = checkServicePermission(req, 'gemini')
  if (!permissionCheck.allowed) {
    return res.status(403).json({ error: permissionCheck.error })
  }

  // 调用 geminiRoutes 的处理函数
  return geminiRoutes.handleStreamGenerateContent(req, res)
})

// ============================================================================
// 📍 OpenAI 兼容路由（智能路由）
// ============================================================================

/**
 * POST /v1/chat/completions - OpenAI 格式（智能路由到 Claude/Gemini/OpenAI）
 */
router.post('/chat/completions', authenticateApiKey, async (req, res) => {
  const serviceType = detectServiceType(req)
  const permissionCheck = checkServicePermission(req, serviceType)

  if (!permissionCheck.allowed) {
    return res.status(403).json({ error: permissionCheck.error })
  }

  logger.info(`🔀 /v1/chat/completions routing to: ${serviceType}`)

  // 根据检测到的服务类型路由
  if (serviceType === 'claude') {
    // 路由到 OpenAI -> Claude 转换
    const openaiClaudeRoutes = require('./openaiClaudeRoutes')
    return openaiClaudeRoutes.handleChatCompletion(req, res, req.apiKey)
  } else if (serviceType === 'gemini') {
    // 路由到 OpenAI -> Gemini 转换
    const openaiGeminiRoutes = require('./openaiGeminiRoutes')
    return openaiGeminiRoutes.handleChatCompletion(req, res, req.apiKey)
  } else if (serviceType === 'openai') {
    // 路由到 OpenAI Responses 服务
    return openaiRoutes.handleResponses(req, res)
  }

  // 不应到达这里
  res.status(500).json({
    error: {
      type: 'routing_error',
      message: 'Failed to route request to appropriate service'
    }
  })
})

// ============================================================================
// 📍 模型列表和其他通用端点
// ============================================================================

/**
 * GET /v1/models - 模型列表（根据权限返回）
 */
router.get('/models', authenticateApiKey, async (req, res) => {
  try {
    const permissions = req.apiKey?.permissions || 'all'
    const allModels = []

    // 根据权限返回对应的模型列表
    if (permissions === 'all' || permissions === 'claude') {
      const claudeModels = modelService.getModelsByProvider('anthropic')
      allModels.push(...claudeModels)
    }

    if (permissions === 'all' || permissions === 'gemini') {
      const geminiModels = modelService.getModelsByProvider('google')
      allModels.push(...geminiModels)
    }

    if (permissions === 'all' || permissions === 'openai') {
      const openaiModels = modelService.getModelsByProvider('openai')
      allModels.push(...openaiModels)
    }

    // 转换为 OpenAI 格式
    const formattedModels = allModels.map((model) => ({
      id: model.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: model.provider || 'unknown',
      permission: [],
      root: model.id,
      parent: null
    }))

    res.json({
      object: 'list',
      data: formattedModels
    })
  } catch (error) {
    logger.error('❌ Error fetching models:', error)
    res.status(500).json({
      error: {
        type: 'server_error',
        message: 'Failed to fetch models'
      }
    })
  }
})

/**
 * GET /v1/usage - 使用统计查询
 */
router.get('/usage', authenticateApiKey, async (req, res) => {
  try {
    const { start_date, end_date } = req.query
    const apiKeyId = req.apiKey.id

    const usage = await apiKeyService.getUsageStats(apiKeyId, start_date, end_date)

    res.json({
      data: usage || [],
      has_more: false
    })
  } catch (error) {
    logger.error('❌ Error fetching usage:', error)
    res.status(500).json({
      error: {
        type: 'server_error',
        message: 'Failed to fetch usage statistics'
      }
    })
  }
})

/**
 * GET /v1/key-info - API Key 信息
 */
router.get('/key-info', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey

    res.json({
      id: apiKeyData.id,
      name: apiKeyData.name,
      permissions: apiKeyData.permissions || 'all',
      status: apiKeyData.status,
      created_at: apiKeyData.createdAt,
      rate_limit: apiKeyData.rateLimit || null,
      usage: {
        tokens: apiKeyData.tokensUsed || 0,
        cost: apiKeyData.totalCost || 0
      }
    })
  } catch (error) {
    logger.error('❌ Error fetching key info:', error)
    res.status(500).json({
      error: {
        type: 'server_error',
        message: 'Failed to fetch API key information'
      }
    })
  }
})

/**
 * GET /v1/organizations/:org_id/usage - 组织使用统计（兼容性端点）
 */
router.get('/organizations/:org_id/usage', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyId = req.apiKey.id
    const { start_date, end_date } = req.query

    const usage = await apiKeyService.getUsageStats(apiKeyId, start_date, end_date)

    res.json({
      object: 'list',
      data: usage || []
    })
  } catch (error) {
    logger.error('❌ Error fetching organization usage:', error)
    res.status(500).json({
      error: {
        type: 'server_error',
        message: 'Failed to fetch organization usage'
      }
    })
  }
})

module.exports = router

