import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { chatService } from '@renderer/services/chat.service'
import { notificationService } from '@renderer/services/notification.service'
import { userService } from '@renderer/services/user.service'
import type { AppNotification, NotificationAction } from '@renderer/types/notification.types'
import type {
  AppPanel,
  LayoutChat,
  LayoutMessage,
  MessageDeliveryStatus
} from '@renderer/types/layout.types'
import { getPrivateRoomId, mapPrivateRoomFallback } from './layoutContext.helpers'
import type { StartChatFriendSnapshot } from './layoutContext.types'
import type { PendingReliableMessage } from './layoutContext.runtime'
import { useMessageActions } from './useMessageActions'

interface UseLayoutActionsOptions {
  navigate: NavigateFunction
  clearedChat: string | null
  selectedChatRef: MutableRefObject<string | null>
  lastSelectedChatByPanelRef: MutableRefObject<Partial<Record<'chat' | 'groups', string | null>>>
  activePanelRef: MutableRefObject<AppPanel>
  currentUserIdRef: MutableRefObject<string | null>
  chatsRef: MutableRefObject<LayoutChat[]>
  messagesRef: MutableRefObject<LayoutMessage[]>
  pendingFilesRef: MutableRefObject<Map<string, File>>
  setActivePanel: Dispatch<SetStateAction<AppPanel>>
  setSelectedChat: Dispatch<SetStateAction<string | null>>
  setMobileChatOpen: Dispatch<SetStateAction<boolean>>
  setMobileDetailOpen: Dispatch<SetStateAction<boolean>>
  setClearedChat: Dispatch<SetStateAction<string | null>>
  setChats: Dispatch<SetStateAction<LayoutChat[]>>
  setMessages: Dispatch<SetStateAction<LayoutMessage[]>>
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>
  loadConversations: (meId: string | null) => Promise<LayoutChat[]>
  loadMessages: (roomId: string, meId: string | null) => Promise<void>
  rememberSelectedChat: (chatId: string) => void
  forgetSelectedChat: (chatId: string) => void
  upsertPendingMessage: (item: PendingReliableMessage) => void
  schedulePendingFlush: (delay?: number) => void
  setLocalMessageStatusByClientId: (
    clientMessageId: string,
    status: MessageDeliveryStatus,
    errorMessage?: string,
    localId?: string
  ) => void
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useLayoutActions(options: UseLayoutActionsOptions) {
  const {
    navigate,
    clearedChat,
    selectedChatRef,
    lastSelectedChatByPanelRef,
    activePanelRef,
    currentUserIdRef,
    chatsRef,
    messagesRef,
    pendingFilesRef,
    setActivePanel,
    setSelectedChat,
    setMobileChatOpen,
    setMobileDetailOpen,
    setClearedChat,
    setChats,
    setMessages,
    setNotifications,
    loadConversations,
    loadMessages,
    rememberSelectedChat,
    forgetSelectedChat,
    upsertPendingMessage,
    schedulePendingFlush,
    setLocalMessageStatusByClientId
  } = options

  const markNotificationAsRead = useCallback(async (id: string): Promise<void> => {
    const res = await notificationService.markRead(id)
    const updated = res.data
    if (res.result && updated) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...updated, isRead: true, sender: n.sender } : n))
      )
    } else {
      console.warn('[Layout] 标记通知已读失败:', res.message)
    }
  }, [])

  const handleFriendRequest = useCallback(
    async (id: string, action: NotificationAction): Promise<void> => {
      const res = await notificationService.handleFriendRequest(id, action)
      const updated = res.data
      if (res.result && updated) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, ...updated, sender: n.sender } : n))
        )
      } else {
        console.warn('[Layout] 处理好友申请失败:', res.message)
        alert(res.message || '处理好友申请失败')
      }
    },
    []
  )

  const handleGroupInvitation = useCallback(
    async (id: string, action: NotificationAction): Promise<void> => {
      const res = await notificationService.handleGroupInvitation(id, action)
      const updated = res.data
      if (res.result && updated) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, ...updated, sender: n.sender } : n))
        )
        if (action === 'ACCEPTED') {
          await loadConversations(currentUserIdRef.current)
        }
      } else {
        console.warn('[Layout] 处理群邀请失败:', res.message)
        alert(res.message || '处理群邀请失败')
      }
    },
    [loadConversations]
  )

  const markChatAsRead = useCallback(async (chatId: string): Promise<void> => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, unread: undefined } : chat))
    )
    const res = await chatService.markRoomRead(chatId)
    if (!res.result) {
      console.warn('[Layout] 标记已读失败:', res.message)
    }
  }, [])

  const clearChatMessages = useCallback(
    async (chatId: string): Promise<void> => {
      const res = await chatService.clearRoom(chatId)
      if (!res.result) {
        console.warn('[Layout] 清空聊天失败:', res.message)
        return
      }

      await loadMessages(chatId, currentUserIdRef.current)
      setChats((prev) => {
        const target = prev.find((c) => c.id === chatId)
        if (!target) return prev
        return [...prev.filter((c) => c.id !== chatId), target]
      })
      rememberSelectedChat(chatId)
      selectedChatRef.current = chatId
      setSelectedChat(chatId)
      setClearedChat(chatId)

      const chat = chatsRef.current.find((c) => c.id === chatId)
      alert(`已清空与 ${chat?.name || ''} 的聊天记录`)
    },
    [loadMessages, rememberSelectedChat]
  )

  const deleteChat = useCallback(
    (id: string): void => {
      setChats((prev) => prev.filter((chat) => chat.id !== id))
      forgetSelectedChat(id)
      if (selectedChatRef.current === id) {
        selectedChatRef.current = null
        setSelectedChat(null)
      }
    },
    [forgetSelectedChat]
  )

  // 删除好友：调后端接口，乐观移除该好友的私聊会话并清空选中，再与后端同步。
  // 返回是否成功，供「好友资料」弹窗决定是否关闭 / 通知调用方刷新通讯录。
  const removeFriend = useCallback(
    async (friendId: string): Promise<boolean> => {
      const res = await userService.deleteFriend(friendId)
      if (!res.result) {
        alert(res.message || '删除好友失败')
        return false
      }

      // 乐观移除该好友对应的私聊会话（按 peerUserId 匹配）
      const removed = chatsRef.current.find((c) => c.type === 'chat' && c.peerUserId === friendId)
      if (removed) {
        setChats((prev) => prev.filter((c) => c.id !== removed.id))
        forgetSelectedChat(removed.id)
        if (selectedChatRef.current === removed.id) {
          selectedChatRef.current = null
          setSelectedChat(null)
        }
      }

      // 与后端同步：后端已软移除成员关系，刷新后该私聊不会再出现
      void loadConversations(currentUserIdRef.current)
      return true
    },
    [forgetSelectedChat, loadConversations]
  )

  // 退出群聊：调后端接口，乐观移除该群会话并清空选中，再与后端同步。
  // 返回是否成功，供「群资料」弹窗决定是否关闭 / 回到列表。
  const leaveGroup = useCallback(
    async (roomId: string): Promise<boolean> => {
      const res = await chatService.leaveGroup(roomId)
      if (!res.result) {
        alert(res.message || '退出群聊失败')
        return false
      }

      // 乐观移除该群会话（按 roomId 匹配）
      setChats((prev) => prev.filter((c) => c.id !== roomId))
      forgetSelectedChat(roomId)
      if (selectedChatRef.current === roomId) {
        selectedChatRef.current = null
        setSelectedChat(null)
      }

      // 与后端同步：后端已把当前用户在该群置为 INACTIVE，刷新后该群不会再出现
      void loadConversations(currentUserIdRef.current)
      return true
    },
    [forgetSelectedChat, loadConversations]
  )

  const { sendMessage, sendAttachment, retrySendMessage } = useMessageActions({
    selectedChatRef,
    chatsRef,
    messagesRef,
    pendingFilesRef,
    setMessages,
    upsertPendingMessage,
    schedulePendingFlush,
    setLocalMessageStatusByClientId
  })
  const navigatePanel = useCallback(
    (panel: AppPanel): void => {
      if (panel === 'chat' || panel === 'groups') {
        const restoredChatId = lastSelectedChatByPanelRef.current[panel] ?? null
        selectedChatRef.current = restoredChatId
        setSelectedChat(restoredChatId)
      }
      activePanelRef.current = panel
      setActivePanel(panel)

      const pathByPanel: Record<AppPanel, string> = {
        chat: '/messages',
        groups: '/groups',
        contacts: '/contacts',
        notifications: '/notifications',
        favorites: '/favorites'
      }
      navigate(pathByPanel[panel])
    },
    [navigate]
  )

  const setActivePanelState = useCallback(
    (panel: AppPanel, options?: { preserveSelectedChatId?: string }): void => {
      if (panel === 'chat' || panel === 'groups') {
        const restoredChatId =
          options?.preserveSelectedChatId ?? lastSelectedChatByPanelRef.current[panel] ?? null
        if (options?.preserveSelectedChatId) {
          lastSelectedChatByPanelRef.current[panel] = options.preserveSelectedChatId
        }
        selectedChatRef.current = restoredChatId
        setSelectedChat(restoredChatId)
      }
      activePanelRef.current = panel
      setActivePanel(panel)
    },
    []
  )

  const startChatWithFriend = useCallback(
    async (userId: string, friend?: StartChatFriendSnapshot): Promise<void> => {
      const res = await chatService.createPrivateRoom(userId)
      if (res.result && res.data) {
        const roomId = getPrivateRoomId(res.data)
        if (!roomId) {
          console.warn('[Layout] 发起私聊成功但未拿到房间 ID:', res.data)
          alert('发起私聊失败：未获取到会话 ID')
          return
        }

        const meId = currentUserIdRef.current
        await loadConversations(meId)
        const fallbackChat = await mapPrivateRoomFallback(
          res.data,
          roomId,
          { id: userId, ...friend },
          meId
        )
        setChats((prev) => {
          if (prev.some((chat) => chat.id === roomId)) return prev
          return [fallbackChat, ...prev]
        })
        lastSelectedChatByPanelRef.current.chat = roomId
        selectedChatRef.current = roomId
        setSelectedChat(roomId)
        if (window.innerWidth <= 768) {
          setMobileChatOpen(false)
          setMobileDetailOpen(true)
        }
        navigate('/messages', { state: { preserveSelectedChatId: roomId } })
      } else {
        console.warn('[Layout] 发起私聊失败:', res.message)
        alert(res.message || '发起私聊失败')
      }
    },
    [loadConversations, navigate]
  )

  const handleChatSelect = useCallback(
    (chatId: string): void => {
      const panel = activePanelRef.current
      if (panel === 'chat' || panel === 'groups') {
        lastSelectedChatByPanelRef.current[panel] = chatId
      }
      rememberSelectedChat(chatId)
      selectedChatRef.current = chatId
      setSelectedChat(chatId)
      void markChatAsRead(chatId)
      if (window.innerWidth <= 768) {
        setMobileChatOpen(false)
        setMobileDetailOpen(true)
      }
    },
    [markChatAsRead, rememberSelectedChat]
  )

  const handleBackToList = useCallback((): void => {
    if (window.innerWidth <= 768) {
      setMobileDetailOpen(false)
      setMobileChatOpen(true)
    }
  }, [])

  useEffect(() => {
    const handleResize = (): void => {
      if (window.innerWidth > 768) {
        setMobileChatOpen(false)
        setMobileDetailOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (clearedChat) {
      const timer = setTimeout(() => {
        setClearedChat(null)
      }, 100)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [clearedChat])

  return {
    markNotificationAsRead,
    handleFriendRequest,
    handleGroupInvitation,
    markChatAsRead,
    clearChatMessages,
    deleteChat,
    removeFriend,
    leaveGroup,
    sendMessage,
    sendAttachment,
    retrySendMessage,
    navigatePanel,
    setActivePanelState,
    startChatWithFriend,
    handleChatSelect,
    handleBackToList
  }
}
