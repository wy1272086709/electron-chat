/**
 * 安全存储服务
 *
 * 使用 Electron safeStorage API 加密存储敏感信息（如 token）
 * 通过主进程使用系统级别的密钥链/凭据管理器进行加密存储
 */

declare global {
  interface Window {
    secureStorage?: {
      isAvailable: () => Promise<boolean>;
      encryptString: (value: string) => Promise<string>;
      decryptString: (value: string) => Promise<string>;
    };
  }
}

import { UserInfo } from '../types/api.types'

// 存储键名常量
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'secure_access_token',
  REFRESH_TOKEN: 'secure_refresh_token',
  USER_INFO: 'secure_user_info',
  IS_LOGGED_IN: 'secure_is_logged_in',
  USER_EMAIL: 'secure_user_email',
} as const

/**
 * 安全存储服务类
 */
class SecureStorageService {
  private isAvailable: boolean = false
  private initialized: boolean = false

  /**
   * 初始化安全存储服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // 检查 safeStorage 是否可用
      if (window.secureStorage && typeof window.secureStorage.isAvailable === 'function') {
        this.isAvailable = await window.secureStorage.isAvailable()
        console.log('[安全存储] 加密可用:', this.isAvailable)
      } else {
        console.warn('[安全存储] window.secureStorage 不可用，将使用 localStorage 作为备选方案')
      }
    } catch (error) {
      console.error('[安全存储] 初始化失败:', error)
      console.warn('[安全存储] 将使用 localStorage 作为备选方案')
    }

    this.initialized = true
  }

  /**
   * 存储字符串（加密）
   */
  async setString(key: string, value: string): Promise<void> {
    await this.initialize()

    try {
      if (this.isAvailable) {
        // 加密存储
        const encrypted = await window.secureStorage?.encryptString(value || '')
        localStorage.setItem(key, encrypted || '')
      } else {
        // 备选方案：直接存储
        localStorage.setItem(key, value)
      }
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
      const value = localStorage.getItem(key)
      if (!value) {
        return null
      }

      if (this.isAvailable && window.secureStorage) {
        // 尝试解密
        try {
          return await window.secureStorage.decryptString(value)
        } catch (decryptError) {
          // 如果解密失败，可能是旧版本的明文数据
          console.warn(`[安全存储] 解密失败 ${key}，可能是明文数据，尝试直接使用`)
          return value
        }
      } else {
        // 直接返回
        return value
      }
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
    localStorage.removeItem(key)
  }

  /**
   * 清空所有存储
   */
  clear(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key)
    })
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
