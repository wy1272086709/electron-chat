/**
 * 安全存储服务
 *
 * 使用 Electron 主进程的 electron-store 持久化敏感信息（如 token）。
 * 主进程会优先用 safeStorage 加密后写入 electron-store；渲染进程不直接接触 localStorage。
 */

import { UserInfo } from '../types/api.types'

// 存储键名常量
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'secure_access_token',
  REFRESH_TOKEN: 'secure_refresh_token',
  USER_INFO: 'secure_user_info',
  IS_LOGGED_IN: 'secure_is_logged_in',
  USER_EMAIL: 'secure_user_email'
} as const

/**
 * 安全存储服务类
 */
class SecureStorageService {
  private isEncryptionAvailable: boolean = false
  private storageAvailable: boolean = false
  private initialized: boolean = false
  private memoryStore = new Map<string, string>()
  private valueCache = new Map<string, string | null>()

  /**
   * 初始化安全存储服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      if (
        window.secureStorage &&
        typeof window.secureStorage.setString === 'function' &&
        typeof window.secureStorage.getString === 'function'
      ) {
        this.storageAvailable = true
        this.isEncryptionAvailable =
          typeof window.secureStorage.isEncryptionAvailable === 'function'
            ? await window.secureStorage.isEncryptionAvailable()
            : await window.secureStorage.isAvailable()
        console.log('[安全存储] electron-store 可用，加密可用:', this.isEncryptionAvailable)
      } else {
        console.warn('[安全存储] window.secureStorage 不可用，将使用内存临时存储')
      }
    } catch (error) {
      console.error('[安全存储] 初始化失败:', error)
      console.warn('[安全存储] 将使用内存临时存储')
    }

    this.initialized = true
  }

  /**
   * 存储字符串（加密）
   */
  async setString(key: string, value: string): Promise<void> {
    await this.initialize()

    try {
      this.valueCache.set(key, value || '')

      if (this.storageAvailable && window.secureStorage) {
        await window.secureStorage.setString(key, value || '')
        return
      }

      this.memoryStore.set(key, value || '')
    } catch (error) {
      console.error(`[安全存储] 存储失败 ${key}:`, error)
      throw error
    }
  }

  /**
   * 获取字符串（解密）
   */
  async getString(key: string): Promise<string | null> {
    await this.initialize()

    try {
      if (this.valueCache.has(key)) {
        return this.valueCache.get(key) || null
      }

      if (this.storageAvailable && window.secureStorage) {
        const value = await window.secureStorage.getString(key)
        this.valueCache.set(key, value)
        return value
      }

      const value = this.memoryStore.get(key) || null
      this.valueCache.set(key, value)
      return value
    } catch (error) {
      console.error(`[安全存储] 获取失败 ${key}:`, error)
      return null
    }
  }

  /**
   * 存储 JSON 对象（加密）
   */
  async setJSON<T>(key: string, value: T): Promise<void> {
    const jsonString = JSON.stringify(value)
    await this.setString(key, jsonString)
  }

  /**
   * 获取 JSON 对象（解密）
   */
  async getJSON<T>(key: string): Promise<T | null> {
    const jsonString = await this.getString(key)
    if (!jsonString) {
      return null
    }

    try {
      return JSON.parse(jsonString) as T
    } catch (error) {
      console.error(`[安全存储] JSON 解析失败 ${key}:`, error)
      return null
    }
  }

  /**
   * 删除存储项
   */
  removeItem(key: string): void {
    this.memoryStore.delete(key)
    this.valueCache.delete(key)
    if (this.storageAvailable && window.secureStorage) {
      void window.secureStorage.removeItem(key)
    }
  }

  /**
   * 清空所有存储
   */
  clear(): void {
    this.memoryStore.clear()
    this.valueCache.clear()
    if (this.storageAvailable && window.secureStorage) {
      void window.secureStorage.clear(Object.values(STORAGE_KEYS))
    }
  }

  /**
   * 存储访问令牌
   */
  async setAccessToken(token: string): Promise<void> {
    await this.setString(STORAGE_KEYS.ACCESS_TOKEN, token)
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken(): Promise<string | null> {
    return await this.getString(STORAGE_KEYS.ACCESS_TOKEN)
  }

  /**
   * 存储刷新令牌
   */
  async setRefreshToken(token: string): Promise<void> {
    await this.setString(STORAGE_KEYS.REFRESH_TOKEN, token)
  }

  /**
   * 获取刷新令牌
   */
  async getRefreshToken(): Promise<string | null> {
    return await this.getString(STORAGE_KEYS.REFRESH_TOKEN)
  }

  /**
   * 存储用户信息
   */
  async setUserInfo(userInfo: UserInfo): Promise<void> {
    await this.setJSON<UserInfo>(STORAGE_KEYS.USER_INFO, userInfo)
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(): Promise<UserInfo | null> {
    return await this.getJSON<UserInfo>(STORAGE_KEYS.USER_INFO)
  }

  /**
   * 存储登录状态
   */
  async setLoggedIn(isLoggedIn: boolean): Promise<void> {
    await this.setString(STORAGE_KEYS.IS_LOGGED_IN, String(isLoggedIn))
  }

  /**
   * 获取登录状态
   */
  async getLoggedIn(): Promise<boolean> {
    const value = await this.getString(STORAGE_KEYS.IS_LOGGED_IN)
    return value === 'true'
  }

  /**
   * 存储用户邮箱
   */
  async setUserEmail(email: string): Promise<void> {
    await this.setString(STORAGE_KEYS.USER_EMAIL, email)
  }

  /**
   * 获取用户邮箱
   */
  async getUserEmail(): Promise<string | null> {
    return await this.getString(STORAGE_KEYS.USER_EMAIL)
  }

  /**
   * 清除所有认证相关数据
   */
  clearAuthData(): void {
    this.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
    this.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
    this.removeItem(STORAGE_KEYS.USER_INFO)
    this.removeItem(STORAGE_KEYS.IS_LOGGED_IN)
    this.removeItem(STORAGE_KEYS.USER_EMAIL)
  }
}

// 导出单例
export const secureStorageService = new SecureStorageService()

// 导出存储键名
export { STORAGE_KEYS }

export default secureStorageService
