import type { Socket } from 'socket.io-client'
import type { AppNotification, NotificationAction } from '@renderer/types/notification.types'
import type { AppPanel, Favorite, LayoutChat, LayoutMessage } from '@renderer/types/layout.types'

export interface StartChatFriendSnapshot {
  id?: string
  name?: string
  username?: string
  avatar?: string
}

export interface NavigationContextValue {
  activePanel: AppPanel
  mobileChatOpen: boolean
  mobileDetailOpen: boolean
  navigatePanel: (panel: AppPanel) => void
  setActivePanelState: (panel: AppPanel, options?: { preserveSelectedChatId?: string }) => void
  handleBackToList: () => void
}

export interface ChatContextValue {
  currentUserId: string | null
  selectedChat: string | null
  socket: Socket | null
  chats: LayoutChat[]
  friendChats: LayoutChat[]
  groupChats: LayoutChat[]
  messages: LayoutMessage[]
  clearedChat: string | null
  unreadCount: number
  handleChatSelect: (chatId: string) => void
  deleteChat: (id: string) => void
  markChatAsRead: (chatId: string) => Promise<void>
  clearChatMessages: (chatId: string) => Promise<void>
  handleRefreshConversations: (newRoomId?: string) => Promise<void>
  sendMessage: (content: string) => void
  sendAttachment: (file: File, caption?: string) => void
  retrySendMessage: (messageId: string) => void
  startChatWithFriend: (userId: string, friend?: StartChatFriendSnapshot) => Promise<void>
  removeFriend: (friendId: string) => Promise<boolean>
  leaveGroup: (roomId: string) => Promise<boolean>
}

export interface NotificationsContextValue {
  notifications: AppNotification[]
  pendingNotificationCount: number
  markNotificationAsRead: (id: string) => Promise<void>
  markAllNotificationsAsRead: () => Promise<void>
  handleFriendRequest: (id: string, action: NotificationAction) => Promise<void>
  handleGroupInvitation: (id: string, action: NotificationAction) => Promise<void>
}

export interface FavoritesContextValue {
  favorites: Favorite[]
}

export interface LayoutContextValue
  extends
    NavigationContextValue,
    ChatContextValue,
    NotificationsContextValue,
    FavoritesContextValue {}
