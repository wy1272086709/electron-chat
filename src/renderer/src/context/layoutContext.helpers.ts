import type { Conversation, ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type { LayoutChat, LayoutMessage } from '@renderer/types/layout.types'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'
import type { StartChatFriendSnapshot } from './layoutContext.types'

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
  const preview = lm?.content ? (isPrivate ? lm.content : `${senderNick || ''}: ${lm.content}`) : ''
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

export const mapServerMessage = async (
  m: ServerMessage,
  meId: string | null
): Promise<LayoutMessage> => {
  const senderAvatar = await resolveAvatarUrl(m.sender?.avatarUrl)

  return {
    id: m.id,
    chatId: m.roomId,
    content: m.content || '',
    time: formatHM(m.createdAt),
    sender: m.senderId === meId ? 'me' : 'other',
    senderName: m.sender?.nickname || m.sender?.username || '群成员',
    senderAvatar
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
