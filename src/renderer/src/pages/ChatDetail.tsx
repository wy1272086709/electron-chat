import React, { useState, useRef, useEffect } from 'react'
import EmojiPicker from '../components/EmojiPicker'
import FilePicker from '../components/FilePicker'
import GroupAvatar from '../components/GroupAvatar'

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
  content: string
  time: string
  sender: 'me' | 'other'
  senderName?: string
}

interface ChatDetailProps {
  chat: Chat | undefined
  messages: Message[]
  onBack?: () => void
  isMobile?: boolean
  onCleared?: boolean
}

const ChatDetail: React.FC<ChatDetailProps> = ({
  chat,
  messages,
  onBack,
  isMobile = false,
  onCleared
}) => {
  const [newMessage, setNewMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, onCleared])

  const handleSendMessage = () => {
    if (newMessage.trim() && chat) {
      // In a real app, this would send to a backend
      console.log('Sending message:', newMessage)
      setNewMessage('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
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

  if (!chat) {
    return null
  }

  const isGroup = chat.type === 'group'

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

        <div className="chat-header-info">
          <div className="chat-avatar" style={isGroup ? { borderRadius: 8 } : undefined}>
            {isGroup ? (
              <GroupAvatar memberCount={chat.memberCount} />
            ) : (
              <img
                src={chat.avatar}
                alt={chat.name}
                onError={(e) => {
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.name)}&background=6366f1&color=fff&size=40`
                }}
              />
            )}
            {!isGroup && chat.isOnline && (
              <div
                className="online-indicator"
                style={{
                  position: 'absolute',
                  bottom: 1,
                  right: 1,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  border: '2px solid #22222b'
                }}
              />
            )}
          </div>
          <div>
            <div className="chat-header-name">
              {chat.name}
              {isGroup && chat.memberCount ? ` (${chat.memberCount})` : ''}
            </div>
            <div className="chat-status">
              {isGroup ? `${chat.memberCount ?? 0} 名成员` : chat.isOnline ? '在线' : '离线'}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.map((message) => {
          const senderName = message.senderName || (isGroup ? '群成员' : chat.name)
          return (
            <div
              key={message.id}
              className={`message ${message.sender === 'me' ? 'sent' : 'received'}`}
            >
              {message.sender === 'other' && (
                <div className="message-avatar">
                  <img
                    src={
                      isGroup
                        ? `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=6366f1&color=fff&size=36`
                        : chat.avatar
                    }
                    alt={senderName}
                    onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=6366f1&color=fff&size=36`
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
      `}</style>
    </div>
  )
}

export default ChatDetail
