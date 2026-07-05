import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { API_CONFIG } from '@renderer/config/api.config'
import { chatService } from '@renderer/services/chat.service'
import { notificationService } from '@renderer/services/notification.service'
import { secureStorageService } from '@renderer/services/secure-storage.service'
import type { ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type { AppNotification, FriendRequestAction } from '@renderer/types/notification.types'
import type { AppPanel, Favorite, LayoutChat, LayoutMessage } from '@renderer/types/layout.types'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'
import {
  formatHM,
  getPrivateRoomId,
  mapConversation,
  mapPrivateRoomFallback,
  mapServerMessage,
  mergeConversationList,
  resolveChatAvatar
} from './layoutContext.helpers'
import type { LayoutContextValue, StartChatFriendSnapshot } from './layoutContext.types'

const NOTIFICATION_SOCKET_EVENTS = [
  'notification:new',
  'notification:updated',
  'notification:read',
  'notification:readAll',
  'friend:request',
  'friend:requestHandled',
  'group:invite',
  'group:inviteHandled'
] as const

const LayoutContext = createContext<LayoutContextValue | null>(null)

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate()
  const [activePanel, setActivePanel] = useState<AppPanel>('chat')
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [clearedChat, setClearedChat] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [chats, setChats] = useState<LayoutChat[]>([])
  const [messages, setMessages] = useState<LayoutMessage[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [favorites] = useState<Favorite[]>([
    {
      id: '1',
      type: 'message',
      title: '项目文档',
      content: '请查看最新的项目文档，包含了所有功能需求',
      time: '2024-01-15',
      chatId: '2'
    },
    {
      id: '2',
      type: 'file',
      title: '设计稿.zip',
      time: '2024-01-14',
      fileName: '设计稿_v2.0.zip'
    }
  ])

  const selectedChatRef = useRef<string | null>(selectedChat)
  const activePanelRef = useRef<AppPanel>(activePanel)
  const currentUserIdRef = useRef<string | null>(currentUserId)
  const chatsRef = useRef<LayoutChat[]>(chats)
  const conversationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notificationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

  useEffect(() => {
    activePanelRef.current = activePanel
  }, [activePanel])

  useEffect(() => {
    currentUserIdRef.current = currentUserId
  }, [currentUserId])

  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  const loadConversations = useCallback(async (meId: string | null): Promise<void> => {
    const res = await chatService.getConversations()
    if (res.result && res.data) {
      const list = await Promise.all(
        res.data.map((c) => resolveChatAvatar(mapConversation(c, meId)))
      )
      setChats((prev) => mergeConversationList(list, prev, selectedChatRef.current))
    } else {
      console.warn('[Layout] 加载会话列表失败:', res.message)
    }
  }, [])

  const loadMessages = useCallback(async (roomId: string, meId: string | null): Promise<void> => {
    const res = await chatService.getMessages(roomId, 50)
    if (res.result && res.data) {
      const sorted = res.data
        .filter((m) => !m.isDeleted)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      const list = await Promise.all(sorted.map((m) => mapServerMessage(m, meId)))
      setMessages(list)
    } else {
      setMessages([])
      console.warn('[Layout] 加载消息失败:', res.message)
    }
  }, [])

  const loadNotifications = useCallback(async (): Promise<void> => {
    const res = await notificationService.getNotifications()
    if (res.result && res.data) {
      const sorted = [...res.data].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      setNotifications(sorted)
    } else {
      console.warn('[Layout] 加载通知列表失败:', res.message)
    }
  }, [])

  const scheduleConversationRefresh = useCallback(
    (meId: string | null): void => {
      if (conversationRefreshTimerRef.current) {
        clearTimeout(conversationRefreshTimerRef.current)
      }

      conversationRefreshTimerRef.current = setTimeout(() => {
        conversationRefreshTimerRef.current = null
        void loadConversations(meId)
      }, 120)
    },
    [loadConversations]
  )

  const scheduleNotificationRefresh = useCallback((): void => {
    if (notificationRefreshTimerRef.current) {
      clearTimeout(notificationRefreshTimerRef.current)
    }

    notificationRefreshTimerRef.current = setTimeout(() => {
      notificationRefreshTimerRef.current = null
      void loadNotifications()
    }, 120)
  }, [loadNotifications])

  useEffect(() => {
    return () => {
      if (conversationRefreshTimerRef.current) {
        clearTimeout(conversationRefreshTimerRef.current)
      }
      if (notificationRefreshTimerRef.current) {
        clearTimeout(notificationRefreshTimerRef.current)
      }
    }
  }, [])

  const handleRefreshConversations = useCallback(
    async (newRoomId?: string): Promise<void> => {
      await loadConversations(currentUserIdRef.current)
      if (newRoomId) {
        selectedChatRef.current = newRoomId
        setSelectedChat(newRoomId)
      }
    },
    [loadConversations]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const user = await secureStorageService.getUserInfo()
      if (cancelled) return
      const meId = user?.id ?? null
      setCurrentUserId(meId)
      await Promise.all([loadConversations(meId), loadNotifications()])
    })()
    return () => {
      cancelled = true
    }
  }, [loadConversations, loadNotifications])

  useEffect(() => {
    ;(async () => {
      if (selectedChat && (activePanel === 'chat' || activePanel === 'groups')) {
        await loadMessages(selectedChat, currentUserId)
      } else {
        setMessages([])
      }
    })()
  }, [selectedChat, activePanel, currentUserId, loadMessages])

  useEffect(() => {
    let socket: Socket | null = null
    let meId: string | null = currentUserId
    let active = true

    ;(async () => {
      const token = await secureStorageService.getAccessToken()
      const user = await secureStorageService.getUserInfo()
      meId = user?.id ?? currentUserId
      const baseURL = API_CONFIG.baseURL
      if (!token || !baseURL) {
        console.warn('[Socket] 缺少 token 或 baseURL，跳过 socket 连接')
        return
      }
      if (!active) return

      const socketUrl = `${new URL(baseURL).origin}/chat`
      console.log('[Socket] 连接 URL:', socketUrl)
      socket = io(socketUrl, {
        auth: {
          token,
          Authorization: `Bearer ${token}`
        }
      })
      setSocket(socket)

      socket.on('connect', () => console.log('[Socket] connected:', socket?.id))
      socket.on('disconnect', (reason) => console.log('[Socket] disconnected:', reason))
      socket.on('connect_error', (err) => console.error('[Socket] connect_error:', err.message))
      socket.on('chat:connected', (d: { userId?: string }) => {
        if (d?.userId) meId = d.userId
        console.log('[Socket] 鉴权成功:', d)
      })
      socket.on('chat:error', (e: { message?: string }) => {
        console.error('[Socket] chat:error:', e?.message)
      })

      const refreshConversations = (): void => {
        scheduleConversationRefresh(meId)
      }
      const refreshNotifications = (): void => {
        scheduleNotificationRefresh()
      }
      const refreshNotificationsAndConversations = (): void => {
        refreshNotifications()
        refreshConversations()
      }

      socket.on('message:new', async (msg: ServerMessage) => {
        if (!msg?.id || !msg.roomId) return
        const isMe = msg.senderId === meId
        const senderAvatar = await resolveAvatarUrl(msg.sender?.avatarUrl)
        const local: LayoutMessage = {
          id: msg.id,
          chatId: msg.roomId,
          content: msg.content || '',
          time: formatHM(msg.createdAt),
          sender: isMe ? 'me' : 'other',
          senderName: msg.sender?.nickname || msg.sender?.username || '群成员',
          senderAvatar
        }
        const isOpen = selectedChatRef.current === msg.roomId

        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === msg.roomId)
          const senderNick = msg.sender?.nickname || msg.sender?.username
          const isGroup = idx > -1 && prev[idx].type === 'group'
          const preview = msg.content
            ? isGroup
              ? `${senderNick || ''}: ${msg.content}`
              : msg.content
            : ''
          const base: LayoutChat =
            idx > -1
              ? prev[idx]
              : {
                  id: msg.roomId,
                  name: senderNick || '新会话',
                  avatar: '',
                  lastMessage: '',
                  time: '',
                  type: 'chat'
                }
          const next: LayoutChat = {
            ...base,
            avatar: base.avatar || (!isGroup ? senderAvatar : ''),
            lastMessage: preview,
            time: msg.createdAt,
            unread: isOpen || isMe ? undefined : (base.unread || 0) + 1
          }
          return [next, ...prev.filter((c) => c.id !== msg.roomId)]
        })

        if (isOpen) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === local.id)) return prev
            const cleaned = prev.filter(
              (m) =>
                !(
                  m.id.startsWith('local-') &&
                  m.chatId === local.chatId &&
                  m.content === local.content
                )
            )
            return [...cleaned, local]
          })

          if (!isMe) {
            void chatService.markRoomRead(msg.roomId).then(() => scheduleConversationRefresh(meId))
          }
        }
      })

      socket.on('message:sent', refreshConversations)
      socket.on('room:created', refreshConversations)
      socket.on('room:private', refreshConversations)
      socket.on('room:read', refreshConversations)
      socket.on('room:cleared', refreshConversations)

      NOTIFICATION_SOCKET_EVENTS.forEach((eventName) => {
        socket?.on(eventName, refreshNotificationsAndConversations)
      })

      socket.onAny((eventName: string) => {
        const lowerEventName = eventName.toLowerCase()
        const isNotificationEvent =
          lowerEventName.includes('notification') ||
          lowerEventName.includes('friend') ||
          lowerEventName.includes('invite')

        if (isNotificationEvent) {
          refreshNotificationsAndConversations()
        }
      })
    })()

    return () => {
      active = false
      socket?.removeAllListeners()
      socket?.disconnect()
      setSocket(null)
    }
  }, [currentUserId, scheduleConversationRefresh, scheduleNotificationRefresh])

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

  const markAllNotificationsAsRead = useCallback(async (): Promise<void> => {
    const res = await notificationService.markAllRead()
    if (res.result) {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } else {
      console.warn('[Layout] 标记全部已读失败:', res.message)
    }
  }, [])

  const handleFriendRequest = useCallback(
    async (id: string, action: FriendRequestAction): Promise<void> => {
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
      selectedChatRef.current = chatId
      setSelectedChat(chatId)
      setClearedChat(chatId)

      const chat = chatsRef.current.find((c) => c.id === chatId)
      alert(`已清空与 ${chat?.name || ''} 的聊天记录`)
    },
    [loadMessages]
  )

  const deleteChat = useCallback((id: string): void => {
    setChats((prev) => prev.filter((chat) => chat.id !== id))
    if (selectedChatRef.current === id) {
      selectedChatRef.current = null
      setSelectedChat(null)
    }
  }, [])

  const handleOptimisticSend = useCallback(
    (content: string): void => {
      if (!selectedChat) return
      const optimistic: LayoutMessage = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        chatId: selectedChat,
        content,
        time: formatHM(new Date().toISOString()),
        sender: 'me',
        senderName: '我'
      }
      setMessages((prev) => [...prev, optimistic])
    },
    [selectedChat]
  )

  const navigatePanel = useCallback(
    (panel: AppPanel): void => {
      if (panel !== activePanelRef.current) {
        selectedChatRef.current = null
        setSelectedChat(null)
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
      const shouldPreserveSelectedChat =
        !!options?.preserveSelectedChatId &&
        selectedChatRef.current === options.preserveSelectedChatId

      if (!shouldPreserveSelectedChat && panel !== activePanelRef.current) {
        selectedChatRef.current = null
        setSelectedChat(null)
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
      setSelectedChat(chatId)
      void markChatAsRead(chatId)
      if (window.innerWidth <= 768) {
        setMobileChatOpen(false)
        setMobileDetailOpen(true)
      }
    },
    [markChatAsRead]
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

  const friendChats = useMemo(() => chats.filter((c) => c.type === 'chat'), [chats])
  const groupChats = useMemo(() => chats.filter((c) => c.type === 'group'), [chats])
  const unreadCount = useMemo(
    () => chats.reduce((total, chat) => total + (chat.unread || 0), 0),
    [chats]
  )

  const value = useMemo<LayoutContextValue>(
    () => ({
      activePanel,
      currentUserId,
      selectedChat,
      mobileChatOpen,
      mobileDetailOpen,
      socket,
      chats,
      friendChats,
      groupChats,
      messages,
      notifications,
      favorites,
      clearedChat,
      unreadCount,
      navigatePanel,
      setActivePanelState,
      handleChatSelect,
      handleBackToList,
      deleteChat,
      markChatAsRead,
      clearChatMessages,
      handleRefreshConversations,
      handleOptimisticSend,
      startChatWithFriend,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      handleFriendRequest
    }),
    [
      activePanel,
      currentUserId,
      selectedChat,
      mobileChatOpen,
      mobileDetailOpen,
      socket,
      chats,
      friendChats,
      groupChats,
      messages,
      notifications,
      favorites,
      clearedChat,
      navigatePanel,
      setActivePanelState,
      handleChatSelect,
      handleBackToList,
      deleteChat,
      markChatAsRead,
      clearChatMessages,
      handleRefreshConversations,
      handleOptimisticSend,
      startChatWithFriend,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      handleFriendRequest,
      unreadCount
    ]
  )

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLayoutContext(): LayoutContextValue {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error('useLayoutContext must be used within LayoutProvider')
  }
  return context
}
