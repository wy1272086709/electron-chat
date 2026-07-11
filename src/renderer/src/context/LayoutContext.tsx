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
import FavoriteImageSample from '@renderer/assets/favorite-image-sample.svg'
import { chatService } from '@renderer/services/chat.service'
import { notificationService } from '@renderer/services/notification.service'
import { secureStorageService } from '@renderer/services/secure-storage.service'
import type { ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type { AppNotification, FriendRequestAction } from '@renderer/types/notification.types'
import type {
  AppPanel,
  Favorite,
  LayoutChat,
  LayoutMessage,
  LayoutMessageType,
  MessageAttachment,
  MessageDeliveryStatus
} from '@renderer/types/layout.types'
import { uploadMedia } from '@renderer/services/upload.service'
import { isImageFile } from '@renderer/utils/file-meta'
import {
  buildLastMessagePreview,
  formatHM,
  getPrivateRoomId,
  mapConversation,
  mapPrivateRoomFallback,
  mapServerMessage,
  mergeConversationList,
  resolveChatAvatar
} from './layoutContext.helpers'
import type {
  ChatContextValue,
  FavoritesContextValue,
  LayoutContextValue,
  NavigationContextValue,
  NotificationsContextValue,
  StartChatFriendSnapshot
} from './layoutContext.types'

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

/** 等待服务端 ack 的超时时间（ms）；超时未回执则把消息标记为 failed，提示用户重发 */
const SEND_ACK_TIMEOUT_MS = 8000

/** socket.emit 回执（ack）的载荷形态，对齐后端 DataResult */
type SendAckResponse = { result?: boolean; data?: unknown; message?: string }

/** 发送到服务端的载荷（对齐 SendRoomMessageDto / SendPrivateMessageDto 的媒体字段） */
interface SendPayload {
  content?: string
  messageType: LayoutMessageType
  fileUrl?: string
  fileName?: string
  fileSize?: number
  fileType?: string
  mediaWidth?: number
  mediaHeight?: number
  thumbnailUrl?: string
}

/** 把附件元数据转成发送载荷（重发已上传完成的媒体消息时复用） */
function mediaPayloadFromAttachment(att: MessageAttachment, content?: string): SendPayload {
  return {
    messageType: att.messageType,
    content: content || undefined,
    fileUrl: att.objectName,
    fileName: att.fileName,
    fileSize: att.fileSize,
    fileType: att.fileType,
    mediaWidth: att.mediaWidth,
    mediaHeight: att.mediaHeight,
    thumbnailUrl: att.thumbnailUrl
  }
}

const LayoutContext = createContext<LayoutContextValue | null>(null)
const NavigationContext = createContext<NavigationContextValue | null>(null)
const ChatContext = createContext<ChatContextValue | null>(null)
const NotificationsContext = createContext<NotificationsContextValue | null>(null)
const FavoritesContext = createContext<FavoritesContextValue | null>(null)

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
      type: 'text',
      title: '有没有女生聊 老师刚吃饭完有劲 带你聊一波 让妹子对你回味无穷',
      source: '欧阳校长-白哥 60B',
      time: '2026-07-05',
      chatId: '2'
    },
    {
      id: '2',
      type: 'text',
      title: 'Token消耗完了',
      source: 'WLB 社群',
      time: '2026-07-05',
      chatId: '3'
    },
    {
      id: '3',
      type: 'image',
      title: '[KY科学择偶] 交友实践 02群',
      source: '[KY科学择偶] 交友实践 02群',
      thumbnail: FavoriteImageSample,
      time: '2026-05-04',
      chatId: '4'
    },
    {
      id: '4',
      type: 'file',
      title: '第1-11周课件.zip',
      fileName: '第1-11周课件.zip',
      fileExt: 'ZIP',
      fileSize: '32.3 MB',
      source: '群聊',
      time: '2022-02-21'
    },
    {
      id: '5',
      type: 'file',
      title: '教师国考介绍 (1).pptx',
      fileName: '教师国考介绍 (1).pptx',
      fileExt: 'PPTX',
      fileSize: '12.4 MB',
      source: '群聊',
      time: '2017-05-03'
    },
    {
      id: '6',
      type: 'file',
      title: '华夏思源休学延学指南 2017.docx',
      fileName: '华夏思源休学延学指南 2017.docx',
      fileExt: 'DOCX',
      fileSize: '948 KB',
      source: '流水无痕',
      time: '2017-03-19'
    }
  ])

  const selectedChatRef = useRef<string | null>(selectedChat)
  const activePanelRef = useRef<AppPanel>(activePanel)
  const currentUserIdRef = useRef<string | null>(currentUserId)
  const chatsRef = useRef<LayoutChat[]>(chats)
  const messagesRef = useRef<LayoutMessage[]>(messages)
  // 媒体重发时需要原始 File（LayoutMessage 不存二进制）：localId → File，发送成功/卸载时清理
  const pendingFilesRef = useRef<Map<string, File>>(new Map())
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

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

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
    const pendingFiles = pendingFilesRef.current
    return () => {
      if (conversationRefreshTimerRef.current) {
        clearTimeout(conversationRefreshTimerRef.current)
      }
      if (notificationRefreshTimerRef.current) {
        clearTimeout(notificationRefreshTimerRef.current)
      }
      // 卸载时回收所有乐观媒体消息的 blob 预览 URL，避免内存泄漏
      messagesRef.current.forEach((m) => {
        if (m.attachment?.localPreviewUrl) {
          URL.revokeObjectURL(m.attachment.localPreviewUrl)
        }
      })
      pendingFiles.clear()
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
        transports: ['websocket'],
        auth: {
          token,
          Authorization: `Bearer ${token}`
        }
      })
      setSocket(socket)

      // 首次连接由 selectedChat effect 负责加载历史；这里用闭包标志位区分「重连」，
      // 仅在重连时为当前打开的会话补拉一次消息，消除断线期间漏掉的消息（步骤 2）。
      let hasConnectedOnce = false
      socket.on('connect', () => {
        console.log('[Socket] connected:', socket?.id)
        if (!hasConnectedOnce) {
          hasConnectedOnce = true
          return
        }
        const openChatId = selectedChatRef.current
        const panel = activePanelRef.current
        if (openChatId && (panel === 'chat' || panel === 'groups')) {
          void loadMessages(openChatId, meId)
        }
      })
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
        // 复用 mapServerMessage：一并解析头像 + 映射媒体 messageType/attachment
        const local = await mapServerMessage(msg, meId)
        const isOpen = selectedChatRef.current === msg.roomId

        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === msg.roomId)
          const senderNick = msg.sender?.nickname || msg.sender?.username
          const isGroup = idx > -1 && prev[idx].type === 'group'
          const preview = buildLastMessagePreview(
            msg.messageType,
            msg.content,
            msg.fileName,
            isGroup,
            senderNick
          )
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
            avatar: base.avatar || (!isGroup ? local.senderAvatar || '' : ''),
            lastMessage: preview,
            time: msg.createdAt,
            unread: isOpen || isMe ? undefined : (base.unread || 0) + 1
          }
          return [next, ...prev.filter((c) => c.id !== msg.roomId)]
        })

        if (isOpen) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === local.id)) return prev
            // 去重自身乐观消息：媒体优先按 objectName/fileUrl 精确匹配，避免多张空备注图片互删。
            const cleaned = prev.filter((m) => {
              const shouldRemove =
                m.id.startsWith('local-') &&
                m.chatId === local.chatId &&
                (local.attachment?.objectName
                  ? m.attachment?.objectName === local.attachment.objectName
                  : m.content === local.content &&
                    (m.messageType || 'TEXT') === (local.messageType || 'TEXT'))
              if (shouldRemove && m.attachment?.localPreviewUrl) {
                URL.revokeObjectURL(m.attachment.localPreviewUrl)
              }
              return !shouldRemove
            })
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
  }, [currentUserId, scheduleConversationRefresh, scheduleNotificationRefresh, loadMessages])

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

  const setMessageStatus = useCallback(
    (messageId: string, status: MessageDeliveryStatus, errorMessage?: string): void => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, status, errorMessage: status === 'failed' ? errorMessage : undefined }
            : m
        )
      )
    },
    []
  )

  // 发送消息的底层动作：依据 chatId/peerUserId 选事件，emit 时附带 ack 回调，
  // 由 socket.io 的 .timeout() 在超时后以 Error 触发回调，从而驱动 sending → sent/failed。
  // payload 泛化为文本/媒体通用：TEXT 仅 content；IMAGE/FILE 带 fileUrl 等媒体字段。
  const emitAndWatchAck = useCallback(
    (chatId: string, payload: SendPayload, localId: string): void => {
      const sock = socket
      if (!sock) return
      const chat = chatsRef.current.find((c) => c.id === chatId)
      if (!chat) return
      const isGroup = chat.type === 'group'

      const handleAck = (err: Error | null, ack?: SendAckResponse): void => {
        // 后端 ack 可能是 DataResult，也可能直接回 message/空值。
        // 媒体消息已先完成对象存储上传；部分后端不会调用 socket callback，导致 timeout。
        // 因此媒体只在明确 result:false 时失败，避免成功图片被误标红点。
        const isMedia = payload.messageType === 'IMAGE' || payload.messageType === 'FILE'
        const ok = ack?.result !== false && (!err || isMedia)
        if (ok) {
          pendingFilesRef.current.delete(localId)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === localId ? { ...m, status: 'sent', errorMessage: undefined } : m
            )
          )
        } else {
          setMessageStatus(localId, 'failed', ack?.message || err?.message || '发送失败')
        }
      }

      if (isGroup) {
        sock
          .timeout(SEND_ACK_TIMEOUT_MS)
          .emit('message:sendRoom', { roomId: chatId, ...payload }, handleAck)
      } else {
        if (!chat.peerUserId) {
          setMessageStatus(localId, 'failed', '缺少私聊接收方，无法发送')
          return
        }
        sock
          .timeout(SEND_ACK_TIMEOUT_MS)
          .emit('message:sendPrivate', { receiverId: chat.peerUserId, ...payload }, handleAck)
      }
    },
    [socket, setMessageStatus]
  )

  // 乐观上屏 + 等待 ack：先以 status: 'sending' 立即插入本地消息，再发出带回执的 emit
  const sendMessage = useCallback(
    (content: string): void => {
      const trimmed = content.trim()
      const chatId = selectedChatRef.current
      if (!trimmed || !chatId || !socket) return
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const optimistic: LayoutMessage = {
        id: localId,
        chatId,
        content: trimmed,
        time: formatHM(new Date().toISOString()),
        sender: 'me',
        senderName: '我',
        status: 'sending'
      }
      setMessages((prev) => [...prev, optimistic])
      emitAndWatchAck(chatId, { content: trimmed, messageType: 'TEXT' }, localId)
    },
    [emitAndWatchAck, socket]
  )

  // 媒体上传后续：上传成功后回填 objectName/尺寸，切到 sending 并发出带回执的 emit
  const runAttachmentUpload = useCallback(
    async (localId: string, chatId: string, file: File, caption?: string): Promise<void> => {
      try {
        const prepared = await uploadMedia(file)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId && m.attachment
              ? {
                  ...m,
                  status: 'sending',
                  attachment: {
                    ...m.attachment,
                    objectName: prepared.objectName,
                    fileSize: prepared.fileSize,
                    fileType: prepared.fileType,
                    mediaWidth: prepared.mediaWidth,
                    mediaHeight: prepared.mediaHeight,
                    thumbnailUrl: prepared.thumbnailUrl
                  }
                }
              : m
          )
        )
        emitAndWatchAck(
          chatId,
          {
            messageType: prepared.messageType,
            content: caption || undefined,
            fileUrl: prepared.objectName,
            fileName: prepared.fileName,
            fileSize: prepared.fileSize,
            fileType: prepared.fileType,
            mediaWidth: prepared.mediaWidth,
            mediaHeight: prepared.mediaHeight,
            thumbnailUrl: prepared.thumbnailUrl
          },
          localId
        )
      } catch (error) {
        console.error('[Layout] 媒体上传失败:', error)
        setMessageStatus(localId, 'failed', error instanceof Error ? error.message : '媒体上传失败')
      }
    },
    [emitAndWatchAck, setMessageStatus]
  )

  // 发送媒体：先以 status: 'uploading' 乐观上屏（图片用 blob: 即时预览），
  // 再异步上传 → 切 sending → 等待 ack。上传抛错即标 failed。
  const sendAttachment = useCallback(
    (file: File, caption?: string): void => {
      const chatId = selectedChatRef.current
      if (!chatId || !socket) return
      const trimmedCaption = caption?.trim()
      const isImage = isImageFile(file.name, file.type)
      const messageType: LayoutMessageType = isImage ? 'IMAGE' : 'FILE'
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const optimistic: LayoutMessage = {
        id: localId,
        chatId,
        content: trimmedCaption || '',
        time: formatHM(new Date().toISOString()),
        sender: 'me',
        senderName: '我',
        status: 'uploading',
        messageType,
        attachment: {
          messageType,
          localPreviewUrl: isImage ? URL.createObjectURL(file) : undefined,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream'
        }
      }
      setMessages((prev) => [...prev, optimistic])
      pendingFilesRef.current.set(localId, file)
      void runAttachmentUpload(localId, chatId, file, trimmedCaption || undefined)
    },
    [runAttachmentUpload, socket]
  )

  // 重发失败消息：按 attachment.objectName 是否存在分流——
  // 已上传完成(socket 失败) → 仅重发，不重传，不产生 MinIO 孤儿对象；
  // 上传未完成 → 用 pendingFilesRef 里的原始 File 重跑上传；文件丢失则放弃。
  const retrySendMessage = useCallback(
    (messageId: string): void => {
      const target = messagesRef.current.find((m) => m.id === messageId)
      if (!target || target.sender !== 'me' || !socket) return

      if (target.attachment) {
        if (target.attachment.objectName) {
          setMessageStatus(messageId, 'sending')
          emitAndWatchAck(
            target.chatId,
            mediaPayloadFromAttachment(target.attachment, target.content),
            messageId
          )
        } else {
          const file = pendingFilesRef.current.get(messageId)
          if (!file) {
            console.warn('[Layout] 重发失败：原始文件已丢失', messageId)
            setMessageStatus(messageId, 'failed', '原始文件已丢失，请重新选择文件发送')
            return
          }
          setMessageStatus(messageId, 'uploading')
          void runAttachmentUpload(messageId, target.chatId, file, target.content || undefined)
        }
      } else {
        setMessageStatus(messageId, 'sending')
        emitAndWatchAck(target.chatId, { content: target.content, messageType: 'TEXT' }, messageId)
      }
    },
    [emitAndWatchAck, runAttachmentUpload, setMessageStatus, socket]
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

  const navigationValue = useMemo<NavigationContextValue>(
    () => ({
      activePanel,
      mobileChatOpen,
      mobileDetailOpen,
      navigatePanel,
      setActivePanelState,
      handleBackToList
    }),
    [
      activePanel,
      mobileChatOpen,
      mobileDetailOpen,
      navigatePanel,
      setActivePanelState,
      handleBackToList
    ]
  )

  const chatValue = useMemo<ChatContextValue>(
    () => ({
      currentUserId,
      selectedChat,
      socket,
      chats,
      friendChats,
      groupChats,
      messages,
      clearedChat,
      unreadCount,
      handleChatSelect,
      deleteChat,
      markChatAsRead,
      clearChatMessages,
      handleRefreshConversations,
      sendMessage,
      sendAttachment,
      retrySendMessage,
      startChatWithFriend
    }),
    [
      currentUserId,
      selectedChat,
      socket,
      chats,
      friendChats,
      groupChats,
      messages,
      clearedChat,
      unreadCount,
      handleChatSelect,
      deleteChat,
      markChatAsRead,
      clearChatMessages,
      handleRefreshConversations,
      sendMessage,
      sendAttachment,
      retrySendMessage,
      startChatWithFriend
    ]
  )

  const notificationsValue = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      handleFriendRequest
    }),
    [notifications, markNotificationAsRead, markAllNotificationsAsRead, handleFriendRequest]
  )

  const favoritesValue = useMemo<FavoritesContextValue>(
    () => ({
      favorites
    }),
    [favorites]
  )

  const value = useMemo<LayoutContextValue>(
    () => ({
      ...navigationValue,
      ...chatValue,
      ...notificationsValue,
      ...favoritesValue
    }),
    [navigationValue, chatValue, notificationsValue, favoritesValue]
  )

  return (
    <LayoutContext.Provider value={value}>
      <NavigationContext.Provider value={navigationValue}>
        <ChatContext.Provider value={chatValue}>
          <NotificationsContext.Provider value={notificationsValue}>
            <FavoritesContext.Provider value={favoritesValue}>{children}</FavoritesContext.Provider>
          </NotificationsContext.Provider>
        </ChatContext.Provider>
      </NavigationContext.Provider>
    </LayoutContext.Provider>
  )
}

function useRequiredContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context)
  if (!value) {
    throw new Error(`${name} must be used within LayoutProvider`)
  }
  return value
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNavigationContext(): NavigationContextValue {
  return useRequiredContext(NavigationContext, 'useNavigationContext')
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChatContext(): ChatContextValue {
  return useRequiredContext(ChatContext, 'useChatContext')
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotificationsContext(): NotificationsContextValue {
  return useRequiredContext(NotificationsContext, 'useNotificationsContext')
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFavoritesContext(): FavoritesContextValue {
  return useRequiredContext(FavoritesContext, 'useFavoritesContext')
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLayoutContext(): LayoutContextValue {
  return useRequiredContext(LayoutContext, 'useLayoutContext')
}
