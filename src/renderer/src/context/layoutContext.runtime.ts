import type { ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type { AppNotification } from '@renderer/types/notification.types'
import type {
  LayoutMessage,
  LayoutMessageType,
  MessageAttachment
} from '@renderer/types/layout.types'
import { formatHM } from './layoutContext.helpers'

export const NOTIFICATION_SOCKET_EVENTS = [
  'notification:new',
  'notification:updated',
  'notification:read',
  'notification:readAll',
  'friend:request',
  'friend:requestHandled',
  'group:invite',
  'group:inviteHandled'
] as const

export const SEND_ACK_GRACE_MS = 1500
export const SEND_RETRY_DELAY_MS = 1200
export const SEND_BACKGROUND_VERIFY_DELAY_MS = 8000
export const SEND_MAX_RETRY_COUNT = 3
export const SYNC_PAGE_SIZE = 100
const RELIABLE_STATE_KEY_PREFIX = 'reliable_chat_state_v1'
const NOTIFICATION_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000

export type SendAckResponse = { result?: boolean; data?: unknown; message?: string }

export interface MessageModeratedPayload {
  messageId?: string
  roomId?: string
  status?: string
  moderatedAt?: string
}

export interface SendPayload {
  content?: string
  messageType: LayoutMessageType
  fileUrl?: string
  fileName?: string
  fileSize?: number
  fileType?: string
  mediaWidth?: number
  mediaHeight?: number
  thumbnailUrl?: string
}

type PendingMessageStatus = 'pending' | 'sending' | 'failed'

export interface PendingReliableMessage extends SendPayload {
  localId: string
  clientMessageId: string
  chatId: string
  receiverId?: string
  status: PendingMessageStatus
  retryCount: number
  createdAt: string
}

export interface ReliableChatLocalState {
  pendingMessages: PendingReliableMessage[]
  roomCursors: Record<string, string>
}

export type PresencePayload =
  | string
  | {
      userId?: string
      id?: string
      isOnline?: boolean
      online?: boolean
      status?: string
      lastSeenAt?: string
      lastOnlineAt?: string
      lastActiveAt?: string
    }

export type RoomPresencePayload = {
  roomId?: string
  id?: string
  onlineCount?: number
  onlineMemberCount?: number
  memberCount?: number
}

export function mediaPayloadFromAttachment(att: MessageAttachment, content?: string): SendPayload {
  return {
    messageType: att.messageType,
    content: content || undefined,
    fileUrl: att.objectName,
    fileName: att.fileName,
    fileSize: att.fileSize,
    fileType: att.fileType,
    mediaWidth: att.mediaWidth,
    mediaHeight: att.mediaHeight,
    thumbnailUrl: att.thumbnailUrl
  }
}

export function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `cmid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getReliableStateKey(userId: string | null): string {
  return `${RELIABLE_STATE_KEY_PREFIX}:${userId || 'anonymous'}`
}

export function pendingToLayoutMessage(item: PendingReliableMessage): LayoutMessage {
  const messageType = item.messageType || 'TEXT'
  const isMedia = messageType === 'IMAGE' || messageType === 'FILE'
  return {
    id: item.localId,
    clientMessageId: item.clientMessageId,
    chatId: item.chatId,
    content: item.content || '',
    createdAt: item.createdAt,
    time: formatHM(item.createdAt),
    sender: 'me',
    senderName: '我',
    status: item.status === 'failed' ? 'failed' : item.status,
    messageType,
    attachment: isMedia
      ? {
          messageType,
          objectName: item.fileUrl,
          fileName: item.fileName || '',
          fileSize: item.fileSize || 0,
          fileType: item.fileType || '',
          mediaWidth: item.mediaWidth,
          mediaHeight: item.mediaHeight,
          thumbnailUrl: item.thumbnailUrl
        }
      : undefined
  }
}

function isServerMessage(value: unknown): value is ServerMessage {
  return !!(
    value &&
    typeof value === 'object' &&
    typeof (value as ServerMessage).id === 'string' &&
    typeof (value as ServerMessage).roomId === 'string'
  )
}

export function extractServerMessage(value: unknown): ServerMessage | null {
  if (isServerMessage(value)) return value
  if (value && typeof value === 'object') {
    const maybeMessage = (value as { message?: unknown }).message
    if (isServerMessage(maybeMessage)) return maybeMessage
  }
  return null
}

export function isActionableNotification(notification: AppNotification): boolean {
  if (notification.result !== 'PENDING') return false
  const createdAt = new Date(notification.createdAt).getTime()
  return Number.isNaN(createdAt) || Date.now() - createdAt < NOTIFICATION_EXPIRE_MS
}

export function normalizePresencePayload(
  payload: PresencePayload,
  forcedOnline?: boolean
): { userId: string; isOnline: boolean; lastSeenAt?: string } | null {
  if (typeof payload === 'string') {
    if (!payload || forcedOnline === undefined) return null
    return {
      userId: payload,
      isOnline: forcedOnline,
      lastSeenAt: forcedOnline ? undefined : new Date().toISOString()
    }
  }
  if (!payload || typeof payload !== 'object') return null

  const userId = payload.userId || payload.id
  if (!userId) return null
  const status = payload.status?.toLowerCase()
  const isOnline =
    forcedOnline ??
    (typeof payload.isOnline === 'boolean'
      ? payload.isOnline
      : typeof payload.online === 'boolean'
        ? payload.online
        : status === 'online'
          ? true
          : status === 'offline'
            ? false
            : undefined)
  if (isOnline === undefined) return null

  const lastSeenAt =
    payload.lastSeenAt ||
    payload.lastOnlineAt ||
    payload.lastActiveAt ||
    (!isOnline ? new Date().toISOString() : undefined)
  return { userId, isOnline, lastSeenAt }
}
