export type AppPanel = 'chat' | 'groups' | 'contacts' | 'notifications' | 'favorites'

export interface LayoutChat {
  id: string
  name: string
  avatar: string
  lastMessage: string
  time: string
  unread?: number
  isOnline?: boolean
  type: 'chat' | 'group'
  memberCount?: number
  peerUserId?: string
}

export interface LayoutMessage {
  id: string
  chatId: string
  content: string
  time: string
  sender: 'me' | 'other'
  senderName?: string
  senderAvatar?: string
}

export interface Favorite {
  id: string
  type: 'message' | 'file'
  title: string
  content?: string
  fileName?: string
  time: string
  chatId?: string
}
