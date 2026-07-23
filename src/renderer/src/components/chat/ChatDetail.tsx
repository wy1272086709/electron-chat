import React, { useState, useRef, useEffect } from 'react'
import EmojiPicker from '@renderer/components/chat/EmojiPicker'
import MessageMedia from '@renderer/components/chat/MessageMedia'
import MediaPreviewModal from '@renderer/components/chat/MediaPreviewModal'
import GroupAvatar from '@renderer/components/groups/GroupAvatar'
import MessageContextMenu, {
  type MessageMenuItem
} from '@renderer/components/chat/MessageContextMenu'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import type { LayoutMessage } from '@renderer/types/layout.types'
import { resolveMediaUrl } from '@renderer/utils/media-url'
import { isImageFile } from '@renderer/utils/file-meta'
import { favoriteService } from '@renderer/services/favorite.service'
import FriendProfileModal from '@renderer/components/contacts/FriendProfileModal'
import GroupProfileModal from '@renderer/components/groups/GroupProfileModal'
import ChatAiPanel from '@renderer/components/chat/ChatAiPanel'
import { ExclamationCircleFilled, RobotOutlined } from '@ant-design/icons'
import type { ChatAiMode } from '@renderer/types/chat-ai.types'
import { MODERATED_MESSAGE_PLACEHOLDER } from '@renderer/context/layoutContext.helpers'

interface Chat {
  id: string
  name: string
  avatar: string
  lastMessage: string
  time: string
  unread?: number
  isOnline?: boolean
  lastSeenAt?: string
  type: 'chat' | 'group'
  memberCount?: number
  onlineCount?: number
  /** 私聊对方的用户 ID；发送私聊消息时作为 receiverId（群聊为 undefined） */
  peerUserId?: string
}

// 直接复用 LayoutMessage：消息来自 LayoutContext，已含 chatId / 媒体字段。
// 保留别名 Message 以减少组件内对消息类型的散落引用。
type Message = LayoutMessage

const formatLastSeen = (iso?: string): string => {
  if (!iso) return '离线'
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return '离线'
  const diff = Date.now() - time
  if (diff < 60 * 1000) return '刚刚在线'
  const minutes = Math.floor(diff / (60 * 1000))
  if (minutes < 60) return `${minutes}分钟前在线`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前在线`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前在线`
  return '离线'
}

interface ChatDetailProps {
  chat: Chat | undefined
  messages: Message[]
  onBack?: () => void
  isMobile?: boolean
  onCleared?: boolean
  /** 发送消息回调（父组件负责乐观上屏 + ack 状态机，子组件不再直接操作 socket） */
  onSendMessage?: (content: string) => void
  /** 发送图片 / 文件回调（父组件负责上传 + 乐观上屏 + ack） */
  onSendAttachment?: (file: File, caption?: string) => void
  /** 重发失败消息 */
  onRetrySend?: (messageId: string) => void
}

