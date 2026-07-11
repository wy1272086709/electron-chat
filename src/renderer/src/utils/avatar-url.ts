import { userService } from '@renderer/services/user.service'

const AVATAR_URL_CACHE_TTL = 5 * 60 * 1000

interface AvatarUrlCacheEntry {
  url: string
  expiresAt: number
}

const avatarUrlCache = new Map<string, AvatarUrlCacheEntry>()
const avatarUrlRequests = new Map<string, Promise<string>>()

const isDirectAvatarUrl = (value: string): boolean =>
  /^(https?:|data:|blob:)/i.test(value) || value.startsWith('/')

const getAvatarFileName = (value: string): string => {
  const normalized = value.trim()
  if (!normalized) return ''
  return normalized.split('/').filter(Boolean).pop() || normalized
}

export async function resolveAvatarUrl(avatarUrl?: string | null): Promise<string> {
  const raw = avatarUrl?.trim()
  if (!raw) return ''

  if (isDirectAvatarUrl(raw)) {
    return raw
  }

  const fileName = getAvatarFileName(raw)
  if (!fileName) return ''

  const cached = avatarUrlCache.get(fileName)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url
  }

  const pending = avatarUrlRequests.get(fileName)
  if (pending) {
    return pending
  }

  const request = userService
    .getAvatarUrl(fileName)
    .then((res) => {
      const url = res.result && res.data?.url ? res.data.url : ''
      if (url) {
        avatarUrlCache.set(fileName, {
          url,
          expiresAt: Date.now() + AVATAR_URL_CACHE_TTL
        })
      } else {
        avatarUrlCache.delete(fileName)
      }

      return url
    })
    .catch((error) => {
      avatarUrlCache.delete(fileName)
      console.warn('[Avatar] 获取头像预览地址失败:', fileName, error)
      return ''
    })
    .finally(() => {
      avatarUrlRequests.delete(fileName)
    })

  avatarUrlRequests.set(fileName, request)
  return request
}

export function clearAvatarUrlCache(avatarUrl?: string | null): void {
  if (!avatarUrl) {
    avatarUrlCache.clear()
    avatarUrlRequests.clear()
    return
  }

  const fileName = getAvatarFileName(avatarUrl)
  if (fileName) {
    avatarUrlCache.delete(fileName)
    avatarUrlRequests.delete(fileName)
  }
}
