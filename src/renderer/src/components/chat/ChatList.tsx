import React from 'react'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import GroupAvatar from '@renderer/components/groups/GroupAvatar'
import AddGroupModal from '@renderer/components/groups/AddGroupModal'
import ContextMenu from './ContextMenu'
import { chatService } from '@renderer/services/chat.service'
import { secureStorageService } from '@renderer/services/secure-storage.service'
import { userService } from '@renderer/services/user.service'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'

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

interface ChatListProps {
  chats: Chat[]
  activePanel: 'chat' | 'groups'
  selectedChat: string | null
  onChatSelect: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
  onMarkAsRead?: (chatId: string) => void
  onClearChat?: (chatId: string) => void
  onRefresh?: (newRoomId?: string) => void
}

const normalizeSearchText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, '')

const isFuzzyMatch = (source: string, keyword: string): boolean => {
  if (!keyword) return true
  const normalizedSource = normalizeSearchText(source)
  if (normalizedSource.includes(keyword)) return true

  let keywordIndex = 0
  for (const char of normalizedSource) {
    if (char === keyword[keywordIndex]) {
      keywordIndex += 1
      if (keywordIndex === keyword.length) return true
    }
  }
  return false
}

const matchesChatKeyword = (chat: Chat, keyword: string): boolean => {
  if (!keyword) return true
  return [chat.name, chat.lastMessage, chat.time, chat.id].some((field) =>
    isFuzzyMatch(field || '', keyword)
  )
}

const ChatList: React.FC<ChatListProps> = ({
  chats,
  activePanel,
  selectedChat,
  onChatSelect,
  onDeleteChat,
  onMarkAsRead,
  onClearChat,
  onRefresh
}) => {
  const [isAddGroupModalOpen, setIsAddGroupModalOpen] = React.useState(false)
  const [searchText, setSearchText] = React.useState('')
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
  const [availableUsers, setAvailableUsers] = React.useState<
    { id: string; name: string; avatar: string; isOnline: boolean }[]
  >([])
  const [currentUserId, setCurrentUserId] = React.useState<string>('')

  const searchKeyword = React.useMemo(() => normalizeSearchText(searchText), [searchText])
  const filteredChats = React.useMemo(
    () => chats.filter((chat) => matchesChatKeyword(chat, searchKeyword)),
    [chats, searchKeyword]
  )

  const openAddGroupModal = async (): Promise<void> => {
    const me = await secureStorageService.getUserInfo()
    setCurrentUserId(me?.id ?? '')
    const res = await userService.getFriends()
    if (res.result && res.data) {
      const users = await Promise.all(
        res.data.map(async (u) => ({
          id: u.id,
          name: u.nickname || u.username,
          avatar: await resolveAvatarUrl(u.avatar || u.avatarUrl),
          isOnline: false
        }))
      )
      setAvailableUsers(users)
    } else {
      setAvailableUsers([])
      console.warn('[ChatList] 加载好友列表失败:', res.message)
    }
    setIsAddGroupModalOpen(true)
  }

  const formatDate = (time: string): string => {
    if (!time) return ''
    const dt = new Date(time)
    // 无法解析时（已是展示串，如 "昨天"）原样返回
    if (isNaN(dt.getTime())) return time

    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')

    // 今天：仅显示时分
    if (dt.toDateString() === now.toDateString()) {
      return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
    }
    // 昨天
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (dt.toDateString() === yesterday.toDateString()) return '昨天'
    // 同年：月日
    if (dt.getFullYear() === now.getFullYear()) {
      return `${dt.getMonth() + 1}月${dt.getDate()}日`
    }
    return `${dt.getFullYear()}/${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}`
  }

  const handleContextMenu = (e: React.MouseEvent, chat: Chat): void => {
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

  const closeContextMenu = (): void => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      chatId: '',
      chatName: ''
    })
  }

  const getUnreadCount = (unread?: number): number => {
    return typeof unread === 'number' && unread > 0 ? unread : 0
  }

  const handleAddGroup = async (
    selectedUsers: { id: string; name: string; avatar: string; isOnline: boolean }[],
    groupName: string,
    groupDescription?: string
  ): Promise<void> => {
    const res = await chatService.createGroupRoom({
      name: groupName,
      description: groupDescription?.trim() || undefined,
      memberIds: selectedUsers.map((u) => u.id)
    })
    if (res.result && res.data) {
      onRefresh?.(res.data.id)
    } else {
      console.warn('[ChatList] 创建群聊失败:', res.message)
      alert(res.message || '创建群聊失败')
    }
  }

  return (
    <div className="center-panel-inner">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <h2>消息</h2>
        {activePanel === 'groups' && (
          <button
            className="chat-list-create-button"
            onClick={() => {
              void openAddGroupModal()
            }}
            title="创建群聊"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5zm5-4v2h-2v2h-2v-2h-2V9h2V7h2v2h2z" />
            </svg>
          </button>
        )}
      </div>

      {/* Search Box */}
      <div className="search-box">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          type="text"
          className="search-input"
          placeholder={activePanel === 'groups' ? '搜索群聊' : '搜索聊天'}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      {/* Chat List */}
      <div className="chat-list">
        {filteredChats.length === 0 ? (
          <div className="chat-list-empty">
            {searchKeyword
              ? '未找到匹配的聊天'
              : activePanel === 'groups'
                ? '暂无群聊'
                : '暂无聊天'}
          </div>
        ) : (
          filteredChats.map((chat) => {
            const displayTime = formatDate(chat.time)
            const unreadCount = getUnreadCount(chat.unread)

            return (
              <div
                key={chat.id}
                className={`chat-item ${selectedChat === chat.id ? 'active' : ''}`}
                onClick={() => onChatSelect(chat.id)}
                onContextMenu={(e) => handleContextMenu(e, chat)}
              >
                {/* Avatar */}
                <div className={`chat-avatar ${chat.type === 'group' ? 'is-group' : ''}`}>
                  {chat.type === 'group' ? (
                    <GroupAvatar memberCount={chat.memberCount} />
                  ) : (
                    <img
                      src={chat.avatar || FriendAvatar}
                      alt={chat.name}
                      onError={(e) => {
                        e.currentTarget.src = FriendAvatar
                      }}
                    />
                  )}
                  {chat.isOnline && chat.type !== 'group' && (
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
                    {displayTime && <span className="chat-time">{displayTime}</span>}
                  </div>
                  <div className="chat-header-row">
                    <span className="chat-preview">{chat.lastMessage}</span>
                    {unreadCount > 0 && <span className="unread-count">{unreadCount}</span>}
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
            )
          })
        )}
      </div>
      {isAddGroupModalOpen && activePanel === 'groups' && (
        <AddGroupModal
          visible={true}
          onClose={() => setIsAddGroupModalOpen(false)}
          onAddGroup={handleAddGroup}
          allUsers={availableUsers}
          currentUserId={currentUserId}
        />
      )}
      <style>{`
        .chat-item {
          position: relative;
        }

        .chat-list-create-button {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background-color: rgba(99, 102, 241, 0.15);
          color: var(--gradient-purple-start);
          cursor: pointer;
          transition:
            background-color 0.2s ease,
            color 0.2s ease;
        }

        .chat-list-create-button:hover {
          background-color: var(--gradient-purple-start);
          color: white;
        }

        .chat-item .chat-avatar.is-group {
          border-radius: 8px;
          background-color: #9db2ce;
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

        .chat-list-empty {
          padding: 32px 20px;
          color: #8b8b95;
          font-size: 14px;
          text-align: center;
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
