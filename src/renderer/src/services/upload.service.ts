/**
 * 媒体上传编排（渲染器侧）。
 *
 * 流程：判定类型 → 读图片尺寸 → 生成对象 key → 取预签名 PUT URL（走 request，带 token）
 * → 把字节交给主进程 IPC `upload-file` 执行 PUT（绕过 CORS）→ 返回媒体元数据。
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

export async function uploadMedia(file: File): Promise<PreparedMedia> {
  const messageType: UploadMessageType = isImageFile(file.name, file.type) ? 'IMAGE' : 'FILE'
  const objectName = buildObjectName(file)

  const dimensions = await readImageDimensions(file)

  const presignedRes = await userService.getPresignedUrl(objectName)
  if (!presignedRes.result || !presignedRes.data?.url) {
    throw new Error(presignedRes.message || '获取上传地址失败')
  }

  const arrayBuffer = await file.arrayBuffer()
  const upRes = await window.electronAPI.uploadFile({
    presignedUrl: presignedRes.data.url,
    arrayBuffer,
    contentType: file.type || ''
  })
  if (!upRes.result) {
    throw new Error(upRes.message || '上传失败')
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
