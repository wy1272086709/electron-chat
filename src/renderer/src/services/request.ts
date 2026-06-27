/**
 * 统一请求服务类
 *
 * 提供两种请求模式：
 * 1. ipcRequest - 通过主进程代理（用于后端 API，绕过 CORS）
 * 2. directRequest - 直接请求（用于第三方 API，需要 CORS 支持）
 */

import axios, { AxiosHeaders, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { API_CONFIG } from '../config/api.config'
import type { RequestConfig } from '../types/api.types'
import { secureStorageService } from './secure-storage.service'

// Electron 主进程返回的包装类型
export interface ElectronResponse<T extends AnyType | null> {
  result: boolean
  data: T | null
  code: number
  message?: string
}

// 标志位：防止并发请求在 401 时触发多次跳转
let isHandlingUnauthorized = false

/**
 * 处理 401 未授权：清除本地登录态并重定向到登录页
 * （token 过期或无效时由后端返回 401，经主进程透传 code 后在此统一处理）
 */
function handleUnauthorized(): void {
  if (isHandlingUnauthorized) return
  isHandlingUnauthorized = true
  try {
    secureStorageService.clearAuthData()
    console.warn('[Request] 登录已过期，正在跳转到登录页')
    // 项目使用 hash 路由（createHashRouter），直接修改 hash 触发跳转
    window.location.hash = '/login'
  } finally {
    // 稍后重置标志位，允许用户重新登录后再次触发
    setTimeout(() => {
      isHandlingUnauthorized = false
    }, 2000)
  }
}

class RequestService {
  private directClient: AxiosInstance

  constructor() {
    // 初始化直接请求客户端（用于第三方 API）
    this.directClient = axios.create({
      timeout: API_CONFIG.timeout
    })

    this.setupDirectClientInterceptors()
  }

  /**
   * 设置直接请求客户端的拦截器
   */
  private setupDirectClientInterceptors: () => void = () => {
    // 请求拦截器
    this.directClient.interceptors.request.use(
      async (config) => {
        // 从安全存储服务获取 token
        const token = await secureStorageService.getAccessToken()
        if (token) {
          const headers = AxiosHeaders.from(config.headers)
          headers.set('Authorization', `Bearer ${token}`)
          config.headers = headers
        }
        console.log(`[Direct Request] ${config.method?.toUpperCase()} ${config.url}`)
        return config
      },
      (error) => {
        console.error('[Direct Request] Request error:', error)
        return Promise.reject(error)
      }
    )

    // 响应拦截器
    this.directClient.interceptors.response.use(
      (response: AxiosResponse) => {
        console.log(`[Direct Request] Response:`, response.data)
        return response.data
      },
      async (error) => {
        console.error('[Direct Request] Response error:', error)
        await this.handleRequestError(error)
        return Promise.reject(error)
      }
    )
  }

  /**
   * 后端 API：通过 IPC 请求（绕过 CORS）
   * @param config Axios 请求配置
   * @returns Promise<T>
   */
  async ipcRequest<T = AnyType>(config: RequestConfig): Promise<ElectronResponse<T>> {
    const token = await secureStorageService.getAccessToken()
    console.log('[IPC Request] Token:', token)
    const requestConfig: AxiosRequestConfig = {
      ...config,
      baseURL: config.baseURL || API_CONFIG.baseURL,
      headers: {
        ...config.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }

    try {
      console.log(`[IPC Request] ${requestConfig.method?.toUpperCase()} ${requestConfig.url} `)
      console.log('[IPC Request] Data:', requestConfig.data)
      const response = (await window.api.request(requestConfig)) as unknown as ElectronResponse<T>
      console.log('[IPC Request] Response:', response)

      // 401 未授权：token 过期或无效，清除登录态并跳转登录页
      if (response.code === 401) {
        handleUnauthorized()
      }

      return response
    } catch (error: unknown) {
      console.error('[IPC Request] Error:', error)
      return {
        result: false,
        data: null,
        code: 1,
        message: (error as Error).message || '请求失败'
      }
    }
  }

  /**
   * 第三方 API：直接请求（需要 CORS 支持）
   * @param config Axios 请求配置
   * @returns Promise<T>
   */
  async directRequest<T = AnyType>(config: RequestConfig): Promise<T> {
    try {
      const response = await this.directClient.request<T>(config)
      return response as T
    } catch (error) {
      console.error('[Direct Request] Error:', error)
      this.handleRequestError(error)
      throw error
    }
  }

  /**
   * 统一错误处理
   * @param error 错误对象
   */
  private handleRequestError: (error: AnyType) => Promise<void> = async (error) => {
    if (axios.isAxiosError(error)) {
      // HTTP 错误
      if (error.response) {
        const { status, data } = error.response
        console.error('HTTP Error:', status, data)

        switch (status) {
          case 401:
            console.error('未授权，请重新登录')
            // 可以在这里触发登出逻辑，使用安全存储服务
            // 这里暂时留空，后续可以添加登出逻辑
            break
          case 403:
            console.error('没有权限访问')
            break
          case 404:
            console.error('请求的资源不存在')
            break
          case 500:
            console.error('服务器错误')
            break
          default:
            console.error('请求失败:', data?.message || error.message)
        }
      } else if (error.request) {
        // 请求已发送但没有收到响应
        console.error('网络错误，请检查网络连接')
      } else {
        // 请求配置错误
        console.error('请求配置错误:', error.message)
      }
    } else {
      // 非 Axios 错误
      console.error('请求失败:', error)
    }
  }

  /**
   * GET 请求（IPC）
   */
  get<T = AnyType>(url: string, config?: RequestConfig): Promise<ElectronResponse<T>> {
    return this.ipcRequest<T>({ ...config, method: 'GET', url })
  }

  /**
   * POST 请求（IPC）
   */
  post<T = AnyType>(
    url: string,
    data?: AnyType,
    config?: RequestConfig
  ): Promise<ElectronResponse<T>> {
    return this.ipcRequest<T>({ ...config, method: 'POST', url, data })
  }

  /**
   * PUT 请求（IPC）
   */
  put<T = AnyType>(
    url: string,
    data?: AnyType,
    config?: RequestConfig
  ): Promise<ElectronResponse<T>> {
    return this.ipcRequest<T>({ ...config, method: 'PUT', url, data })
  }

  /**
   * DELETE 请求（IPC）
   */
  delete<T = AnyType>(url: string, config?: RequestConfig): Promise<ElectronResponse<T>> {
    return this.ipcRequest<T>({ ...config, method: 'DELETE', url })
  }

  /**
   * PATCH 请求（IPC）
   */
  patch<T = AnyType>(
    url: string,
    data?: AnyType,
    config?: RequestConfig
  ): Promise<ElectronResponse<T>> {
    return this.ipcRequest<T>({ ...config, method: 'PATCH', url, data })
  }
}

// 导出单例
export const request = new RequestService()

// 导出类型
export type { RequestConfig }
