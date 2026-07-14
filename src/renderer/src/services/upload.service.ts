/**
 * 媒体上传编排（渲染器侧）。
 *
 * 流程：判定类型 → 读图片尺寸 → 生成对象 key → 取预签名 PUT URL（走 request，带 token）
 * → 把本地路径交给主进程流式 PUT（内存文件回退为字节上传）→ 返回媒体元数据。
 *
 * 返回的 objectName 即消息的 fileUrl（存对象 key，不存预签名 URL——后者 1 小时过期）。
 */
import { userService } from './user.service'
import { isImageFile } from '@renderer/utils/file-meta'

export type UploadMessageType = 'IMAGE' | 'FILE'

export interface PreparedMedia {
  messageType: UploadMessageType
  objectName: string
  fileName: string
  fileSize: number
  fileType: string
  mediaWidth?: number
  mediaHeight?: number
  /** v1 未生成缩略图；占位字段，预留后续客户端压缩 */
  thumbnailUrl?: string
}

const MAX_CONCURRENT_UPLOADS = 2
let activeUploads = 0
const uploadWaiters: Array<() => void> = []

async function acquireUploadSlot(): Promise<void> {
  if (activeUploads < MAX_CONCURRENT_UPLOADS) {
    activeUploads += 1
    return
  }
  await new Promise<void>((resolve) => uploadWaiters.push(resolve))
}

function releaseUploadSlot(): void {
  const next = uploadWaiters.shift()
  if (next) {
    next()
    return
  }
  activeUploads -= 1
}

/** 生成唯一对象 key：平铺命名，避免部分 MinIO 预签名接口对 `/` 编码兼容不佳 */
export function buildObjectName(file: File): string {
  const ext = file.name.split('.').filter(Boolean).pop()
  const now = new Date()
  const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate()
  ).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 10)
  const extPart = ext ? `.${ext.toLowerCase()}` : ''
  return `chat-${ymd}-${Date.now()}-${rand}${extPart}`
}

/** 读图片原始宽高；非图片或解码失败（如 HEIC）返回 undefined */
export function readImageDimensions(
  file: File
): Promise<{ width: number; height: number } | undefined> {
  if (!isImageFile(file.name, file.type)) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = (): void => {
      const { naturalWidth, naturalHeight } = img
      URL.revokeObjectURL(url)
      resolve({ width: naturalWidth, height: naturalHeight })
    }
    img.onerror = (): void => {
      URL.revokeObjectURL(url)
      resolve(undefined)
    }
    img.src = url
  })
}

export async function uploadMedia(
  file: File,
  onProgress?: (progress: number) => void
): Promise<PreparedMedia> {
  const messageType: UploadMessageType = isImageFile(file.name, file.type) ? 'IMAGE' : 'FILE'
  const objectName = buildObjectName(file)

  const dimensions = await readImageDimensions(file)

  await acquireUploadSlot()
  try {
    const presignedRes = await userService.getPresignedUrl(objectName)
    if (!presignedRes.result || !presignedRes.data?.url) {
      throw new Error(presignedRes.message || '获取上传地址失败')
    }

    const filePath = window.electronAPI.getPathForFile(file)
    const transferId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const unsubscribe = window.electronAPI.onTransferProgress((event) => {
      if (event.transferId === transferId && event.direction === 'upload') {
        onProgress?.(event.progress)
      }
    })
    let upRes: Awaited<ReturnType<typeof window.electronAPI.uploadFile>>
    try {
      onProgress?.(0)
      upRes = await window.electronAPI.uploadFile({
        presignedUrl: presignedRes.data.url,
        ...(filePath ? { filePath } : { arrayBuffer: await file.arrayBuffer() }),
        contentType: file.type || 'application/octet-stream',
        transferId
      })
      if (upRes.result) onProgress?.(1)
    } finally {
      unsubscribe()
    }
    if (!upRes.result) {
      throw new Error(upRes.message || '上传失败')
    }
  } finally {
    releaseUploadSlot()
  }

  return {
    messageType,
    objectName,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || 'application/octet-stream',
    mediaWidth: dimensions?.width,
    mediaHeight: dimensions?.height
  }
}
