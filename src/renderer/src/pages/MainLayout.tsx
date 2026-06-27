import React, { useState, useEffect, useCallback } from 'react'
import LeftPanel from '../components/LeftPanel'
import ChatList from '../components/ChatList'
import ChatDetail from './ChatDetail'
import Notifications from './Notifications'
import Favorites from './Favorites'
import ProfileModal from '../components/ProfileModal'
import { chatService } from '@renderer/services/chat.service'
import { userService } from '@renderer/services/user.service'
import { secureStorageService } from '@renderer/services/secure-storage.service'
import type {
  Conversation,
  ChatMessage as ServerMessage,
  UserGroup
} from '@renderer/types/chat.types'

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
}

interface Message {
  id: string
  chatId: string
  content: string
  time: string
  sender: 'me' | 'other'
  senderName?: string
}

interface Notification {
  id: string
  type: 'add_friend' | 'join_group'
  title: string
  description: string
  time: string
  read: boolean
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
  return {
    id: c.room.id,
    name: isPrivate ? peer?.nickname || peer?.username || c.room.name : c.room.name,
    avatar: isPrivate ? peer?.avatarUrl || '' : '',
    lastMessage: preview,
    time: lm?.createdAt || '',
    unread: c.unreadCount,
    isOnline: false,
    type: isPrivate ? 'chat' : 'group',
    memberCount: isPrivate ? undefined : c.room.members?.length
  }
}

const MainLayout: React.FC = () => {
  const [activePanel, setActivePanel] = useState<'chat' | 'groups' | 'notifications' | 'favorites'>(
    'chat'
  )
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [clearedChat, setClearedChat] = useState<string | null>(null)

  // 当前登录用户 ID（用于区分消息发送方、私聊对方）
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // 会话 / 群聊 / 当前房间消息：均由接口获取
  const [chats, setChats] = useState<Chat[]>([])
  const [groups, setGroups] = useState<Chat[]>([])
  const [messages, setMessages] = useState<Message[]>([])

  // TODO: 通知中心接口暂未提供，先用本地 mock
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'add_friend',
      title: '张三',
      description: '请求添加你为好友',
      time: '10分钟前',
      read: false
    },
    {
      id: '2',
      type: 'join_group',
      title: '产品团队',
      description: '你已加入群聊',
      time: '1小时前',
      read: true
    }
  ])

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

  // 群聊列表（GET /users/groups）
  const loadGroups = useCallback(async (): Promise<void> => {
    const res = await userService.getGroups()
    if (res.result && res.data) {
      setGroups(
        res.data.map(
          (g: UserGroup): Chat => ({
            id: g.id,
            name: g.name,
            avatar: '',
            lastMessage: '',
            time: g.updatedAt || '',
            unread: undefined,
            type: 'group',
            memberCount: g.memberCount
          })
        )
      )
    } else {
      console.warn('[MainLayout] 加载群聊列表失败:', res.message)
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

  // 创建群聊 / 私聊后刷新列表，可带新建房间 ID 自动选中
  const handleRefresh = useCallback(
    async (newRoomId?: string): Promise<void> => {
      await Promise.all([loadConversations(currentUserId), loadGroups()])
      if (newRoomId) {
        setSelectedChat(newRoomId)
      }
    },
    [loadConversations, loadGroups, currentUserId]
  )

  // 初始化：取当前用户 → 拉会话 + 群聊
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const user = await secureStorageService.getUserInfo()
      if (cancelled) return
      const meId = user?.id ?? null
      setCurrentUserId(meId)
      await Promise.all([loadConversations(meId), loadGroups()])
    })()
    return () => {
      cancelled = true
    }
  }, [loadConversations, loadGroups])

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

  // ---- 通知（本地）----
  const markNotificationAsRead = (id: string): void => {
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllNotificationsAsRead = (): void => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })))
  }

  // ---- 会话操作 ----

  // 标记已读（POST /chat/rooms/:roomId/read）
  const markChatAsRead = async (chatId: string): Promise<void> => {
    // 乐观更新本地未读数
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, unread: undefined } : chat))
    )
    setGroups((prev) => prev.map((g) => (g.id === chatId ? { ...g, unread: undefined } : g)))
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
    setGroups(moveToEnd)

    setSelectedChat(chatId)
    setClearedChat(chatId)

    const chat = chats.find((c) => c.id === chatId)
    alert(`已清空与 ${chat?.name || ''} 的聊天记录`)
  }

  // TODO: 后端暂无「删除会话」接口，此处仅本地移除（重载后会恢复）
  const deleteChat = (id: string): void => {
    setChats((prev) => prev.filter((chat) => chat.id !== id))
    setGroups((prev) => prev.filter((g) => g.id !== id))
    if (selectedChat === id) {
      setSelectedChat(null)
    }
  }

  // TODO: 后端暂无「添加好友」接口，此处仅生成本地通知
  const addFriend = (chatId: string): void => {
    const chat = chats.find((c) => c.id === chatId)
    if (chat) {
      const newNotification: Notification = {
        id: `friend-request-${Date.now()}`,
        type: 'add_friend',
        title: chat.name,
        description: `向 ${chat.name} 发送好友请求`,
        time: '刚刚',
        read: false
      }
      setNotifications([newNotification, ...notifications])
      console.log(`Friend request sent to ${chat.name}`)
    }
  }

  const getUnreadCount = (): number => {
    return chats.reduce((total, chat) => total + (chat.unread || 0), 0)
  }

  // 切换左栏面板时重置选中状态，避免上一面板的 selectedChat 在新面板里 find 不到对应会话
  const handlePanelChange = (panel: 'chat' | 'groups' | 'notifications' | 'favorites'): void => {
    if (panel !== activePanel) {
      setSelectedChat(null)
    }
    setActivePanel(panel)
  }

  const handleChatSelect = (chatId: string): void => {
    setSelectedChat(chatId)
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
      }, 100) // Give time for scroll to complete
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
              chats={activePanel === 'chat' ? chats : groups}
              activePanel={activePanel}
              selectedChat={selectedChat}
              onChatSelect={handleChatSelect}
              onDeleteChat={deleteChat}
              onMarkAsRead={markChatAsRead}
              onClearChat={clearChatMessages}
              onAddFriend={addFriend}
              onRefresh={handleRefresh}
            />
          </div>
        )}

      {/* Right Panel - Chat Detail or Content Panels */}
      <div className={`right-panel ${mobileDetailOpen ? 'active' : ''}`}>
        {activePanel === 'chat' && selectedChat && (
          <ChatDetail
            chat={chats.find((c) => c.id === selectedChat)}
            messages={messages.filter((m) => m.chatId === selectedChat)}
            onBack={handleBackToList}
            isMobile={window.innerWidth <= 768}
            onCleared={clearedChat === selectedChat}
          />
        )}
        {activePanel === 'groups' && selectedChat && (
          <ChatDetail
            chat={groups.find((c) => c.id === selectedChat)}
            messages={messages.filter((m) => m.chatId === selectedChat)}
            onBack={handleBackToList}
            isMobile={window.innerWidth <= 768}
            onCleared={clearedChat === selectedChat}
          />
        )}
        {activePanel === 'notifications' && (
          <Notifications
            notifications={notifications}
            onMarkRead={markNotificationAsRead}
            onMarkAllRead={markAllNotificationsAsRead}
          />
        )}
        {activePanel === 'favorites' && <Favorites favorites={favorites} />}
        {activePanel === 'chat' && !selectedChat && (
          <div className="empty-chat-detail">
            <p>选择一个聊天开始对话</p>
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
