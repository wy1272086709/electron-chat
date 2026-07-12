import type { Conversation, ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type {
  LayoutChat,
  LayoutMessage,
  LayoutMessageType,
  MessageAttachment
} from '@renderer/types/layout.types'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'
import { isImageFile } from '@renderer/utils/file-meta'
import type { StartChatFriendSnapshot } from './layoutContext.types'

const LEGACY_FILE_MESSAGE_RE = /^\[文件:\s*(.+?)\]$/
const LEGACY_IMAGE_MESSAGE_RE = /^\[图片:\s*(.+?)\]$/

export const formatHM = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

const isPrivateConversation = (c: Conversation, meId: string | null): boolean => {
  const topic = c.room.topic?.toUpperCase()
  if (topic === 'PRIVATE') return true
  if (topic === 'GROUP') return false

  const members = c.room.members ?? []
  const peer = members.find((m) => m.userId !== meId)

  return members.length === 2 && !!peer && c.room.name.includes(':')
}

export const mapConversation = (c: Conversation, meId: string | null): LayoutChat => {
  const isPrivate = isPrivateConversation(c, meId)
  const peer = c.room.members?.find((m) => m.userId !== meId)?.user
  const lm = c.lastMessage
  const senderNick = lm?.sender?.nickname || lm?.sender?.username
  const preview = buildLastMessagePreview(
    lm?.messageType,
    lm?.content,
    lm?.fileName || undefined,
    !isPrivate,
    senderNick
  )
  const unreadCount =
    typeof c.unreadCount === 'number' && c.unreadCount > 0 ? c.unreadCount : undefined

  return {
    id: c.room.id,
    name: isPrivate ? peer?.nickname || peer?.username || c.room.name : c.room.name,
    avatar: isPrivate ? peer?.avatarUrl || '' : '',
    lastMessage: preview,
    time: lm?.createdAt || '',
    unread: unreadCount,
    isOnline: false,
    type: isPrivate ? 'chat' : 'group',
    memberCount: isPrivate ? undefined : c.room.members?.length,
    peerUserId: isPrivate ? peer?.id : undefined
  }
}

export const resolveChatAvatar = async (chat: LayoutChat): Promise<LayoutChat> => {
  const avatar = await resolveAvatarUrl(chat.avatar)
  return avatar ? { ...chat, avatar } : chat
}

export const getPrivateRoomId = (data: unknown): string | null => {
  if (!data) return null

  if (Array.isArray(data)) {
    const member = data.find((item) => {
      if (!item || typeof item !== 'object') return false
      return typeof (item as { roomId?: unknown }).roomId === 'string'
    }) as { roomId?: string } | undefined

    return member?.roomId || null
  }

  if (typeof data === 'object') {
    const room = data as { id?: unknown; roomId?: unknown }
    if (typeof room.id === 'string' && room.id) return room.id
    if (typeof room.roomId === 'string' && room.roomId) return room.roomId
  }

  return null
}

export const mapPrivateRoomFallback = async (
  data: unknown,
  roomId: string,
  friend: StartChatFriendSnapshot,
  meId: string | null
): Promise<LayoutChat> => {
  type PrivateRoomMember = {
    userId?: string
    user?: { id?: string; username?: string; nickname?: string | null; avatarUrl?: string | null }
  }

  let roomName: string | undefined
  let members: PrivateRoomMember[] = []

  if (Array.isArray(data)) {
    members = data as PrivateRoomMember[]
  } else if (data && typeof data === 'object') {
    const room = data as {
      name?: unknown
      members?: PrivateRoomMember[]
    }
    roomName = typeof room.name === 'string' ? room.name : undefined
    members = room.members ?? []
  }

  const peerMember =
    members.find((m) => m.userId === friend.id || m.user?.id === friend.id) ??
    members.find((m) => m.userId !== meId)
  const peer = peerMember?.user
  const avatar = peer?.avatarUrl ? await resolveAvatarUrl(peer.avatarUrl) : friend.avatar || ''

  return {
    id: roomId,
    name: friend.name || peer?.nickname || peer?.username || roomName || '私聊',
    avatar,
    lastMessage: '',
    time: '',
    isOnline: false,
    type: 'chat',
    peerUserId: peer?.id || peerMember?.userId || friend.id
  }
}

/**
 * 构造会话列表「最后一条消息」预览文本。
 * 集中在此，避免历史加载 / message:new / 乐观发送三处各自拼接产生不一致。
 * - IMAGE → [图片]
 * - FILE  → [文件] <fileName>
 * - 其它  → 原文 content
 * 群聊额外前缀「发送者: 」（私聊不加，与微信一致）。
 */
export function buildLastMessagePreview(
  messageType: string | undefined,
  content: string | undefined | null,
  fileName: string | undefined | null,
  isGroup: boolean,
  senderNick?: string | null
): string {
  const upper = messageType?.toUpperCase()
  const legacyFileName = content?.match(LEGACY_FILE_MESSAGE_RE)?.[1]
  const legacyImageName = content?.match(LEGACY_IMAGE_MESSAGE_RE)?.[1]
  const fileLikeImage = isImageFile(fileName) || isImageFile(legacyFileName)
  const body =
    upper === 'IMAGE' || fileLikeImage
      ? '[图片]'
      : upper === 'FILE'
        ? `[文件]${fileName ? ` ${fileName}` : ''}`
        : legacyFileName
          ? `[文件] ${legacyFileName}`
          : legacyImageName
            ? '[图片]'
            : content || ''
  return isGroup && senderNick && body ? `${senderNick}: ${body}` : body
}

export const mapServerMessage = async (
  m: ServerMessage,
  meId: string | null
): Promise<LayoutMessage> => {
  const senderAvatar = await resolveAvatarUrl(m.sender?.avatarUrl)
  const upperType = m.messageType?.toUpperCase()
  const legacyFileName = m.content?.match(LEGACY_FILE_MESSAGE_RE)?.[1]
  const legacyImageName = m.content?.match(LEGACY_IMAGE_MESSAGE_RE)?.[1]
  const mediaFileName = m.fileName || legacyFileName || legacyImageName || ''
  const fileLikeImage = isImageFile(mediaFileName, m.fileType)
  const messageType: LayoutMessageType =
    upperType === 'IMAGE' || !!legacyImageName || fileLikeImage
      ? 'IMAGE'
      : upperType === 'FILE' || legacyFileName
        ? 'FILE'
        : 'TEXT'

  const attachment: MessageAttachment | undefined =
    messageType === 'IMAGE' || messageType === 'FILE'
      ? {
          messageType,
          objectName:
            m.fileUrl || (messageType === 'IMAGE' ? mediaFileName || undefined : undefined),
          fileName: mediaFileName,
          fileSize: m.fileSize ?? 0,
          fileType: m.fileType || '',
          mediaWidth: m.mediaWidth ?? undefined,
          mediaHeight: m.mediaHeight ?? undefined,
          thumbnailUrl: m.thumbnailUrl ?? undefined
        }
      : undefined

  return {
    id: m.id,
    clientMessageId: m.clientMessageId || undefined,
    chatId: m.roomId,
    content: legacyFileName || legacyImageName ? '' : m.content || '',
    createdAt: m.createdAt,
    time: formatHM(m.createdAt),
    sender: m.senderId === meId ? 'me' : 'other',
    senderName: m.sender?.nickname || m.sender?.username || '群成员',
    senderAvatar,
    messageType,
    attachment
  }
}

export const mergeConversationList = (
  incoming: LayoutChat[],
  previous: LayoutChat[],
  selectedChatId: string | null
): LayoutChat[] => {
  if (!selectedChatId || incoming.some((chat) => chat.id === selectedChatId)) return incoming

  const selectedFallback = previous.find((chat) => chat.id === selectedChatId)
  return selectedFallback ? [selectedFallback, ...incoming] : incoming
}
