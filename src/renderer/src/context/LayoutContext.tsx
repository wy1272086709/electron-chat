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
import type { Conversation, ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type { AppNotification, FriendRequestAction } from '@renderer/types/notification.types'
import type { AppPanel, Favorite, LayoutChat, LayoutMessage } from '@renderer/types/layout.types'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'

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

interface LayoutContextValue {
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
  setActivePanelState: (panel: AppPanel) => void
  handleChatSelect: (chatId: string) => void
  handleBackToList: () => void
  deleteChat: (id: string) => void
  markChatAsRead: (chatId: string) => Promise<void>
  clearChatMessages: (chatId: string) => Promise<void>
  handleRefreshConversations: (newRoomId?: string) => Promise<void>
  handleOptimisticSend: (content: string) => void
  startChatWithFriend: (userId: string) => Promise<void>
  markNotificationAsRead: (id: string) => Promise<void>
  markAllNotificationsAsRead: () => Promise<void>
  handleFriendRequest: (id: string, action: FriendRequestAction) => Promise<void>
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

const formatHM = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

const mapConversation = (c: Conversation, meId: string | null): LayoutChat => {
  const isPrivate = c.room.topic === 'PRIVATE'
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

const resolveChatAvatar = async (chat: LayoutChat): Promise<LayoutChat> => {
  const avatar = await resolveAvatarUrl(chat.avatar)
  return avatar ? { ...chat, avatar } : chat
}

const mapServerMessage = async (m: ServerMessage, meId: string | null): Promise<LayoutMessage> => {
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
  const conversationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notificationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

  useEffect(() => {
    activePanelRef.current = activePanel
  }, [activePanel])

  const loadConversations = useCallback(async (meId: string | null): Promise<void> => {
    const res = await chatService.getConversations()
    if (res.result && res.data) {
      const list = await Promise.all(
        res.data.map((c) => resolveChatAvatar(mapConversation(c, meId)))
      )
      setChats(list)
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
      await loadConversations(currentUserId)
      if (newRoomId) {
        setSelectedChat(newRoomId)
      }
    },
    [loadConversations, currentUserId]
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

  const markChatAsRead = async (chatId: string): Promise<void> => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, unread: undefined } : chat))
    )
    const res = await chatService.markRoomRead(chatId)
    if (!res.result) {
      console.warn('[Layout] 标记已读失败:', res.message)
    }
  }

  const clearChatMessages = async (chatId: string): Promise<void> => {
    const res = await chatService.clearRoom(chatId)
    if (!res.result) {
      console.warn('[Layout] 清空聊天失败:', res.message)
      return
    }

    await loadMessages(chatId, currentUserId)
    setChats((prev) => {
      const target = prev.find((c) => c.id === chatId)
      if (!target) return prev
      return [...prev.filter((c) => c.id !== chatId), target]
    })
    setSelectedChat(chatId)
    setClearedChat(chatId)

    const chat = chats.find((c) => c.id === chatId)
    alert(`已清空与 ${chat?.name || ''} 的聊天记录`)
  }

  const deleteChat = (id: string): void => {
    setChats((prev) => prev.filter((chat) => chat.id !== id))
    if (selectedChat === id) {
      setSelectedChat(null)
    }
  }

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
        setSelectedChat(null)
      }
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

  const setActivePanelState = useCallback((panel: AppPanel): void => {
    if (panel !== activePanelRef.current) {
      setSelectedChat(null)
    }
    setActivePanel(panel)
  }, [])

  const startChatWithFriend = useCallback(
    async (userId: string): Promise<void> => {
      const res = await chatService.createPrivateRoom(userId)
      if (res.result && res.data) {
        const roomId = res.data.id
        await loadConversations(currentUserId)
        setActivePanel('chat')
        setSelectedChat(roomId)
        navigate('/messages')
      } else {
        console.warn('[Layout] 发起私聊失败:', res.message)
        alert(res.message || '发起私聊失败')
      }
    },
    [loadConversations, currentUserId, navigate]
  )

  const handleChatSelect = (chatId: string): void => {
    setSelectedChat(chatId)
    void markChatAsRead(chatId)
    if (window.innerWidth <= 768) {
      setMobileChatOpen(false)
      setMobileDetailOpen(true)
    }
  }

  const handleBackToList = (): void => {
    if (window.innerWidth <= 768) {
      setMobileDetailOpen(false)
      setMobileChatOpen(true)
    }
  }

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
