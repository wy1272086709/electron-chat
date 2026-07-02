import { ElectronAPI } from '@electron-toolkit/preload'
import type { AxiosRequestConfig } from 'axios'

interface ApiResponse<T = unknown> {
  result: boolean
  data: T
  message?: string
  code?: number
  headers?: Record<string, string>
}

interface SecureStorageAPI {
  isEncryptionAvailable: () => Promise<boolean>
  isAvailable: () => Promise<boolean>
  setString: (key: string, value: string) => Promise<void>
  getString: (key: string) => Promise<string | null>
  removeItem: (key: string) => Promise<void>
  clear: (keys?: string[]) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      request: (config: AxiosRequestConfig) => Promise<ApiResponse>
    }
    secureStorage: SecureStorageAPI
  }
}
