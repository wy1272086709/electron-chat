import React, { useState, useRef, useEffect, useContext } from 'react'
import EmojiPicker from '@renderer/components/chat/EmojiPicker'
import FilePicker from '@renderer/components/chat/FilePicker'
import GroupAvatar from '@renderer/components/groups/GroupAvatar'
import MessageContextMenu, {
  type MessageMenuItem
} from '@renderer/components/chat/MessageContextMenu'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import { SocketContext } from '@renderer/context'
import { favoriteService } from '@renderer/services/favorite.service'

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
  /** 私聊对方的用户 ID；发送私聊消息时作为 receiverId（群聊为 undefined） */
  peerUserId?: string
}

interface Message {
  id: string
  content: string
  time: string
  sender: 'me' | 'other'
  senderName?: string
  senderAvatar?: string
}

interface ChatDetailProps {
  chat: Chat | undefined
  messages: Message[]
  onBack?: () => void
  isMobile?: boolean
  onCleared?: boolean
  /** 发送消息时回调（父组件乐观插入，让消息立即上屏） */
  onSendMessage?: (content: string) => void
}

const ChatDetail: React.FC<ChatDetailProps> = ({
  chat,
  messages,
  onBack,
  isMobile = false,
  onCleared,
  onSendMessage
}) => {
  const [newMessage, setNewMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isGroup = chat?.type === 'group'
  const headerStatus = isGroup ? `${chat.memberCount ?? 0} 名成员` : '在线'
  const { socket } = useContext(SocketContext)

  // 单条消息右键菜单：记录触发位置与目标消息
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(
    null
  )
  // 已收藏的消息 ID 集合（用于菜单文案 / 图标的即时切换）
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set())
  // 复制 / 收藏等操作的轻提示
  const [feedback, setFeedback] = useState<string | null>(null)

  const scrollToBottom: () => void = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, onCleared])

  // 初始加载本地已收藏的消息 ID（收藏接口暂未提供，先读 localStorage）
  useEffect(() => {
    let active = true
    favoriteService.list().then((res) => {
      if (!active || !res.data) return
      const ids = res.data.map((f) => f.messageId).filter((v): v is string => Boolean(v))
      setFavoritedIds(new Set(ids))
    })
    return () => {
      active = false
    }
  }, [])

  // 轻提示自动消失：feedback 变化即重置定时器，卸载 / 覆盖时由清理函数收尾
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 1500)
    return () => clearTimeout(timer)
  }, [feedback])

  const handleSendMessage: () => void = () => {
    const content = newMessage.trim()
    if (!content || !chat || !socket) return
    // 群聊走 message:sendRoom；私聊走 message:sendPrivate（receiverId 为对方 userId）
    if (isGroup) {
      socket.emit('message:sendRoom', { roomId: chat.id, content, messageType: 'TEXT' })
    } else {
      if (!chat.peerUserId) {
        console.warn('[ChatDetail] 缺少对方 userId，无法发送私聊消息')
        return
      }
      socket.emit('message:sendPrivate', {
        receiverId: chat.peerUserId,
        content,
        messageType: 'TEXT'
      })
    }
    // 乐观上屏：服务端通常不把 message:new 回推给发送者本人，
    // 这里先本地插入，等对方消息或本人回执到达时由 LayoutProvider 去重替换
    onSendMessage?.(content)
    setNewMessage('')
    setShowEmojiPicker(false)
    setShowFilePicker(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleEmojiSelect = (emoji: string): void => {
    setNewMessage((prev) => prev + emoji)
    setShowEmojiPicker(false)
  }

  const handleFileSelect = (filePath: string): void => {
    // 在实际应用中，这里应该处理文件上传
    const fileName = filePath.split('/').pop()
    setNewMessage((prev) => prev + `[文件: ${fileName}]`)
    setShowFilePicker(false)
  }

  // 操作反馈轻提示（复制 / 收藏等）：覆盖式显示，由上方 effect 在 1.5s 后自动清除
  const showToast = (text: string): void => {
    setFeedback(text)
  }

  // 复制文本：优先用 Clipboard API，非安全上下文下回退到 execCommand 兜底
  const copyText = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // 忽略，走兜底方案
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }

  const handleCopyMessage = (message: Message): void => {
    copyText(message.content).then((ok) => showToast(ok ? '已复制' : '复制失败'))
  }

  const handleToggleFavorite = async (message: Message): Promise<void> => {
    const senderName = message.senderName || (isGroup ? '群成员' : chat?.name) || '消息'
    try {
      if (favoritedIds.has(message.id)) {
        await favoriteService.removeByMessage(message.id)
        setFavoritedIds((prev) => {
          const next = new Set(prev)
          next.delete(message.id)
          return next
        })
        showToast('已取消收藏')
      } else {
        // TODO: 收藏接口暂未提供，先写入本地（favorite.service 基于 localStorage）。
        //   接口就绪后直接替换 favorite.service 内部实现即可；
        //   与 Favorites 面板的打通（列表改由本服务读取）作为后续步骤。
        await favoriteService.add({
          type: 'message',
          messageId: message.id,
          title: senderName,
          content: message.content,
          time: message.time,
          chatId: chat?.id
        })
        setFavoritedIds((prev) => new Set(prev).add(message.id))
        showToast('已收藏')
      }
    } catch {
      showToast('操作失败，请重试')
    }
  }

  // 组装单条消息的右键菜单项（根据是否已收藏切换文案 / 图标）
  const buildMessageMenuItems = (message: Message): MessageMenuItem[] => {
    const favorited = favoritedIds.has(message.id)
    return [
      {
        key: 'copy',
        label: '复制',
        icon: (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        ),
        onClick: () => handleCopyMessage(message)
      },
      {
        key: 'favorite',
        label: favorited ? '取消收藏' : '收藏',
        icon: (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={favorited ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ),
        onClick: () => handleToggleFavorite(message)
      }
    ]
  }

  const handleMessageContextMenu = (e: React.MouseEvent, message: Message): void => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, message })
  }

  if (!chat) {
    return null
  }

  return (
    <div className="chat-detail">
      {/* Chat Header */}
      <div className="chat-header">
        {isMobile && (
          <button className="chat-back-button" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
        )}

        <div className="chat-header-profile">
          <div className={`chat-header-avatar ${isGroup ? 'is-group' : ''}`}>
            {isGroup ? (
              <GroupAvatar memberCount={chat.memberCount} />
            ) : (
              <img src={chat.avatar || FriendAvatar} alt={chat.name} />
            )}
            {!isGroup && <div className="chat-header-online-dot" />}
          </div>
          <div className="chat-header-text">
            <div className="chat-header-name">
              {chat.name}
              {isGroup && chat.memberCount ? ` (${chat.memberCount})` : ''}
            </div>
            <div className={`chat-status ${!isGroup ? 'is-online' : ''}`}>{headerStatus}</div>
          </div>
        </div>

        <div className="chat-header-actions">
          <button className="chat-action-button" title="更多">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.map((message) => {
          const senderName = message.senderName || (isGroup ? '群成员' : chat.name)
          const messageAvatar =
            message.senderAvatar || (!isGroup ? chat.avatar : '') || FriendAvatar
          return (
            <div
              key={message.id}
              className={`message ${message.sender === 'me' ? 'sent' : 'received'}`}
              onContextMenu={(e) => handleMessageContextMenu(e, message)}
            >
              {message.sender === 'other' && (
                <div className="message-avatar">
                  <img
                    src={messageAvatar}
                    alt={senderName}
                    onError={(e) => {
                      e.currentTarget.src = FriendAvatar
                    }}
                  />
                </div>
              )}
              <div className="message-body">
                {isGroup && message.sender === 'other' && (
                  <div className="message-sender">{senderName}</div>
                )}
                <div className="message-content">{message.content}</div>
              </div>
              <div className="message-time">{message.time}</div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="message-input-container">
        <button
          className="input-action-button"
          title="表情"
          onClick={() => setShowEmojiPicker(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
          </svg>
        </button>
        <button
          className="input-action-button"
          title="文件"
          onClick={() => setShowFilePicker(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
          </svg>
        </button>
        <textarea
          className="message-input"
          placeholder="输入消息..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          rows={1}
        />
        <button className="send-button" onClick={handleSendMessage} disabled={!newMessage.trim()}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      {/* 表情选择器 */}
      {showEmojiPicker && (
        <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
      )}

      {/* 文件选择器 */}
      {showFilePicker && (
        <FilePicker onSelect={handleFileSelect} onClose={() => setShowFilePicker(false)} />
      )}

      {/* 单条消息右键菜单（复制 / 收藏） */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMessageMenuItems(contextMenu.message)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 操作反馈轻提示 */}
      {feedback && <div className="message-feedback-toast">{feedback}</div>}

      <style>{`
        .chat-detail-empty {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
        }

        .empty-content {
          text-align: center;
        }

        .empty-content p {
          margin-top: 16px;
          font-size: 16px;
        }

        .chat-status {
          font-size: 12px;
          color: #666;
        }

        .chat-status.is-online {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #fff;
        }

        .chat-status.is-online::before {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #4cd2c0;
        }

        .message-body {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .message.received .message-body {
          align-items: flex-start;
        }

        .message.sent .message-body {
          align-items: flex-end;
        }

        .message-sender {
          font-size: 12px;
          color: #999;
          margin: 0 8px 4px;
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

        textarea {
          resize: none;
          overflow: hidden;
          max-height: 100px;
        }

        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .chat-header-profile {
          display: flex;
        }
        .chat-header-text {
          margin-left: 10px;
        }
        .chat-header-avatar {
          width: 44px;
          height: 44px;
        }
        .message-input-container {
          position: absolute;
          bottom: 0;
          width: calc(100% - 360px);
        }

        .message-feedback-toast {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.75);
          color: #fff;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          z-index: 1100;
          pointer-events: none;
          animation: message-feedback-fade 0.2s ease;
        }

        @keyframes message-feedback-fade {
          from {
            opacity: 0;
            transform: translate(-50%, -8px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </div>
  )
}

export default ChatDetail
