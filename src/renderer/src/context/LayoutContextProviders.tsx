/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo } from 'react'
import type {
  ChatContextValue,
  FavoritesContextValue,
  LayoutContextValue,
  NavigationContextValue,
  NotificationsContextValue
} from './layoutContext.types'

const LayoutContext = createContext<LayoutContextValue | null>(null)
const NavigationContext = createContext<NavigationContextValue | null>(null)
const ChatContext = createContext<ChatContextValue | null>(null)
const NotificationsContext = createContext<NotificationsContextValue | null>(null)
const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export const LayoutContextProviders: React.FC<{
  value: LayoutContextValue
  children: React.ReactNode
}> = ({ value, children }) => {
  const navigationValue = useMemo<NavigationContextValue>(
    () => ({
      activePanel: value.activePanel,
      mobileChatOpen: value.mobileChatOpen,
      mobileDetailOpen: value.mobileDetailOpen,
      navigatePanel: value.navigatePanel,
      setActivePanelState: value.setActivePanelState,
      handleBackToList: value.handleBackToList
    }),
    [
      value.activePanel,
      value.mobileChatOpen,
      value.mobileDetailOpen,
      value.navigatePanel,
      value.setActivePanelState,
      value.handleBackToList
    ]
  )
  const chatValue = useMemo<ChatContextValue>(
    () => ({
      currentUserId: value.currentUserId,
      selectedChat: value.selectedChat,
      socket: value.socket,
      chats: value.chats,
      friendChats: value.friendChats,
      groupChats: value.groupChats,
      messages: value.messages,
      clearedChat: value.clearedChat,
      unreadCount: value.unreadCount,
      handleChatSelect: value.handleChatSelect,
      deleteChat: value.deleteChat,
      markChatAsRead: value.markChatAsRead,
      clearChatMessages: value.clearChatMessages,
      handleRefreshConversations: value.handleRefreshConversations,
      sendMessage: value.sendMessage,
      sendAttachment: value.sendAttachment,
      retrySendMessage: value.retrySendMessage,
      startChatWithFriend: value.startChatWithFriend,
      removeFriend: value.removeFriend,
      leaveGroup: value.leaveGroup
    }),
    [value]
  )
  const notificationsValue = useMemo<NotificationsContextValue>(
    () => ({
      notifications: value.notifications,
      pendingNotificationCount: value.pendingNotificationCount,
      markNotificationAsRead: value.markNotificationAsRead,
      handleFriendRequest: value.handleFriendRequest,
      handleGroupInvitation: value.handleGroupInvitation
    }),
    [value]
  )
  const favoritesValue = useMemo<FavoritesContextValue>(
    () => ({ favorites: value.favorites }),
    [value.favorites]
  )

  return (
    <LayoutContext.Provider value={value}>
      <NavigationContext.Provider value={navigationValue}>
        <ChatContext.Provider value={chatValue}>
          <NotificationsContext.Provider value={notificationsValue}>
            <FavoritesContext.Provider value={favoritesValue}>{children}</FavoritesContext.Provider>
          </NotificationsContext.Provider>
        </ChatContext.Provider>
      </NavigationContext.Provider>
    </LayoutContext.Provider>
  )
}

function useRequiredContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context)
  if (!value) throw new Error(`${name} must be used within LayoutProvider`)
  return value
}

export const useNavigationContext = (): NavigationContextValue =>
  useRequiredContext(NavigationContext, 'useNavigationContext')
export const useChatContext = (): ChatContextValue =>
  useRequiredContext(ChatContext, 'useChatContext')
export const useNotificationsContext = (): NotificationsContextValue =>
  useRequiredContext(NotificationsContext, 'useNotificationsContext')
export const useFavoritesContext = (): FavoritesContextValue =>
  useRequiredContext(FavoritesContext, 'useFavoritesContext')
export const useLayoutContext = (): LayoutContextValue =>
  useRequiredContext(LayoutContext, 'useLayoutContext')
