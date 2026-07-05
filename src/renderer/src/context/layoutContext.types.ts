import type { Socket } from 'socket.io-client'
import type { AppNotification, FriendRequestAction } from '@renderer/types/notification.types'
import type { AppPanel, Favorite, LayoutChat, LayoutMessage } from '@renderer/types/layout.types'

export interface StartChatFriendSnapshot {
  id?: string
  name?: string
  username?: string
  avatar?: string
}

export interface LayoutContextValue {
  activePanel: AppPanel
  currentUserId: string | null
  selectedChat: string | null
  mobileChatOpen: boolean
  mobileDetailOpen: boolean
  socket: Socket | null
  chats: LayoutChat[]
  friendChats: LayoutChat[]
  groupChats: LayoutChat[]
  messages: LayoutMessage[]
  notifications: AppNotification[]
  favorites: Favorite[]
  clearedChat: string | null
  unreadCount: number
  navigatePanel: (panel: AppPanel) => void
  setActivePanelState: (panel: AppPanel, options?: { preserveSelectedChatId?: string }) => void
  handleChatSelect: (chatId: string) => void
  handleBackToList: () => void
  deleteChat: (id: string) => void
  markChatAsRead: (chatId: string) => Promise<void>
  clearChatMessages: (chatId: string) => Promise<void>
  handleRefreshConversations: (newRoomId?: string) => Promise<void>
  handleOptimisticSend: (content: string) => void
  startChatWithFriend: (userId: string, friend?: StartChatFriendSnapshot) => Promise<void>
  markNotificationAsRead: (id: string) => Promise<void>
  markAllNotificationsAsRead: () => Promise<void>
  handleFriendRequest: (id: string, action: FriendRequestAction) => Promise<void>
}
