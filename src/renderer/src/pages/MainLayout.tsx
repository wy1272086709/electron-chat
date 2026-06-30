import React, { useState, useEffect, useCallback, useRef } from 'react'
import LeftPanel from '../components/LeftPanel'
import ChatList from '../components/ChatList'
import ChatDetail from './ChatDetail'
import Contacts from './Contacts'
import Notifications from './Notifications'
import Favorites from './Favorites'
import ProfileModal from '../components/ProfileModal'
import { io, type Socket } from 'socket.io-client'
import { chatService } from '@renderer/services/chat.service'
import { notificationService } from '@renderer/services/notification.service'
import { secureStorageService } from '@renderer/services/secure-storage.service'
import { API_CONFIG } from '@renderer/config/api.config'
import type { Conversation, ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type { AppNotification, FriendRequestAction } from '@renderer/types/notification.types'
import { SocketContext } from '@renderer/context'

interface Chat {
  id: string
  name: string
  avatar: string
  lastMessage: string
  time: string
  unread?: number
  isOnline?: boolean
  type: 'chat' | 'group'
  memberCount?: number
  /** 私聊对方的用户 ID；ChatDetail 发送私聊消息时作为 receiverId */
  peerUserId?: string
}

interface Message {
  id: string
  chatId: string
  content: string
  time: string
  sender: 'me' | 'other'
  senderName?: string
}

interface Favorite {
  id: string
  type: 'message' | 'file'
  title: string
  content?: string
  fileName?: string
  time: string
  chatId?: string
}

// ISO 时间 → HH:mm
const formatHM = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

// 后端会话 → 本地 Chat
const mapConversation = (c: Conversation, meId: string | null): Chat => {
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

const MainLayout: React.FC = () => {
  const [activePanel, setActivePanel] = useState<
    'chat' | 'groups' | 'contacts' | 'notifications' | 'favorites'
  >('chat')
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [clearedChat, setClearedChat] = useState<string | null>(null)

  // 当前登录用户 ID（用于区分消息发送方、私聊对方）
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [socket, setSocket] = useState<Socket | null>(null)
  // socket 回调里读取「当前打开的房间」的实时值，避免闭包捕获到旧值
  const selectedChatRef = useRef<string | null>(selectedChat)
  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

  // 会话（含私聊/群聊，按 type 区分）/ 当前房间消息：均由接口获取
  const [chats, setChats] = useState<Chat[]>([])
  const [messages, setMessages] = useState<Message[]>([])

  // 通知：由 GET /notifications 获取
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  // TODO: 收藏接口暂未提供，先用本地 mock
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

  // ---- 数据加载 ----

  // 会话列表（GET /chat/rooms）
  const loadConversations = useCallback(async (meId: string | null): Promise<void> => {
    const res = await chatService.getConversations()
    if (res.result && res.data) {
      setChats(res.data.map((c) => mapConversation(c, meId)))
    } else {
      console.warn('[MainLayout] 加载会话列表失败:', res.message)
    }
  }, [])

  // 某房间历史消息（GET /chat/rooms/:roomId/messages）
  const loadMessages = useCallback(async (roomId: string, meId: string | null): Promise<void> => {
    const res = await chatService.getMessages(roomId, 50)
    if (res.result && res.data) {
      // 服务端返回 createdAt desc（新→旧），这里翻成正序（旧→新）并过滤已删除
      const list = res.data
        .filter((m) => !m.isDeleted)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map(
          (m: ServerMessage): Message => ({
            id: m.id,
            chatId: m.roomId,
            content: m.content || '',
            time: formatHM(m.createdAt),
            sender: m.senderId === meId ? 'me' : 'other',
            senderName: m.sender?.nickname || m.sender?.username || '群成员'
          })
        )
      setMessages(list)
    } else {
      setMessages([])
      console.warn('[MainLayout] 加载消息失败:', res.message)
    }
  }, [])

  // 通知列表（GET /notifications），按 createdAt desc 排序（新→旧）
  const loadNotifications = useCallback(async (): Promise<void> => {
    const res = await notificationService.getNotifications()
    if (res.result && res.data) {
      const sorted = [...res.data].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      setNotifications(sorted)
    } else {
      console.warn('[MainLayout] 加载通知列表失败:', res.message)
    }
  }, [])

  // 创建群聊后刷新会话列表，并自动选中新群聊
  const handleRefreshConversations = useCallback(
    async (newRoomId?: string): Promise<void> => {
      await loadConversations(currentUserId)
      if (newRoomId) {
        setSelectedChat(newRoomId)
      }
    },
    [loadConversations, currentUserId]
  )

  // 初始化：取当前用户 → 拉会话 + 群聊 + 通知
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

  // 选中会话变化 → 加载该房间消息
  useEffect(() => {
    ;(async () => {
      if (selectedChat && (activePanel === 'chat' || activePanel === 'groups')) {
        await loadMessages(selectedChat, currentUserId)
      } else {
        setMessages([])
      }
    })()
  }, [selectedChat, activePanel, currentUserId, loadMessages])

  // 用 socket.io-client 连接 /chat 命名空间，监听实时消息
  // 详见 docs/chat-api.md §6（事件名、鉴权方式）
  useEffect(() => {
    let socket: Socket | null = null
    // chat:connected 回传的 userId 作为「是否为自己发送」的权威判定来源
    let meId: string | null = null
    // 异步取 token 期间 effect 可能已被清理（卸载 / loadConversations 变化），用 active 守卫避免脏写
    let active = true

    ;(async () => {
      const token = await secureStorageService.getAccessToken()
      const baseURL = API_CONFIG.baseURL
      if (!token || !baseURL) {
        console.warn('[Socket] 缺少 token 或 baseURL，跳过 socket 连接')
        return
      }
      if (!active) return

      // HTTP baseURL 形如 http://host:port/api，socket 命名空间为 /chat（与 /api 同级）
      const socketUrl = `${new URL(baseURL).origin}/chat`
      console.log('[Socket] 连接 URL:', socketUrl)
      socket = io(socketUrl, {
        auth: {
          token,
          Authorization: `Bearer ${token}`
        }
      })
      // 暴露给子组件（ChatDetail 发送消息用）
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

      // 新消息到达：更新会话预览/未读，必要时追加到当前房间消息列表
      socket.on('message:new', (msg: ServerMessage) => {
        if (!msg?.id || !msg.roomId) return
        const isMe = msg.senderId === meId
        const local: Message = {
          id: msg.id,
          chatId: msg.roomId,
          content: msg.content || '',
          time: formatHM(msg.createdAt),
          sender: isMe ? 'me' : 'other',
          senderName: msg.sender?.nickname || msg.sender?.username || '群成员'
        }
        const isOpen = selectedChatRef.current === msg.roomId

        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === msg.roomId)
          const senderNick = msg.sender?.nickname || msg.sender?.username
          const isGroup = idx > -1 && prev[idx].type === 'group'
          // 群聊预览带发送者昵称前缀，私聊只展示内容（与 mapConversation 保持一致）
          const preview = msg.content
            ? isGroup
              ? `${senderNick || ''}: ${msg.content}`
              : msg.content
            : ''
          const base: Chat =
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
          const next: Chat = {
            ...base,
            lastMessage: preview,
            time: msg.createdAt,
            // 当前正在看 / 自己发的消息不计未读
            unread: isOpen || isMe ? undefined : (base.unread || 0) + 1
          }
          // 收到新消息的会话置顶
          return [next, ...prev.filter((c) => c.id !== msg.roomId)]
        })

        // 正在查看该房间 → 实时追加；其余房间等切换时由 loadMessages 拉取
        if (isOpen) {
          setMessages((prev) => {
            // 同 id 已存在 → 不重复
            if (prev.some((m) => m.id === local.id)) return prev
            // 自己刚发的消息已有乐观占位（local- 前缀 + 同房间同内容）→ 用真实消息替换，避免重复
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
        }
      })

      // 新建群聊 / 私聊会话 → 刷新会话列表
      socket.on('room:created', () => loadConversations(meId))
      socket.on('room:private', () => loadConversations(meId))
    })()

    return () => {
      active = false
      socket?.removeAllListeners()
      socket?.disconnect()
      socket = null
      setSocket(null)
    }
  }, [loadConversations])

  // ---- 通知 ----

  // 标记单条已读（POST /notifications/markRead）。返回的是裸记录，需保留原 sender
  const markNotificationAsRead = useCallback(async (id: string): Promise<void> => {
    const res = await notificationService.markRead(id)
    const updated = res.data
    if (res.result && updated) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...updated, isRead: true, sender: n.sender } : n))
      )
    } else {
      console.warn('[MainLayout] 标记通知已读失败:', res.message)
    }
  }, [])

  // 标记全部已读（POST /notifications/markAllRead）
  const markAllNotificationsAsRead = useCallback(async (): Promise<void> => {
    const res = await notificationService.markAllRead()
    if (res.result) {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } else {
      console.warn('[MainLayout] 标记全部已读失败:', res.message)
    }
  }, [])

  // 处理好友申请（POST /notifications/handleFriendRequest）。返回裸记录，保留原 sender
  const handleFriendRequest = useCallback(
    async (id: string, action: FriendRequestAction): Promise<void> => {
      const res = await notificationService.handleFriendRequest(id, action)
      const updated = res.data
      if (res.result && updated) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, ...updated, sender: n.sender } : n))
        )
      } else {
        console.warn('[MainLayout] 处理好友申请失败:', res.message)
        alert(res.message || '处理好友申请失败')
      }
    },
    []
  )

  // ---- 会话操作 ----

  // 标记已读（POST /chat/rooms/:roomId/read）
  const markChatAsRead = async (chatId: string): Promise<void> => {
    // 乐观更新本地未读数
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, unread: undefined } : chat))
    )
    const res = await chatService.markRoomRead(chatId)
    if (!res.result) {
      console.warn('[MainLayout] 标记已读失败:', res.message)
    }
  }

  // 清空聊天记录（POST /chat/rooms/:roomId/clear，软清空）
  const clearChatMessages = async (chatId: string): Promise<void> => {
    const res = await chatService.clearRoom(chatId)
    if (!res.result) {
      console.warn('[MainLayout] 清空聊天失败:', res.message)
      return
    }

    // 软清空后重新拉取（服务端会过滤掉 clearedAt 之前的消息）
    await loadMessages(chatId, currentUserId)

    const moveToEnd = (prev: Chat[]): Chat[] => {
      const target = prev.find((c) => c.id === chatId)
      if (!target) return prev
      return [...prev.filter((c) => c.id !== chatId), target]
    }
    setChats(moveToEnd)

    setSelectedChat(chatId)
    setClearedChat(chatId)

    const chat = chats.find((c) => c.id === chatId)
    alert(`已清空与 ${chat?.name || ''} 的聊天记录`)
  }

  // TODO: 后端暂无「删除会话」接口，此处仅本地移除（重载后会恢复）
  const deleteChat = (id: string): void => {
    setChats((prev) => prev.filter((chat) => chat.id !== id))
    if (selectedChat === id) {
      setSelectedChat(null)
    }
  }

  // 乐观插入自己刚发出的消息：让消息立即上屏，不必等服务端 message:new 回推
  // （服务端通常不把 message:new 回推给发送者本人；id 以 local- 前缀标记为占位）
  const handleOptimisticSend = useCallback(
    (content: string): void => {
      if (!selectedChat) return
      const optimistic: Message = {
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

  // 通讯录：发起 / 打开与某好友的私聊 POST /chat/rooms/private
  // 创建（或复用）私聊房间后，刷新会话列表并切换到「好友消息」面板自动选中
  const startChatWithFriend = useCallback(
    async (userId: string): Promise<void> => {
      const res = await chatService.createPrivateRoom(userId)
      if (res.result && res.data) {
        const roomId = res.data.id
        await loadConversations(currentUserId)
        setActivePanel('chat')
        setSelectedChat(roomId)
      } else {
        console.warn('[MainLayout] 发起私聊失败:', res.message)
        alert(res.message || '发起私聊失败')
      }
    },
    [loadConversations, currentUserId]
  )

  // 好友面板：私聊会话；群聊面板：群聊会话（均来自 /chat/rooms，按 type 筛选）
  const friendChats = chats.filter((c) => c.type === 'chat')
  const groupChats = chats.filter((c) => c.type === 'group')

  const getUnreadCount = (): number => {
    return chats.reduce((total, chat) => total + (chat.unread || 0), 0)
  }

  // 切换左栏面板时重置选中状态，避免上一面板的 selectedChat 在新面板里 find 不到对应会话
  const handlePanelChange = (
    panel: 'chat' | 'groups' | 'contacts' | 'notifications' | 'favorites'
  ): void => {
    if (panel !== activePanel) {
      setSelectedChat(null)
    }
    setActivePanel(panel)
  }

  const handleChatSelect = (chatId: string): void => {
    setSelectedChat(chatId)
    // 将消息设为已读
    markChatAsRead(chatId)
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

  // Handle window resize
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

  // Reset clearedChat flag after scrolling
  useEffect(() => {
    if (clearedChat) {
      const timer = setTimeout(() => {
        setClearedChat(null)
      }, 100)
      // Give time for scroll to complete
      return () => clearTimeout(timer)
    }
    return undefined
  }, [clearedChat])

  return (
    <div className="app-container">
      {/* Left Panel */}
      <LeftPanel
        activePanel={activePanel}
        setActivePanel={handlePanelChange}
        unreadCount={getUnreadCount()}
        setShowProfileModal={setShowProfileModal}
      />

      {/* Center Panel - Chat List */}
      {(window.innerWidth > 768 || mobileChatOpen) &&
        (activePanel === 'chat' || activePanel === 'groups') && (
          <div className="center-panel">
            <ChatList
              chats={activePanel === 'chat' ? friendChats : groupChats}
              activePanel={activePanel}
              selectedChat={selectedChat}
              onChatSelect={handleChatSelect}
              onDeleteChat={deleteChat}
              onMarkAsRead={markChatAsRead}
              onClearChat={clearChatMessages}
              onRefresh={handleRefreshConversations}
            />
          </div>
        )}

      {/* Right Panel - Chat Detail or Content Panels */}
      <div className={`right-panel ${mobileDetailOpen ? 'active' : ''}`}>
        {(activePanel === 'chat' || activePanel === 'groups') && selectedChat && (
          <SocketContext.Provider value={{ socket }}>
            <ChatDetail
              chat={chats.find((c) => c.id === selectedChat)}
              messages={messages.filter((m) => m.chatId === selectedChat)}
              onBack={handleBackToList}
              isMobile={window.innerWidth <= 768}
              onCleared={clearedChat === selectedChat}
              onSendMessage={handleOptimisticSend}
            />
          </SocketContext.Provider>
        )}
        {activePanel === 'notifications' && (
          <Notifications
            notifications={notifications}
            onMarkRead={markNotificationAsRead}
            onMarkAllRead={markAllNotificationsAsRead}
            onHandleFriendRequest={handleFriendRequest}
          />
        )}
        {activePanel === 'contacts' && <Contacts onStartChat={startChatWithFriend} />}
        {activePanel === 'favorites' && <Favorites favorites={favorites} />}
        {activePanel === 'chat' && !selectedChat && (
          <div className="empty-chat-detail">
            <p>选择一位好友开始对话</p>
          </div>
        )}
        {activePanel === 'groups' && !selectedChat && (
          <div className="empty-chat-detail">
            <p>选择一个群聊查看消息</p>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
      <style>{`
        .empty-chat-detail {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
        }
      `}</style>
    </div>
  )
}

export default MainLayout
