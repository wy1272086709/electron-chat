import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AxiosRequestConfig } from 'axios'

// Custom APIs for renderer
const api = {
  request: (config: AxiosRequestConfig) => ipcRenderer.invoke('fetch-data', config)
}

// 安全存储 API
const secureStorage = {
  isEncryptionAvailable: () => ipcRenderer.invoke('secure-storage-is-encryption-available'),
  isAvailable: () => ipcRenderer.invoke('secure-storage-is-encryption-available'),
  setString: (key: string, value: string) =>
    ipcRenderer.invoke('secure-storage-set-string', key, value),
  getString: (key: string) => ipcRenderer.invoke('secure-storage-get-string', key),
  removeItem: (key: string) => ipcRenderer.invoke('secure-storage-remove-item', key),
  clear: (keys?: string[]) => ipcRenderer.invoke('secure-storage-clear', keys)
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
      },
      // 获取用户选中文件的真实路径；大文件由主进程从磁盘流式读取，避免 IPC 复制整份字节。
      getPathForFile: (file: File) => webUtils.getPathForFile(file),
      // 媒体上传：优先传文件路径，内存文件（如粘贴截图）才传字节。
      uploadFile: (payload: {
        presignedUrl: string
        filePath?: string
        arrayBuffer?: ArrayBuffer
        contentType: string
        transferId?: string
      }) => ipcRenderer.invoke('upload-file', payload),
      // 媒体下载：流式写入系统下载目录
      downloadFile: (payload: { previewUrl: string; fileName: string; transferId?: string }) =>
        ipcRenderer.invoke('download-file', payload),
      // 复制图片到系统剪贴板（主进程绕过 CORS 拉取后写入）
      copyImageToClipboard: (payload: { url: string }) =>
        ipcRenderer.invoke('copy-image-to-clipboard', payload),
      onTransferProgress: (
        callback: (payload: {
          transferId: string
          direction: 'upload' | 'download'
          loaded: number
          total: number
          progress: number
        }) => void
      ) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          payload: {
            transferId: string
            direction: 'upload' | 'download'
            loaded: number
            total: number
            progress: number
          }
        ): void => callback(payload)
        ipcRenderer.on('file-transfer-progress', listener)
        return () => ipcRenderer.removeListener('file-transfer-progress', listener)
      },
      // 打开已下载到本地的文件
      openLocalFile: (payload: { path: string }) => ipcRenderer.invoke('open-local-file', payload)
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
