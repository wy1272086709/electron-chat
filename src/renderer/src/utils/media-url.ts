import { userService } from '@renderer/services/user.service'

/**
 * 媒体（图片/文件）展示/下载 URL 解析。
 *
 * 与 avatar-url.ts 对称，但有一个关键区别：**把完整对象 key 原样传给
 * /minio/previewUrl**，不做 `.split('/').pop()` 截断——因为聊天媒体的对象 key
 * 形如 `chat/20260710/<rand>.png`，截断后会变成不存在的 `rand.png`。
 * （头像之所以能截断，是因为头像存的就是扁平文件名。）
 *
 * 缓存策略同 avatar-url：成功 URL 缓存 5 分钟（预签名 GET 1 小时过期，远小于），
 * in-flight 请求去重；失败/空不缓存，允许后续重试。
 */
const MEDIA_URL_CACHE_TTL = 5 * 60 * 1000

interface MediaUrlCacheEntry {
  url: string
  expiresAt: number
}

const mediaUrlCache = new Map<string, MediaUrlCacheEntry>()
const mediaUrlRequests = new Map<string, Promise<string>>()

const isDirectMediaUrl = (value: string): boolean =>
  /^(https?:|data:|blob:)/i.test(value) || value.startsWith('/')

export async function resolveMediaUrl(fileUrl?: string | null): Promise<string> {
  const raw = fileUrl?.trim()
  if (!raw) return ''

  // 直接地址（http/data/blob/根路径）原样返回；乐观消息的 blob: 预览也走这里
  if (isDirectMediaUrl(raw)) {
    return raw
  }

  const cached = mediaUrlCache.get(raw)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url
  }

  const pending = mediaUrlRequests.get(raw)
  if (pending) {
    return pending
  }

  const request = userService
    .getPreviewUrl(raw)
    .then((res) => {
      const url = res.result && res.data?.url ? res.data.url : ''
      if (url) {
        mediaUrlCache.set(raw, {
          url,
          expiresAt: Date.now() + MEDIA_URL_CACHE_TTL
        })
      } else {
        mediaUrlCache.delete(raw)
      }
      return url
    })
    .catch((error) => {
      mediaUrlCache.delete(raw)
      console.warn('[Media] 获取预览 URL 失败:', raw, error)
      return ''
    })
    .finally(() => {
      mediaUrlRequests.delete(raw)
    })

  mediaUrlRequests.set(raw, request)
  return request
}

export function clearMediaUrlCache(fileUrl?: string | null): void {
  if (!fileUrl) {
    mediaUrlCache.clear()
    mediaUrlRequests.clear()
    return
  }

  const raw = fileUrl.trim()
  if (raw) {
    mediaUrlCache.delete(raw)
    mediaUrlRequests.delete(raw)
  }
}
