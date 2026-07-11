import { request, type ElectronResponse } from './request'
import { formatFileSize, getFileExt } from '@renderer/utils/file-meta'

export type FavoriteItemType = 'text' | 'image' | 'file' | 'chat'
export type FavoriteApiType = 'MESSAGE' | 'IMAGE' | 'VIDEO' | 'FILE' | 'CHAT_RECORD'

export interface FavoriteApiItem {
  id: string
  type: FavoriteApiType
  targetId: string
  userId?: string
  sourceType?: string | null
  sourceId?: string | null
  sourceName?: string | null
  roomId?: string | null
  title?: string | null
  content?: string | null
  fileUrl?: string | null
  fileName?: string | null
  fileSize?: number | null
  fileType?: string | null
  thumbnailUrl?: string | null
  mediaWidth?: number | null
  mediaHeight?: number | null
  duration?: number | null
  extra?: Record<string, unknown> | null
  collectedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateFavoritePayload {
  type: FavoriteApiType
  targetId: string
  sourceType?: string
  sourceId?: string
  sourceName?: string
  roomId?: string
  title?: string
  content?: string
  fileUrl?: string
  fileName?: string
  fileSize?: number
  fileType?: string
  thumbnailUrl?: string
  mediaWidth?: number
  mediaHeight?: number
  duration?: number
  extra?: Record<string, unknown>
}

export interface FavoriteItem {
  id: string
  type: FavoriteItemType
  title: string
  content?: string
  fileUrl?: string
  fileName?: string
  fileSize?: string
  fileExt?: string
  fileType?: string
  thumbnail?: string
  source: string
  time: string
  expiresAt?: string
  chatId?: string
  messageId?: string
  targetId: string
  apiType: FavoriteApiType
}

interface FavoriteListParams {
  type?: FavoriteApiType
  take?: number
}

interface LegacyFavoriteDraft {
  type: FavoriteItemType
  messageId?: string
  targetId?: string
  title?: string
  content?: string
  source?: string
  chatId?: string
  fileName?: string
  fileSize?: string
  fileExt?: string
  thumbnail?: string
  time?: string
}

const favoriteCache = new Map<string, FavoriteItem>()
const FILE_FAVORITE_TTL_MS = 365 * 24 * 60 * 60 * 1000

function toApiType(type: FavoriteItemType): FavoriteApiType {
  if (type === 'text') return 'MESSAGE'
  if (type === 'file') return 'FILE'
  if (type === 'chat') return 'CHAT_RECORD'
  return 'IMAGE'
}

export function toFavoriteApiType(type: FavoriteItemType): FavoriteApiType {
  return toApiType(type)
}

function toItemType(type: FavoriteApiType): FavoriteItemType {
  if (type === 'MESSAGE') return 'text'
  if (type === 'FILE') return 'file'
  if (type === 'CHAT_RECORD') return 'chat'
  return 'image'
}

function getTitle(item: FavoriteApiItem): string {
  if (item.title?.trim()) return item.title
  if (item.fileName?.trim()) return item.fileName
  if (item.content?.trim()) return item.content
  return '收藏内容'
}

function getExtraString(extra: FavoriteApiItem['extra'], key: string): string | undefined {
  const value = extra?.[key]
  return typeof value === 'string' ? value : undefined
}

function getFileExpiresAt(item: FavoriteApiItem): string | undefined {
  if (item.type !== 'FILE') return undefined
  const savedExpiresAt = getExtraString(item.extra, 'expiresAt')
  if (savedExpiresAt) return savedExpiresAt

  const collectedAt = item.collectedAt || item.createdAt
  const start = collectedAt ? new Date(collectedAt) : new Date()
  if (Number.isNaN(start.getTime())) return undefined
  return new Date(start.getTime() + FILE_FAVORITE_TTL_MS).toISOString()
}

function mapFavorite(item: FavoriteApiItem): FavoriteItem {
  const type = toItemType(item.type)
  return {
    id: item.id,
    type,
    title: getTitle(item),
    content: item.content || undefined,
    fileUrl: item.fileUrl || undefined,
    fileName: item.fileName || undefined,
    fileSize: formatFileSize(item.fileSize),
    fileExt: getFileExt(item.fileName, item.fileType),
    fileType: item.fileType || undefined,
    thumbnail: item.thumbnailUrl || item.fileUrl || undefined,
    source: item.sourceName || item.sourceType || '收藏',
    time: item.collectedAt || item.createdAt || '',
    expiresAt: getFileExpiresAt(item),
    chatId: item.roomId || item.sourceId || undefined,
    messageId: item.type === 'CHAT_RECORD' ? undefined : item.targetId,
    targetId: item.targetId,
    apiType: item.type
  }
}

function remember(items: FavoriteItem[]): void {
  items.forEach((item) => {
    favoriteCache.set(item.id, item)
    if (item.messageId) favoriteCache.set(item.messageId, item)
    favoriteCache.set(`${item.apiType}:${item.targetId}`, item)
  })
}

function isCreateFavoritePayload(
  item: CreateFavoritePayload | LegacyFavoriteDraft
): item is CreateFavoritePayload {
  return (
    item.type === 'MESSAGE' ||
    item.type === 'IMAGE' ||
    item.type === 'VIDEO' ||
    item.type === 'FILE' ||
    item.type === 'CHAT_RECORD'
  )
}

export const favoriteService = {
  async list(params: FavoriteListParams = {}): Promise<ElectronResponse<FavoriteItem[]>> {
    const res = await request.get<FavoriteApiItem[]>('/favorites', {
      params: {
        ...(params.type ? { type: params.type } : {}),
        ...(params.take ? { take: params.take } : {})
      }
    })
    const data = res.data ? res.data.map(mapFavorite) : []
    remember(data)
    return { ...res, data }
  },

  isFavoritedSync(messageId: string): boolean {
    return favoriteCache.has(messageId)
  },

  async add(
    item: CreateFavoritePayload | LegacyFavoriteDraft
  ): Promise<ElectronResponse<FavoriteItem>> {
    const payload: CreateFavoritePayload = isCreateFavoritePayload(item)
      ? item
      : {
          type: toApiType(item.type),
          targetId: item.messageId || item.targetId || '',
          title: item.title,
          content: item.content,
          sourceName: item.source,
          roomId: item.chatId
        }

    if (payload.type === 'FILE') {
      payload.extra = {
        ...payload.extra,
        expiresAt:
          typeof payload.extra?.expiresAt === 'string'
            ? payload.extra.expiresAt
            : new Date(Date.now() + FILE_FAVORITE_TTL_MS).toISOString()
      }
    }

    const res = await request.post<FavoriteApiItem>('/favorites', payload)
    const data = res.data ? mapFavorite(res.data) : null
    if (data) remember([data])
    return { ...res, data }
  },

  async remove(type: FavoriteApiType, targetId: string): Promise<ElectronResponse<FavoriteItem>> {
    const res = await request.post<FavoriteApiItem>('/favorites/remove', { type, targetId })
    const data = res.data ? mapFavorite(res.data) : null
    if (data) {
      favoriteCache.delete(data.id)
      if (data.messageId) favoriteCache.delete(data.messageId)
      favoriteCache.delete(`${data.apiType}:${data.targetId}`)
    }
    return { ...res, data }
  },

  async removeByMessage(messageId: string): Promise<ElectronResponse<FavoriteItem>> {
    const cached = favoriteCache.get(messageId)
    return this.remove(cached?.apiType || 'MESSAGE', cached?.targetId || messageId)
  }
}
