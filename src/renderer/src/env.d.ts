/// <reference types="vite/client" />

// `export {}` 让本文件成为模块，`declare global` 才能真正合并到 Window；
// 否则（非模块脚本文件）augmentation 不生效，调用方不得不 @ts-ignore。
export {}

declare global {
  interface FileTransferProgress {
    transferId: string
    direction: 'upload' | 'download'
    loaded: number
    total: number
    progress: number
  }

  interface Window {
    electronAPI: {
      openFile: () => Promise<string[]>
      getPathForFile: (file: File) => string
      uploadFile: (payload: {
        presignedUrl: string
        filePath?: string
        arrayBuffer?: ArrayBuffer
        contentType: string
        transferId?: string
      }) => Promise<{ result: boolean; data: unknown; code: number; message?: string }>
      downloadFile: (payload: {
        previewUrl: string
        fileName: string
        transferId?: string
      }) => Promise<{
        result: boolean
        data: { path: string } | null
        code: number
        message?: string
      }>
      onTransferProgress: (callback: (payload: FileTransferProgress) => void) => () => void
      openLocalFile: (payload: { path: string }) => Promise<{
        result: boolean
        data: { path: string } | null
        code: number
        message?: string
      }>
    }
  }
}
