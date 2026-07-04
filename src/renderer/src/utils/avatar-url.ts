import { userService } from '@renderer/services/user.service'

const avatarUrlCache = new Map<string, Promise<string>>()

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

  if (!avatarUrlCache.has(fileName)) {
    avatarUrlCache.set(
      fileName,
      userService
        .getAvatarUrl(fileName)
        .then((res) => (res.result && res.data?.url ? res.data.url : ''))
        .catch((error) => {
          console.warn('[Avatar] 获取头像预览地址失败:', fileName, error)
          return ''
        })
    )
  }

  return avatarUrlCache.get(fileName) ?? ''
}
