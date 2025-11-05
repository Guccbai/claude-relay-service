#!/usr/bin/env node

/**
 * 测试新的 v1 统一路由
 *
 * 使用方法:
 *   node scripts/test-v1-routes.js [base_url] [api_key]
 *
 * 示例:
 *   node scripts/test-v1-routes.js http://localhost:3000 cr_your_api_key
 */

const axios = require('axios')
const chalk = require('chalk')

// 命令行参数
const BASE_URL = process.argv[2] || 'http://localhost:3000'
const API_KEY = process.argv[3] || process.env.TEST_API_KEY

if (!API_KEY) {
  console.error(chalk.red('❌ 请提供 API Key:'))
  console.error(chalk.yellow('   node scripts/test-v1-routes.js [base_url] [api_key]'))
  console.error(
    chalk.yellow('   或设置环境变量: export TEST_API_KEY=cr_your_api_key')
  )
  process.exit(1)
}

// 测试配置
const tests = [
  {
    name: '健康检查',
    method: 'GET',
    url: '/health',
    requiresAuth: false
  },
  {
    name: 'GET /v1/me - 用户信息',
    method: 'GET',
    url: '/v1/me',
    requiresAuth: true
  },
  {
    name: 'GET /v1/models - 模型列表',
    method: 'GET',
    url: '/v1/models',
    requiresAuth: true
  },
  {
    name: 'GET /v1/key-info - API Key 信息',
    method: 'GET',
    url: '/v1/key-info',
    requiresAuth: true
  },
  {
    name: 'POST /v1/messages/count_tokens - Token 计数',
    method: 'POST',
    url: '/v1/messages/count_tokens',
    requiresAuth: true,
    data: {
      messages: [
        { role: 'user', content: 'Hello, how are you?' }
      ]
    }
  }
]

// 测试结果统计
let passed = 0
let failed = 0

// 执行单个测试
async function runTest(test) {
  console.log(chalk.blue(`\n🧪 测试: ${test.name}`))
  console.log(chalk.gray(`   ${test.method} ${test.url}`))

  try {
    const config = {
      method: test.method,
      url: `${BASE_URL}${test.url}`,
      headers: {}
    }

    if (test.requiresAuth) {
      config.headers['Authorization'] = `Bearer ${API_KEY}`
    }

    if (test.data) {
      config.data = test.data
      config.headers['Content-Type'] = 'application/json'
    }

    const response = await axios(config)

    console.log(chalk.green(`   ✅ 成功: ${response.status} ${response.statusText}`))

    // 显示部分响应数据
    if (response.data) {
      const data = JSON.stringify(response.data, null, 2)
      const preview = data.length > 200 ? data.substring(0, 200) + '...' : data
      console.log(chalk.gray(`   响应预览:\n${preview}`))
    }

    passed++
    return true
  } catch (error) {
    if (error.response) {
      console.log(
        chalk.red(`   ❌ 失败: ${error.response.status} ${error.response.statusText}`)
      )
      console.log(chalk.red(`   错误: ${JSON.stringify(error.response.data, null, 2)}`))
    } else {
      console.log(chalk.red(`   ❌ 失败: ${error.message}`))
    }

    failed++
    return false
  }
}

// 执行所有测试
async function runAllTests() {
  console.log(chalk.cyan('╔════════════════════════════════════════╗'))
  console.log(chalk.cyan('║   新路由系统测试 (v1 Routes Test)      ║'))
  console.log(chalk.cyan('╚════════════════════════════════════════╝'))
  console.log(chalk.gray(`\n📍 测试服务器: ${BASE_URL}`))
  console.log(chalk.gray(`🔑 API Key: ${API_KEY.substring(0, 10)}...`))

  for (const test of tests) {
    await runTest(test)
    // 添加延迟避免请求过快
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  // 显示测试结果统计
  console.log(chalk.cyan('\n╔════════════════════════════════════════╗'))
  console.log(chalk.cyan('║           测试结果统计                  ║'))
  console.log(chalk.cyan('╚════════════════════════════════════════╝'))
  console.log(chalk.green(`✅ 通过: ${passed}/${tests.length}`))
  console.log(chalk.red(`❌ 失败: ${failed}/${tests.length}`))

  if (failed === 0) {
    console.log(chalk.green.bold('\n🎉 所有测试通过！'))
    process.exit(0)
  } else {
    console.log(chalk.red.bold('\n❌ 部分测试失败，请检查日志'))
    process.exit(1)
  }
}

// 路由兼容性对比测试
async function compareRoutes() {
  console.log(chalk.cyan('\n╔════════════════════════════════════════╗'))
  console.log(chalk.cyan('║        路由兼容性对比测试               ║'))
  console.log(chalk.cyan('╚════════════════════════════════════════╝'))

  const comparisons = [
    {
      name: '用户信息',
      old: '/api/v1/me',
      new: '/v1/me'
    },
    {
      name: '模型列表',
      old: '/api/v1/models',
      new: '/v1/models'
    }
  ]

  for (const comp of comparisons) {
    console.log(chalk.blue(`\n🔀 对比测试: ${comp.name}`))

    const config = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    }

    try {
      const [oldRes, newRes] = await Promise.all([
        axios({ ...config, url: `${BASE_URL}${comp.old}` }),
        axios({ ...config, url: `${BASE_URL}${comp.new}` })
      ])

      if (oldRes.status === newRes.status) {
        console.log(chalk.green(`   ✅ 状态码一致: ${oldRes.status}`))
      } else {
        console.log(chalk.red(`   ❌ 状态码不一致: 旧=${oldRes.status}, 新=${newRes.status}`))
      }

      // 简单的数据对比
      const oldData = JSON.stringify(oldRes.data)
      const newData = JSON.stringify(newRes.data)
      if (oldData.length === newData.length) {
        console.log(chalk.green(`   ✅ 响应数据长度一致`))
      } else {
        console.log(
          chalk.yellow(
            `   ⚠️  响应数据长度不同: 旧=${oldData.length}, 新=${newData.length}`
          )
        )
      }
    } catch (error) {
      console.log(chalk.red(`   ❌ 对比失败: ${error.message}`))
    }
  }
}

// 主函数
async function main() {
  try {
    await runAllTests()
    // 可选：运行兼容性对比测试
    // await compareRoutes()
  } catch (error) {
    console.error(chalk.red(`\n💥 测试过程出错: ${error.message}`))
    process.exit(1)
  }
}

// 运行测试
main()