const ChatDetail: React.FC<ChatDetailProps> = ({
  chat,
  messages,
  onBack,
  isMobile = false,
  onCleared,
  onSendMessage,
  onSendAttachment,
  onRetrySend
}) => {
  const [newMessage, setNewMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  // 发送前图片预览（含可选备注）
  const [imagePreview, setImagePreview] = useState<{ file: File } | null>(null)
  // 放大查看图片
  const [lightbox, setLightbox] = useState<{ src: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isGroup = chat?.type === 'group'
  const isPeerOnline = !isGroup && !!chat?.isOnline
  const groupMemberCount = chat?.memberCount ?? 0
  const headerStatus = isGroup
    ? typeof chat?.onlineCount === 'number'
      ? `${chat.onlineCount} 人在线 / ${groupMemberCount} 名成员`
      : `${groupMemberCount} 名成员`
    : isPeerOnline
      ? '在线'
      : formatLastSeen(chat?.lastSeenAt)

  // 单条消息右键菜单：记录触发位置与目标消息
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(
    null
  )
  // 已收藏的消息 ID 集合（用于菜单文案 / 图标的即时切换）
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set())
  // 复制 / 收藏等操作的轻提示
  const [feedback, setFeedback] = useState<string | null>(null)
  // 好友资料弹窗：私聊顶部点击头像/昵称打开
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  // 群聊信息弹窗：群聊顶部点击头像/昵称或「更多」按钮打开
  const [showGroupProfile, setShowGroupProfile] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiMode, setAiMode] = useState<ChatAiMode>('summary')

  const scrollToBottom: () => void = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, onCleared])

  // 初始加载已收藏的消息 ID，用于右键菜单即时切换「收藏 / 取消收藏」
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
    if (!content || !chat) return
    // 发送（含乐观上屏 + ack 状态机）下沉到 LayoutProvider：子组件不再直接操作 socket，
    // 只负责把文本交给回调。群/私聊的区分由 LayoutProvider 依据当前会话类型处理。
    onSendMessage?.(content)
    setNewMessage('')
    setShowEmojiPicker(false)
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

  const handleUseAiSuggestion = (suggestion: string): void => {
    setNewMessage(suggestion)
    setShowAiPanel(false)
    showToast('回复建议已填入输入框')
  }

  // 选图：弹预览（带备注）；文件直接发送。重置 value 以便重复选同一文件。
  const handleImagePicked = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件')
      return
    }
    setImagePreview({ file })
  }

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    files.forEach((f) => onSendAttachment?.(f))
  }

  const handleSendImagePreview = (caption: string): void => {
    if (!imagePreview?.file) return
    onSendAttachment?.(imagePreview.file, caption)
    setImagePreview(null)
  }

  // 粘贴图片：在输入框粘贴截图时，拦截并进入图片预览
  const handlePaste = (e: React.ClipboardEvent): void => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          setImagePreview({ file })
          e.preventDefault()
          return
        }
      }
    }
  }

  // 拖拽：单张图片进预览，其余（多图 / 文件）直接发送
  const handleDrop = (e: React.DragEvent): void => {
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length === 0) return
    e.preventDefault()
    if (files.length === 1 && files[0].type.startsWith('image/')) {
      setImagePreview({ file: files[0] })
      return
    }
    files.forEach((f) => onSendAttachment?.(f))
  }

  // 另存为：解析对象存储预签名 GET，交主进程下载到本地下载目录
  const handleSaveImage = async (message: Message): Promise<void> => {
    const objectName = message.attachment?.objectName
    if (!objectName) return
    const previewUrl = await resolveMediaUrl(objectName)
    if (!previewUrl) {
      showToast('图片加载失败')
      return
    }
    const res = await window.electronAPI.downloadFile({
      previewUrl,
      fileName: message.attachment?.fileName || `image-${message.id}`
    })
    showToast(res.result ? '已保存到下载目录' : res.message || '保存失败')
  }

  // 复制图片：解析预签名 URL 后交主进程写入系统剪贴板（绕过渲染层 CORS），
  // 之后在输入框粘贴即可被 handlePaste 识别为图片文件进入预览。
  const handleCopyImage = async (message: Message): Promise<void> => {
    const objectName = message.attachment?.objectName
    if (!objectName) {
      showToast('图片暂不可复制')
      return
    }
    try {
      const previewUrl = await resolveMediaUrl(objectName)
      if (!previewUrl) {
        showToast('图片加载失败')
        return
      }
      const res = await window.electronAPI.copyImageToClipboard({ url: previewUrl })
      showToast(res.result ? '图片已复制，可粘贴到输入框' : res.message || '复制失败')
    } catch (error) {
      console.warn('[ChatDetail] 复制图片失败:', error)
      showToast('复制失败')
    }
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
    if (message.messageType === 'IMAGE') {
      void handleCopyImage(message)
      return
    }
    copyText(message.content).then((ok) => showToast(ok ? '已复制' : '复制失败'))
  }

  const handleToggleFavorite = async (message: Message): Promise<void> => {
    const senderName = message.senderName || (isGroup ? '群成员' : chat?.name) || '消息'
    const favoriteType =
      message.messageType === 'IMAGE' ? 'image' : message.messageType === 'FILE' ? 'file' : 'text'
    const favoriteTitle =
      message.attachment?.fileName ||
      (message.messageType === 'IMAGE' ? '图片' : message.content || senderName)
    try {
      if (favoritedIds.has(message.id)) {
        const res = await favoriteService.removeByMessage(message.id)
        if (!res.result) {
          showToast(res.message || '取消收藏失败')
          return
        }
        setFavoritedIds((prev) => {
          const next = new Set(prev)
          next.delete(message.id)
          return next
        })
        showToast('已取消收藏')
      } else {
        const res = await favoriteService.add({
          type: favoriteType,
          messageId: message.id,
          title: favoriteTitle,
          content: message.content,
          source: chat?.name || senderName,
          time: message.time,
          chatId: chat?.id,
          fileName: message.attachment?.fileName,
          fileSize:
            typeof message.attachment?.fileSize === 'number'
              ? String(message.attachment.fileSize)
              : undefined,
          fileExt: message.attachment?.fileType,
          thumbnail: message.attachment?.objectName
        })
        if (!res.result) {
          showToast(res.message || '收藏失败')
          return
        }
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
    const items: MessageMenuItem[] = [
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
    // 图片消息的统一「复制」入口已复制图片，这里只额外提供「另存为」
    if (message.messageType === 'IMAGE' && message.attachment?.objectName) {
      items.push({
        key: 'save',
        label: '另存为',
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        ),
        onClick: () => void handleSaveImage(message)
      })
    }
    return items
  }

  const handleMessageContextMenu = (e: React.MouseEvent, message: Message): void => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, message })
  }

  const handleRetryClick = (message: Message): void => {
    if (message.errorMessage) {
      showToast(message.errorMessage)
    }
    onRetrySend?.(message.id)
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

        <div
          className="chat-header-profile"
          onClick={() => {
            if (isGroup) setShowGroupProfile(true)
            else if (chat?.peerUserId) setProfileUserId(chat.peerUserId)
          }}
          style={{ cursor: isGroup || chat?.peerUserId ? 'pointer' : 'default' }}
          title={isGroup ? '查看群聊信息' : chat?.peerUserId ? '查看好友资料' : undefined}
        >
          <div className={`chat-header-avatar ${isGroup ? 'is-group' : ''}`}>
            {isGroup ? (
              <GroupAvatar memberCount={chat.memberCount} />
            ) : (
              <img src={chat.avatar || FriendAvatar} alt={chat.name} />
            )}
            {isPeerOnline && <div className="chat-header-online-dot" />}
          </div>
          <div className="chat-header-text">
            <div className="chat-header-name">
              {chat.name}
              {isGroup && chat.memberCount ? ` (${chat.memberCount})` : ''}
            </div>
            <div className={`chat-status ${isPeerOnline ? 'is-online' : ''}`}>{headerStatus}</div>
          </div>
        </div>

        <div className="chat-header-actions">
          <button
            className="chat-action-button"
            title={isGroup ? '查看群聊信息' : '查看好友资料'}
            onClick={() => {
              if (isGroup) setShowGroupProfile(true)
              else if (chat?.peerUserId) setProfileUserId(chat.peerUserId)
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
            </svg>
          </button>
        </div>
      </div>

      {profileUserId && (
        <FriendProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}

      {isGroup && showGroupProfile && chat && (
        <GroupProfileModal
          roomId={chat.id}
          groupName={chat.name}
          memberCount={chat.memberCount}
          onlineCount={chat.onlineCount}
          onClose={() => setShowGroupProfile(false)}
          onLeft={() => setShowGroupProfile(false)}
        />
      )}

      {/* Messages */}
      <div
        className="messages-container"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {messages.map((message) => {
          const senderName = message.senderName || (isGroup ? '群成员' : chat.name)
          const messageAvatar =
            message.senderAvatar || (!isGroup ? chat.avatar : '') || FriendAvatar
          const hasMedia = Boolean(message.attachment)
          const mediaLooksLikeImage =
            message.messageType === 'IMAGE' ||
            isImageFile(message.attachment?.fileName, message.attachment?.fileType)
          const mediaClass = hasMedia
            ? `has-media ${mediaLooksLikeImage ? 'is-image' : 'is-file'}`
            : ''
          const isModerated = message.content === MODERATED_MESSAGE_PLACEHOLDER
          return (
            <div
              key={message.id}
              className={`message ${message.sender === 'me' ? 'sent' : 'received'} ${mediaClass}`}
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
              {message.sender === 'other' && isModerated && (
                <span className="message-moderation-warning" title="敏感内容" aria-label="敏感内容">
                  <ExclamationCircleFilled />
                </span>
              )}
              <div className="message-body">
                {isGroup && message.sender === 'other' && (
                  <div className="message-sender">{senderName}</div>
                )}
                <div className={`message-content ${mediaClass}`}>
                  {hasMedia ? (
                    <>
                      <MessageMedia
                        message={message}
                        onPreviewImage={(src) => setLightbox({ src })}
                      />
                      {message.content && (
                        <div className="message-media-caption">{message.content}</div>
                      )}
                    </>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
              {message.sender === 'me' && isModerated && (
                <span className="message-moderation-warning" title="敏感内容" aria-label="敏感内容">
                  <ExclamationCircleFilled />
                </span>
              )}
              {message.sender === 'me' &&
                (message.status === 'pending' ||
                  message.status === 'sending' ||
                  message.status === 'uploading') && (
                  <span
                    className="message-status is-sending"
                    aria-label={
                      message.status === 'uploading'
                        ? '上传中'
                        : message.status === 'pending'
                          ? '等待发送'
                          : '发送中'
                    }
                    title={
                      message.status === 'uploading'
                        ? '上传中'
                        : message.status === 'pending'
                          ? '等待发送'
                          : '发送中'
                    }
                  />
                )}
              {message.sender === 'me' && message.status === 'failed' && (
                <button
                  type="button"
                  className="message-status is-failed"
                  title={message.errorMessage || '发送失败，点击重试'}
                  onClick={() => handleRetryClick(message)}
                >
                  !
                </button>
              )}
              <div className="message-time">{message.time}</div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {showAiPanel && (
        <ChatAiPanel
          roomId={chat.id}
          draft={newMessage}
          mode={aiMode}
          onModeChange={setAiMode}
          onUseSuggestion={handleUseAiSuggestion}
          onClose={() => setShowAiPanel(false)}
          onFeedback={showToast}
        />
      )}

      {/* Message Input */}
      <div className="message-input-container">
        <button
          type="button"
          className={`input-action-button ai-action-button ${showAiPanel ? 'active' : ''}`}
          title="AI 聊天助手"
          aria-pressed={showAiPanel}
          onClick={() => setShowAiPanel((visible) => !visible)}
        >
          <RobotOutlined />
        </button>
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
          title="发送图片"
          onClick={() => imageInputRef.current?.click()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
          </svg>
        </button>
        <button
          className="input-action-button"
          title="发送文件"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
          </svg>
        </button>
        <textarea
          className="message-input"
          placeholder="输入消息...（可粘贴图片、拖入文件）"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          onPaste={handlePaste}
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

      {/* 隐藏的文件选择 input：图片走预览，文件直接发送 */}
      <input type="file" accept="image/*" hidden ref={imageInputRef} onChange={handleImagePicked} />
      <input type="file" hidden ref={fileInputRef} onChange={handleFilePicked} multiple />

      {/* 发送前图片预览（含可选备注） */}
      {imagePreview && (
        <MediaPreviewModal
          mode="send"
          file={imagePreview.file}
          onSend={handleSendImagePreview}
          onClose={() => setImagePreview(null)}
        />
      )}

      {/* 放大查看图片 */}
      {lightbox && (
        <MediaPreviewModal mode="view" src={lightbox.src} onClose={() => setLightbox(null)} />
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

        .message-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          align-self: flex-end;
          margin-bottom: 4px;
          margin-right: 4px;
          flex-shrink: 0;
        }

        .message-moderation-warning {
          display: inline-flex;
          align-items: center;
          align-self: center;
          margin: 0 8px;
          color: #f59e0b;
          font-size: 18px;
          line-height: 1;
          flex-shrink: 0;
        }

        .message-status.is-sending {
          width: 14px;
          height: 14px;
          border: 2px solid #6b7280;
          border-top-color: transparent;
          border-radius: 50%;
          animation: message-status-spin 0.8s linear infinite;
        }

        .message-status.is-failed {
          width: 18px;
          height: 18px;
          padding: 0;
          border: none;
          border-radius: 50%;
          background: #ef4444;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          cursor: pointer;
        }

        .message-status.is-failed:hover {
          background: #dc2626;
        }

        @keyframes message-status-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .chat-header-profile {
          display: flex;
        }
        .chat-header-text {
          margin-left: 10px;
        }
        .chat-header-avatar {
          max-height: 44px;
          width: auto;
          img {
            max-height: 44px;
            border-radius: 5px;
          }
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
