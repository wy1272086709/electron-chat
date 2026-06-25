import { contextBridge, ipcRenderer } from 'electron'
import type { AxiosRequestConfig } from 'axios'

// Custom APIs for renderer
const api = {
  request: (config: AxiosRequestConfig) => ipcRenderer.invoke('fetch-data', config)
}

// 安全存储 API
const secureStorage = {
  isAvailable: () => ipcRenderer.invoke('safe-storage-is-available'),
  encryptString: (plaintext: string) =>
    ipcRenderer.invoke('safe-storage-encrypt-string', plaintext),
  decryptString: (encryptedBase64: string) =>
    ipcRenderer.invoke('safe-storage-decrypt-string', encryptedBase64)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)

    // 添加文件选择 API
    contextBridge.exposeInMainWorld('electronAPI', {
      openFile: () => {
        console.log('调用 electronAPI.openFile')
        return ipcRenderer
          .invoke('open-file')
          .then((result) => {
            console.log('文件选择结果:', result)
            return result
          })
          .catch((error) => {
            console.error('文件选择错误:', error)
            throw error
          })
      }
    })

    // 添加安全存储 API
    contextBridge.exposeInMainWorld('secureStorage', secureStorage)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.secureStorage = secureStorage
}
