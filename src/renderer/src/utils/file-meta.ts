/**
 * 文件元数据工具：收藏与聊天消息共用，避免多处副本。
 */

/** 字节数格式化为人类可读大小：`32.3 MB`；非法值返回 undefined */
export function formatFileSize(size?: number | null): string | undefined {
  if (typeof size !== 'number' || Number.isNaN(size)) return undefined
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB']
  let value = size / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

/** 取扩展名（大写）：优先文件名，回退 MIME 子类型（image/png → PNG） */
export function getFileExt(fileName?: string | null, fileType?: string | null): string | undefined {
  const fromName = fileName?.split('.').filter(Boolean).pop()
  if (fromName) return fromName.toUpperCase()
  const fromType = fileType?.split('/').filter(Boolean).pop()
  return fromType?.toUpperCase()
}

const IMAGE_EXTENSIONS = new Set([
  'APNG',
  'AVIF',
  'BMP',
  'GIF',
  'HEIC',
  'HEIF',
  'JPEG',
  'JPG',
  'PNG',
  'SVG',
  'WEBP'
])

/** 是否应作为图片展示：优先 MIME，MIME 缺失/不准时回退扩展名 */
export function isImageFile(fileName?: string | null, fileType?: string | null): boolean {
  if (fileType?.toLowerCase().startsWith('image/')) return true
  const ext = getFileExt(fileName, fileType)
  return !!ext && IMAGE_EXTENSIONS.has(ext)
}

/** 扩展名 → 文件卡配色 tone（与收藏卡片一致） */
export function getFileTone(ext?: string): 'ppt' | 'word' | 'zip' | 'default' {
  const value = ext?.toUpperCase()
  if (value === 'PPT' || value === 'PPTX') return 'ppt'
  if (value === 'DOC' || value === 'DOCX') return 'word'
  if (value === 'ZIP' || value === 'RAR') return 'zip'
  return 'default'
}

/** 扩展名 → 文件卡角标首字母（如 PPT → P，未知 → F） */
export function getFileBadge(ext?: string): string {
  return ext?.slice(0, 1).toUpperCase() || 'F'
}
