/**
 * API 配置文件
 * 统一管理后端 API 和第三方服务的配置
 */

export const API_CONFIG = {
  // 后端 API 基础配置
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,

  // 开发环境配置
  dev: {
    // 开发环境可以使用 Mock 模式
    useMock: import.meta.env.VITE_USE_MOCK === 'true'
  }
}

export default API_CONFIG
