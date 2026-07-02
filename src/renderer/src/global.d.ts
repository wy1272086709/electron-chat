// 全局类型定义
/* eslint-disable-next-line prettier/prettier, @typescript-eslint/no-explicit-any */
type AnyType = any

// 安全存储 API 接口
interface SecureStorageAPI {
  isEncryptionAvailable: () => Promise<boolean>
  isAvailable: () => Promise<boolean>
  setString: (key: string, value: string) => Promise<void>
  getString: (key: string) => Promise<string | null>
  removeItem: (key: string) => Promise<void>
  clear: (keys?: string[]) => Promise<void>
}

// 扩展 Window 接口
declare global {
  interface Window {
    secureStorage: SecureStorageAPI
  }
}
