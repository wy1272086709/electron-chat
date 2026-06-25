import React, { useState, useEffect } from 'react'
import LeftPanel from '../components/LeftPanel'
import ChatList from '../components/ChatList'
import ChatDetail from './ChatDetail'
import Notifications from './Notifications'
import Favorites from './Favorites'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import ProfileModal from '../components/ProfileModal'

interface Chat {
  id: string
  name: string
  avatar: string
  lastMessage: string
  time: string
  unread?: number
  isOnline?: boolean
  type: 'chat' | 'group'
}

interface Message {
  id: string
  chatId: string
  content: string
  time: string
  sender: 'me' | 'other'
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

const MainLayout: React.FC = () => {
  const [activePanel, setActivePanel] = useState<'chat' | 'groups' | 'notifications' | 'favorites'>('chat')
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [clearedChat, setClearedChat] = useState<string | null>(null)

  // Mock data
  const [chats, setChats] = useState<Chat[]>([
    {
      id: '1',
      name: '张三',
      avatar: FriendAvatar,
      lastMessage: '晚上一起吃饭吗？',
      time: '18:30',
      unread: 2,
      isOnline: true,
      type: 'chat'
    },
    {
      id: '2',
      name: '李四',
      avatar: FriendAvatar,
      lastMessage: '项目进度怎么样了？',
      time: '昨天',
      type: 'chat'
    },
    {
      id: '3',
      name: '产品团队',
      avatar: FriendAvatar,
      lastMessage: '王五: 明天开会讨论新功能',
      time: '14:20',
      unread: 5,
      type: 'group'
    },
    {
      id: '4',
      name: '王五',
      avatar: FriendAvatar,
      lastMessage: '收到，谢谢！',
      time: '周一',
      type: 'chat'
    }
  ])

  // Group data for the groups panel
  const [groups, setGroups] = useState<Chat[]>([
    {
      id: '3',
      name: '产品团队',
      avatar: FriendAvatar,
      lastMessage: '王五: 明天开会讨论新功能',
      time: '14:20',
      unread: 5,
      type: 'group'
    }
  ])

  const [messages] = useState<Message[]>([
    { id: '1', chatId: '1', content: '你好，最近怎么样？', time: '18:25', sender: 'other' },
    { id: '2', chatId: '1', content: '挺好的，你呢？', time: '18:26', sender: 'me' },
    { id: '3', chatId: '1', content: '晚上一起吃饭吗？', time: '18:30', sender: 'other' },
  ])

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

  const markNotificationAsRead = (id: string) => {
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllNotificationsAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const markChatAsRead = (chatId: string) => {
    setChats(chats.map(chat =>
      chat.id === chatId ? { ...chat, unread: undefined } : chat
    ))
    // Also mark messages as read in the group panel if applicable
    setGroups(groups.map(group =>
      group.id === chatId ? { ...group, unread: undefined } : group
    ))
    // If the marked chat is currently selected, switch to it to show the read state
    if (selectedChat === chatId) {
      setSelectedChat(chatId)
    }
  }

  const clearChatMessages = (chatId: string) => {
    // In a real app, you would also delete from backend
    console.log(`Clearing messages for chat: ${chatId}`)

    // Find the chat to get its name
    const chat = chats.find(c => c.id === chatId)
    if (chat) {
      // Move the chat to the bottom of the list
      const updatedChats = chats.filter(c => c.id !== chatId)
      updatedChats.push(chat)
      setChats(updatedChats)

      // Also update groups if it's a group
      if (chat.type === 'group') {
        const updatedGroups = groups.filter(g => g.id !== chatId)
        updatedGroups.push(chat)
        setGroups(updatedGroups)
      }

      // Switch to the cleared chat and set cleared flag to trigger scroll
      setSelectedChat(chatId)
      setClearedChat(chatId)

      alert(`已清空与 ${chat.name} 的聊天记录`)
    }
  }

  const deleteChat = (id: string) => {
    setChats(chats.filter(chat => chat.id !== id))
    // Also delete from groups if it's a group
    setGroups(groups.filter(group => group.id !== id))
    if (selectedChat === id) {
      setSelectedChat(null)
    }
  }

  const addFriend = (chatId: string): void => {
    const chat = chats.find(c => c.id === chatId)
    if (chat) {
      // Add a new notification
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

  const handleChatSelect = (chatId: string) => {
    setSelectedChat(chatId)
    if (window.innerWidth <= 768) {
      setMobileChatOpen(false)
      setMobileDetailOpen(true)
    }
  }

  const handleBackToList = () => {
    if (window.innerWidth <= 768) {
      setMobileDetailOpen(false)
      setMobileChatOpen(true)
    }
  }

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
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
        setActivePanel={setActivePanel}
        unreadCount={getUnreadCount()}
        setShowProfileModal={setShowProfileModal}
      />

      {/* Center Panel - Chat List */}
      {(window.innerWidth > 768 || mobileChatOpen) && (activePanel === 'chat' || activePanel === 'groups') && (
          <div
            className={`center-panel ${selectedChat && window.innerWidth > 768 ? 'hidden' : ''}`}
          >
            <ChatList
              chats={activePanel === 'chat' ? chats : groups}
              activePanel={activePanel}
              selectedChat={selectedChat}
              onChatSelect={handleChatSelect}
              onDeleteChat={deleteChat}
              onMarkAsRead={markChatAsRead}
              onClearChat={clearChatMessages}
              onAddFriend={addFriend}
            />
          </div>
      )}

      {/* Right Panel - Chat Detail or Content Panels */}
      <div className={`right-panel ${mobileDetailOpen ? 'active' : ''}`}>
        {activePanel === 'chat' && selectedChat && (
          <ChatDetail
            chat={chats.find(c => c.id === selectedChat)}
            messages={messages.filter(m => m.chatId === selectedChat)}
            onBack={handleBackToList}
            isMobile={window.innerWidth <= 768}
            onCleared={clearedChat === selectedChat}
          />
        )}
        {activePanel === 'groups' && selectedChat && (
          <ChatDetail
            chat={groups.find(c => c.id === selectedChat)}
            messages={messages.filter(m => m.chatId === selectedChat)}
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
        {activePanel === 'favorites' && (
          <Favorites favorites={favorites} />
        )}
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
