// 全局类型定义
/* eslint-disable-next-line prettier/prettier, @typescript-eslint/no-explicit-any */
type AnyType = any;

// 安全存储 API 接口
interface SecureStorageAPI {
  isAvailable: () => Promise<boolean>
  encryptString: (plaintext: string) => Promise<string>
  decryptString: (encryptedBase64: string) => Promise<string>
}

// 扩展 Window 接口
declare global {
  interface Window {
    secureStorage: SecureStorageAPI
  }
}