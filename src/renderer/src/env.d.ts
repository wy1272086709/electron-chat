/// <reference types="vite/client" />

// `export {}` 让本文件成为模块，`declare global` 才能真正合并到 Window；
// 否则（非模块脚本文件）augmentation 不生效，调用方不得不 @ts-ignore。
export {}

declare global {
  interface Window {
    electronAPI: {
      openFile: () => Promise<string[]>
      uploadFile: (payload: {
        presignedUrl: string
        arrayBuffer: ArrayBuffer
        contentType: string
      }) => Promise<{ result: boolean; data: unknown; code: number; message?: string }>
      downloadFile: (payload: { previewUrl: string; fileName: string }) => Promise<{
        result: boolean
        data: { path: string } | null
        code: number
        message?: string
      }>
      openLocalFile: (payload: { path: string }) => Promise<{
        result: boolean
        data: { path: string } | null
        code: number
        message?: string
      }>
    }
  }
}
