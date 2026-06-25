import { ElectronAPI } from '@electron-toolkit/preload'
import type { AxiosRequestConfig } from 'axios'

interface ApiResponse<T = unknown> {
  result: boolean
  data: T
  message?: string
  code?: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      request: (config: AxiosRequestConfig) => Promise<ApiResponse>
    }
  }
}
