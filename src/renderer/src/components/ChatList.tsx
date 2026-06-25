import React, { useEffect } from 'react'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import AddFriendModal from './AddFriendModal'
import AddGroupModal from './AddGroupModal'
import ContextMenu from './ContextMenu'

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

interface ChatListProps {
  chats: Chat[]
  activePanel: 'chat' | 'groups'
  selectedChat: string | null
  onChatSelect: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
  onMarkAsRead?: (chatId: string) => void
  onClearChat?: (chatId: string) => void
  onAddFriend?: (userId: string, reason?: string) => void
}

const ChatList: React.FC<ChatListProps> = ({
  chats,
  activePanel,
  selectedChat,
  onChatSelect,
  onDeleteChat,
  onMarkAsRead,
  onClearChat,
  onAddFriend
}) => {
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = React.useState(false)
  const [isAddGroupModalOpen, setIsAddGroupModalOpen] = React.useState(false)
  const [contextMenu, setContextMenu] = React.useState<{
    visible: boolean
    x: number
    y: number
    chatId: string
    chatName: string
  }>({
    visible: false,
    x: 0,
    y: 0,
    chatId: '',
    chatName: ''
  })

  // Mock user data for group creation
  const mockUsers = [
    { id: 'user1', name: '张三', avatar: '', isOnline: true },
    { id: 'user2', name: '李四', avatar: '', isOnline: false },
    { id: 'user3', name: '王五', avatar: '', isOnline: true },
    { id: 'user4', name: '赵六', avatar: '', isOnline: false },
    { id: 'user5', name: '钱七', avatar: '', isOnline: true }
  ]

  const handleAddFriendModal = (): void => {
    setIsAddFriendModalOpen(true)
    setIsAddGroupModalOpen(false)
  }

  const handleAddGroupModal = (): void => {
    setIsAddGroupModalOpen(true)
    setIsAddFriendModalOpen(false)
  }

  useEffect(() => {
    if (!['chat', 'groups'].includes(activePanel)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsAddFriendModalOpen(false)
      setIsAddGroupModalOpen(false)
    }
  }, [activePanel, setIsAddFriendModalOpen, setIsAddGroupModalOpen])

  const handleAddFriend = (userId: string, reason?: string): void => {
    if (onAddFriend) {
      onAddFriend(userId, reason)
    }
    setIsAddFriendModalOpen(false)
  }

  const handleAddGroup = (selectedUsers: { id: string; name: string; avatar: string; isOnline: boolean }[], groupName: string): void => {
    if (selectedUsers.length === 0) {
      return
    }
    // Mock group creation - in real app, call API to create group and get new chat ID
    const newGroupId = `group-${Date.now()}`
    const newGroup: Chat = {
      id: newGroupId,
      name: groupName || `新群聊 (${selectedUsers.map((u) => u.name).join(', ')})`,
      avatar: '',
      lastMessage: '',
      time: new Date().toISOString(),
      type: 'group'
    }
    // In real app, you would also need to update the chat list state in MainLayout
    console.log('创建群聊:', newGroup)
    setIsAddGroupModalOpen(false)
  }

  const handleCloseAddFriendModal: () => void = () => {
    setIsAddFriendModalOpen(false)
  }

  const handleCloseAddGroupModal: () => void = () => {
    setIsAddGroupModalOpen(false)
  }

  const formatDate = (time: string): string => {
    // Mock function - in real app, parse actual date
    if (time.includes(':')) {
      return time
    }
    return new Date(time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const handleContextMenu = (e: React.MouseEvent, chat: Chat) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      chatId: chat.id,
      chatName: chat.name
    })
  }

  const closeContextMenu = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      chatId: '',
      chatName: ''
    })
  }

  return (
    <div className="center-panel-inner">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <h2>消息</h2>
        <button
          className="cursor-pointer"
          onClick={activePanel === 'chat' ? handleAddFriendModal : handleAddGroupModal}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            color: 'white',
            fontSize: 20,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            position: 'relative'
          }}
          title={activePanel === 'chat' ? '添加好友' : '添加群聊'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ margin: 0 }}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
          </svg>
        </button>
      </div>

      {/* Search Box */}
      <div className="search-box">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input type="text" className="search-input" placeholder="搜索聊天" />
      </div>

      {/* Chat List */}
      <div className="chat-list">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-item ${selectedChat === chat.id ? 'active' : ''}`}
            onClick={() => onChatSelect(chat.id)}
            onContextMenu={(e) => handleContextMenu(e, chat)}
          >
            {/* Avatar */}
            <div className="chat-avatar">
              <img
                src={FriendAvatar}
                alt={chat.name}
                onError={(e) => {
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.name)}&background=6366f1&color=fff&size=48`
                }}
              />
              {chat.isOnline && (
                <div
                  className="online-indicator"
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    right: 2,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    border: '2px solid #22222b'
                  }}
                />
              )}
            </div>

            {/* Chat Info */}
            <div className="chat-info">
              <div className="chat-header-row">
                <span className="chat-name">{chat.name}</span>
                <span className="chat-time">{formatDate(chat.time)}</span>
              </div>
              <div className="chat-header-row">
                <span className="chat-preview">{chat.lastMessage}</span>
                {chat.unread && chat.unread > 0 && (
                  <span className="unread-count">{chat.unread}</span>
                )}
              </div>
            </div>

            {/* Action Buttons (hover only) */}
            {selectedChat === chat.id && (
              <div className="chat-actions">
                <button
                  className="delete-chat-button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteChat(chat.id)
                  }}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.2s'
                  }}
                  title="删除聊天"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Add Friend Modal */}
      {isAddFriendModalOpen && activePanel === 'chat' && (
        <AddFriendModal onClose={handleCloseAddFriendModal} onAddFriend={handleAddFriend} />
      )}

      {/* Add Group Modal */}
      {isAddGroupModalOpen && activePanel === 'groups' && (
        <AddGroupModal
          onClose={handleCloseAddGroupModal}
          onAddGroup={handleAddGroup}
          visible={true}
          allUsers={mockUsers}
          currentUserId="user1" // Mock current user ID
        />
      )}
      <style>{`
        .chat-item {
          position: relative;
        }

        .chat-item:hover .chat-actions {
          opacity: 1;
        }

        .chat-actions {
          position: absolute;
          right: 12;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          gap: 8px;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .chat-item:hover .delete-chat-button {
          opacity: 1;
        }

        .chat-item:hover .delete-chat-button:hover {
          color: #ef4444;
          background-color: rgba(239, 68, 68, 0.1);
          border-radius: 50%;
          width: 28px;
          height: 28px;
        }

        .chat-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .online-indicator {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }
      `}</style>

      {/* Context Menu */}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          chatId={contextMenu.chatId}
          chatName={contextMenu.chatName}
          onMarkAsRead={onMarkAsRead || (() => {})}
          onClearChat={onClearChat || (() => {})}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}

export default ChatList
