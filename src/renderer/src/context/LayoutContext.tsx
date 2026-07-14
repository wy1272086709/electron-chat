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
import { userService } from '@renderer/services/user.service'
import type { ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type { AppNotification, NotificationAction } from '@renderer/types/notification.types'
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
const SEND_RETRY_DELAY_MS = 1200
const SEND_MAX_RETRY_COUNT = 3
const SYNC_PAGE_SIZE = 100
const RELIABLE_STATE_KEY_PREFIX = 'reliable_chat_state_v1'
const NOTIFICATION_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000

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

type PendingMessageStatus = 'pending' | 'sending' | 'failed'

interface PendingReliableMessage extends SendPayload {
  localId: string
  clientMessageId: string
  chatId: string
  receiverId?: string
  status: PendingMessageStatus
  retryCount: number
  createdAt: string
}

interface ReliableChatLocalState {
  pendingMessages: PendingReliableMessage[]
  roomCursors: Record<string, string>
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

function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `cmid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getReliableStateKey(userId: string | null): string {
  return `${RELIABLE_STATE_KEY_PREFIX}:${userId || 'anonymous'}`
}

function pendingToLayoutMessage(item: PendingReliableMessage): LayoutMessage {
  const messageType = item.messageType || 'TEXT'
  const isMedia = messageType === 'IMAGE' || messageType === 'FILE'
  return {
    id: item.localId,
    clientMessageId: item.clientMessageId,
    chatId: item.chatId,
    content: item.content || '',
    createdAt: item.createdAt,
    time: formatHM(item.createdAt),
    sender: 'me',
    senderName: '我',
    status: item.status === 'failed' ? 'failed' : item.status,
    messageType,
    attachment: isMedia
      ? {
          messageType,
          objectName: item.fileUrl,
          fileName: item.fileName || '',
          fileSize: item.fileSize || 0,
          fileType: item.fileType || '',
          mediaWidth: item.mediaWidth,
          mediaHeight: item.mediaHeight,
          thumbnailUrl: item.thumbnailUrl
        }
      : undefined
  }
}

function isServerMessage(value: unknown): value is ServerMessage {
  return !!(
    value &&
    typeof value === 'object' &&
    typeof (value as ServerMessage).id === 'string' &&
    typeof (value as ServerMessage).roomId === 'string'
  )
}

function extractServerMessage(value: unknown): ServerMessage | null {
  if (isServerMessage(value)) return value
  if (value && typeof value === 'object') {
    const maybeMessage = (value as { message?: unknown }).message
    if (isServerMessage(maybeMessage)) return maybeMessage
  }
  return null
}

function isActionableNotification(notification: AppNotification): boolean {
  if (notification.result !== 'PENDING') return false
  const createdAt = new Date(notification.createdAt).getTime()
  return Number.isNaN(createdAt) || Date.now() - createdAt < NOTIFICATION_EXPIRE_MS
}

type PresencePayload =
  | string
  | {
      userId?: string
      id?: string
      isOnline?: boolean
      online?: boolean
      status?: string
      lastSeenAt?: string
      lastOnlineAt?: string
      lastActiveAt?: string
    }

type RoomPresencePayload = {
  roomId?: string
  id?: string
  onlineCount?: number
  onlineMemberCount?: number
  memberCount?: number
}

function normalizePresencePayload(
  payload: PresencePayload,
  forcedOnline?: boolean
): { userId: string; isOnline: boolean; lastSeenAt?: string } | null {
  if (typeof payload === 'string') {
    if (!payload || forcedOnline === undefined) return null
    return {
      userId: payload,
      isOnline: forcedOnline,
      lastSeenAt: forcedOnline ? undefined : new Date().toISOString()
    }
  }

  if (!payload || typeof payload !== 'object') return null

  const userId = payload.userId || payload.id
  if (!userId) return null

  const status = payload.status?.toLowerCase()
  const isOnline =
    forcedOnline ??
    (typeof payload.isOnline === 'boolean'
      ? payload.isOnline
      : typeof payload.online === 'boolean'
        ? payload.online
        : status === 'online'
          ? true
          : status === 'offline'
            ? false
            : undefined)

  if (isOnline === undefined) return null

  const lastSeenAt =
    payload.lastSeenAt ||
    payload.lastOnlineAt ||
    payload.lastActiveAt ||
    (!isOnline ? new Date().toISOString() : undefined)

  return { userId, isOnline, lastSeenAt }
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
  const [favorites] = useState<Favorite[]>([])
  const selectedChatRef = useRef<string | null>(selectedChat)
  const lastSelectedChatByPanelRef = useRef<Partial<Record<'chat' | 'groups', string | null>>>({})
  const activePanelRef = useRef<AppPanel>(activePanel)
  const currentUserIdRef = useRef<string | null>(currentUserId)
  const chatsRef = useRef<LayoutChat[]>(chats)
  const messagesRef = useRef<LayoutMessage[]>(messages)
  const socketRef = useRef<Socket | null>(socket)
  const pendingQueueRef = useRef<PendingReliableMessage[]>([])
  const roomCursorsRef = useRef<Record<string, string>>({})
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const seenClientMessageIdsRef = useRef<Set<string>>(new Set())
  const reliableStateKeyRef = useRef<string>(getReliableStateKey(null))
  const flushingPendingRef = useRef(false)
  const pendingFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncInFlightRoomsRef = useRef<Set<string>>(new Set())
  const flushPendingQueueRef = useRef<() => Promise<void>>(async () => undefined)
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

  useEffect(() => {
    socketRef.current = socket
  }, [socket])

  const persistReliableState = useCallback(async (): Promise<void> => {
    const snapshot: ReliableChatLocalState = {
      pendingMessages: pendingQueueRef.current,
      roomCursors: roomCursorsRef.current
    }
    try {
      await secureStorageService.setJSON(reliableStateKeyRef.current, snapshot)
    } catch (error) {
      console.warn('[ReliableMessage] 本地状态持久化失败:', error)
    }
  }, [])

  const markSeenServerMessage = useCallback((message: ServerMessage): void => {
    seenMessageIdsRef.current.add(message.id)
    if (message.clientMessageId) {
      seenClientMessageIdsRef.current.add(message.clientMessageId)
    }
  }, [])

  const setRoomCursor = useCallback(
    (roomId: string, messageId?: string | null): void => {
      if (!roomId || !messageId) return
      if (roomCursorsRef.current[roomId] === messageId) return
      roomCursorsRef.current = {
        ...roomCursorsRef.current,
        [roomId]: messageId
      }
      void persistReliableState()
    },
    [persistReliableState]
  )

  const removePendingByClientMessageId = useCallback(
    (clientMessageId?: string | null): void => {
      if (!clientMessageId) return
      const target = pendingQueueRef.current.find(
        (item) => item.clientMessageId === clientMessageId
      )
      if (!target) return

      pendingQueueRef.current = pendingQueueRef.current.filter(
        (item) => item.clientMessageId !== clientMessageId
      )
      pendingFilesRef.current.delete(target.localId)
      void persistReliableState()
    },
    [persistReliableState]
  )

  const upsertPendingMessage = useCallback(
    (item: PendingReliableMessage): void => {
      const next = pendingQueueRef.current.filter(
        (pending) => pending.clientMessageId !== item.clientMessageId
      )
      pendingQueueRef.current = [...next, item]
      void persistReliableState()
    },
    [persistReliableState]
  )

  const updatePendingMessage = useCallback(
    (
      clientMessageId: string,
      patch:
        | Partial<PendingReliableMessage>
        | ((item: PendingReliableMessage) => Partial<PendingReliableMessage>)
    ): PendingReliableMessage | null => {
      let updated: PendingReliableMessage | null = null
      pendingQueueRef.current = pendingQueueRef.current.map((item) => {
        if (item.clientMessageId !== clientMessageId) return item
        const nextPatch = typeof patch === 'function' ? patch(item) : patch
        updated = { ...item, ...nextPatch }
        return updated
      })
      if (updated) void persistReliableState()
      return updated
    },
    [persistReliableState]
  )

  const setLocalMessageStatusByClientId = useCallback(
    (
      clientMessageId: string,
      status: MessageDeliveryStatus,
      errorMessage?: string,
      localId?: string
    ): void => {
      setMessages((prev) =>
        prev.map((m) =>
          m.clientMessageId === clientMessageId || (!!localId && m.id === localId)
            ? { ...m, status, errorMessage: status === 'failed' ? errorMessage : undefined }
            : m
        )
      )
    },
    []
  )

  const markMessageDelivered = useCallback((message: ServerMessage, meId: string | null): void => {
    if (!message.id || !message.roomId || message.senderId === meId) return
    socketRef.current?.emit('message:delivered', {
      roomId: message.roomId,
      messageId: message.id
    })
  }, [])

  const rememberSelectedChat = useCallback((chatId: string): void => {
    const chat = chatsRef.current.find((item) => item.id === chatId)
    if (!chat) return
    lastSelectedChatByPanelRef.current[chat.type === 'group' ? 'groups' : 'chat'] = chatId
  }, [])

  const forgetSelectedChat = useCallback((chatId: string): void => {
    ;(['chat', 'groups'] as const).forEach((panel) => {
      if (lastSelectedChatByPanelRef.current[panel] === chatId) {
        lastSelectedChatByPanelRef.current[panel] = null
      }
    })
  }, [])

  const loadConversations = useCallback(async (meId: string | null): Promise<LayoutChat[]> => {
    const res = await chatService.getConversations()
    if (res.result && res.data) {
      const list = await Promise.all(
        res.data.map((c) => resolveChatAvatar(mapConversation(c, meId)))
      )
      setChats((prev) => mergeConversationList(list, prev, selectedChatRef.current))
      return list
    } else {
      console.warn('[Layout] 加载会话列表失败:', res.message)
      return []
    }
  }, [])

  const loadMessages = useCallback(
    async (roomId: string, meId: string | null): Promise<void> => {
      const res = await chatService.getMessages(roomId, 50)
      const pendingList = pendingQueueRef.current
        .filter((item) => item.chatId === roomId)
        .map(pendingToLayoutMessage)

      if (res.result && res.data) {
        const sorted = res.data
          .filter((m) => !m.isDeleted)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        sorted.forEach((m) => {
          markSeenServerMessage(m)
          setRoomCursor(m.roomId, m.id)
        })
        const list = await Promise.all(sorted.map((m) => mapServerMessage(m, meId)))
        const serverClientIds = new Set(list.map((m) => m.clientMessageId).filter(Boolean))
        const visiblePending = pendingList.filter(
          (m) => !m.clientMessageId || !serverClientIds.has(m.clientMessageId)
        )
        setMessages([...list, ...visiblePending])
      } else {
        setMessages(pendingList)
        console.warn('[Layout] 加载消息失败:', res.message)
      }
    },
    [markSeenServerMessage, setRoomCursor]
  )

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

  const applyPresenceUpdate = useCallback(
    (payload: PresencePayload, forcedOnline?: boolean): void => {
      const presence = normalizePresencePayload(payload, forcedOnline)
      if (!presence) return

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.type !== 'chat' || chat.peerUserId !== presence.userId) return chat
          return {
            ...chat,
            isOnline: presence.isOnline,
            lastSeenAt: presence.lastSeenAt ?? chat.lastSeenAt
          }
        })
      )
    },
    []
  )

  const applyRoomPresenceUpdate = useCallback((payload: RoomPresencePayload): void => {
    const roomId = payload.roomId || payload.id
    const onlineCount = payload.onlineCount ?? payload.onlineMemberCount
    if (!roomId || typeof onlineCount !== 'number') return

    setChats((prev) =>
      prev.map((chat) => {
        if (chat.type !== 'group' || chat.id !== roomId) return chat
        return {
          ...chat,
          onlineCount,
          memberCount:
            typeof payload.memberCount === 'number' ? payload.memberCount : chat.memberCount
        }
      })
    )
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

  const upsertServerMessage = useCallback(
    async (
      message: ServerMessage,
      options: { updateConversation?: boolean; markDelivered?: boolean } = {}
    ): Promise<void> => {
      if (!message?.id || !message.roomId || message.isDeleted) return
      const isDuplicate =
        seenMessageIdsRef.current.has(message.id) ||
        (!!message.clientMessageId && seenClientMessageIdsRef.current.has(message.clientMessageId))
      if (isDuplicate) {
        removePendingByClientMessageId(message.clientMessageId)
        setRoomCursor(message.roomId, message.id)
        return
      }

      const meId = currentUserIdRef.current
      const local = await mapServerMessage(message, meId)
      const isMe = message.senderId === meId
      const isOpen = selectedChatRef.current === message.roomId

      markSeenServerMessage(message)
      setRoomCursor(message.roomId, message.id)
      removePendingByClientMessageId(message.clientMessageId)

      if (options.markDelivered !== false) {
        markMessageDelivered(message, meId)
      }

      if (options.updateConversation !== false) {
        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === message.roomId)
          const senderNick = message.sender?.nickname || message.sender?.username
          const isGroup = idx > -1 && prev[idx].type === 'group'
          const preview = buildLastMessagePreview(
            message.messageType,
            message.content,
            message.fileName,
            isGroup,
            senderNick
          )
          const base: LayoutChat =
            idx > -1
              ? prev[idx]
              : {
                  id: message.roomId,
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
            time: message.createdAt,
            unread: isOpen || isMe ? undefined : (base.unread || 0) + 1
          }
          return [next, ...prev.filter((c) => c.id !== message.roomId)]
        })
      }

      if (isOpen) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === local.id)) return prev
          const cleaned = prev.filter((m) => {
            const shouldRemove =
              m.clientMessageId === local.clientMessageId ||
              (m.id.startsWith('local-') &&
                m.chatId === local.chatId &&
                (local.attachment?.objectName
                  ? m.attachment?.objectName === local.attachment.objectName
                  : m.content === local.content &&
                    (m.messageType || 'TEXT') === (local.messageType || 'TEXT')))
            if (shouldRemove && m.attachment?.localPreviewUrl) {
              URL.revokeObjectURL(m.attachment.localPreviewUrl)
            }
            return !shouldRemove
          })
          return [...cleaned, local].sort(
            (a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime()
          )
        })

        if (!isMe) {
          void chatService
            .markRoomRead(message.roomId)
            .then(() => scheduleConversationRefresh(meId))
        }
      }
    },
    [
      markMessageDelivered,
      markSeenServerMessage,
      removePendingByClientMessageId,
      scheduleConversationRefresh,
      setRoomCursor
    ]
  )

  const syncRoomMessages = useCallback(
    async (roomId: string): Promise<void> => {
      if (!roomId || syncInFlightRoomsRef.current.has(roomId)) return
      syncInFlightRoomsRef.current.add(roomId)

      try {
        let afterMessageId: string | undefined = roomCursorsRef.current[roomId]
        let hasMore = true

        while (hasMore) {
          const res = await chatService.syncMessages(roomId, afterMessageId, SYNC_PAGE_SIZE)
          if (!res.result || !res.data) {
            console.warn('[ReliableMessage] 同步消息失败:', roomId, res.message)
            break
          }

          const sorted = [...res.data.messages]
            .filter((m) => !m.isDeleted)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

          for (const message of sorted) {
            await upsertServerMessage(message, { updateConversation: true, markDelivered: true })
          }

          afterMessageId =
            res.data.nextCursor?.messageId || sorted.at(-1)?.id || afterMessageId || undefined
          if (afterMessageId) {
            setRoomCursor(roomId, afterMessageId)
          }
          hasMore = res.data.hasMore && sorted.length > 0
        }
      } finally {
        syncInFlightRoomsRef.current.delete(roomId)
      }
    },
    [setRoomCursor, upsertServerMessage]
  )

  const emitPendingWithAck = useCallback(
    (item: PendingReliableMessage): Promise<ServerMessage | null> => {
      const sock = socketRef.current
      if (!sock?.connected) return Promise.reject(new Error('网络未连接'))

      const chat = chatsRef.current.find((c) => c.id === item.chatId)
      if (!chat) return Promise.reject(new Error('会话不存在'))

      const basePayload = {
        clientMessageId: item.clientMessageId,
        content: item.content || undefined,
        messageType: item.messageType,
        fileUrl: item.fileUrl,
        fileName: item.fileName,
        fileSize: item.fileSize,
        fileType: item.fileType,
        mediaWidth: item.mediaWidth,
        mediaHeight: item.mediaHeight,
        thumbnailUrl: item.thumbnailUrl
      }

      return new Promise((resolve, reject) => {
        const handleAck = (err: Error | null, ack?: SendAckResponse): void => {
          if (err) {
            reject(err)
            return
          }
          if (ack?.result === false) {
            reject(new Error(ack.message || '消息发送失败'))
            return
          }
          resolve(extractServerMessage(ack?.data))
        }

        if (chat.type === 'group') {
          sock
            .timeout(SEND_ACK_TIMEOUT_MS)
            .emit('message:sendRoom', { roomId: item.chatId, ...basePayload }, handleAck)
          return
        }

        const receiverId = item.receiverId || chat.peerUserId
        if (!receiverId) {
          reject(new Error('缺少私聊接收方，无法发送'))
          return
        }
        sock
          .timeout(SEND_ACK_TIMEOUT_MS)
          .emit('message:sendPrivate', { receiverId, ...basePayload }, handleAck)
      })
    },
    []
  )

  const schedulePendingFlush = useCallback((delay = 0): void => {
    if (pendingFlushTimerRef.current) {
      clearTimeout(pendingFlushTimerRef.current)
    }
    pendingFlushTimerRef.current = setTimeout(() => {
      pendingFlushTimerRef.current = null
      void flushPendingQueueRef.current()
    }, delay)
  }, [])

  const flushPendingQueue = useCallback(async (): Promise<void> => {
    if (flushingPendingRef.current) return
    if (!socketRef.current?.connected) return

    flushingPendingRef.current = true
    let shouldRetryLater = false

    try {
      for (const queued of [...pendingQueueRef.current]) {
        const latest = pendingQueueRef.current.find(
          (item) => item.clientMessageId === queued.clientMessageId
        )
        if (!latest || latest.status === 'failed') continue

        const nextRetryCount = latest.retryCount + 1
        const sending: PendingReliableMessage = {
          ...latest,
          status: 'sending',
          retryCount: nextRetryCount
        }
        updatePendingMessage(latest.clientMessageId, sending)
        setLocalMessageStatusByClientId(
          latest.clientMessageId,
          'sending',
          undefined,
          latest.localId
        )

        try {
          const serverMessage = await emitPendingWithAck(sending)
          if (serverMessage) {
            await upsertServerMessage(serverMessage, {
              updateConversation: true,
              markDelivered: true
            })
          } else {
            removePendingByClientMessageId(sending.clientMessageId)
            pendingFilesRef.current.delete(sending.localId)
            setLocalMessageStatusByClientId(
              sending.clientMessageId,
              'sent',
              undefined,
              sending.localId
            )
            scheduleConversationRefresh(currentUserIdRef.current)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '消息发送失败'
          const failed = nextRetryCount >= SEND_MAX_RETRY_COUNT
          updatePendingMessage(sending.clientMessageId, {
            status: failed ? 'failed' : 'pending',
            retryCount: nextRetryCount
          })
          setLocalMessageStatusByClientId(
            sending.clientMessageId,
            failed ? 'failed' : 'pending',
            failed ? message : undefined,
            sending.localId
          )
          shouldRetryLater = shouldRetryLater || !failed
        }
      }
    } finally {
      flushingPendingRef.current = false
    }

    if (shouldRetryLater) {
      schedulePendingFlush(SEND_RETRY_DELAY_MS)
    }
  }, [
    emitPendingWithAck,
    removePendingByClientMessageId,
    scheduleConversationRefresh,
    schedulePendingFlush,
    setLocalMessageStatusByClientId,
    updatePendingMessage,
    upsertServerMessage
  ])

  useEffect(() => {
    flushPendingQueueRef.current = flushPendingQueue
  }, [flushPendingQueue])

  useEffect(() => {
    const pendingFiles = pendingFilesRef.current
    return () => {
      if (conversationRefreshTimerRef.current) {
        clearTimeout(conversationRefreshTimerRef.current)
      }
      if (notificationRefreshTimerRef.current) {
        clearTimeout(notificationRefreshTimerRef.current)
      }
      if (pendingFlushTimerRef.current) {
        clearTimeout(pendingFlushTimerRef.current)
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
        rememberSelectedChat(newRoomId)
        selectedChatRef.current = newRoomId
        setSelectedChat(newRoomId)
      }
    },
    [loadConversations, rememberSelectedChat]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const user = await secureStorageService.getUserInfo()
      if (cancelled) return
      const meId = user?.id ?? null
      reliableStateKeyRef.current = getReliableStateKey(meId)
      const reliableState = await secureStorageService.getJSON<ReliableChatLocalState>(
        reliableStateKeyRef.current
      )
      if (!cancelled && reliableState) {
        pendingQueueRef.current = Array.isArray(reliableState.pendingMessages)
          ? reliableState.pendingMessages
          : []
        roomCursorsRef.current = reliableState.roomCursors || {}
      }
      setCurrentUserId(meId)
      await Promise.all([loadConversations(meId), loadNotifications()])
      schedulePendingFlush()
    })()
    return () => {
      cancelled = true
    }
  }, [loadConversations, loadNotifications, schedulePendingFlush])

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

      socket.on('connect', () => {
        console.log('[Socket] connected:', socket?.id)
        void (async () => {
          const list = await loadConversations(meId)
          for (const chat of list) {
            await syncRoomMessages(chat.id)
          }
          schedulePendingFlush()
        })()
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
      socket.on('presence:update', (payload: PresencePayload) => {
        applyPresenceUpdate(payload)
      })
      socket.on('user:online', (payload: PresencePayload) => {
        applyPresenceUpdate(payload, true)
      })
      socket.on('user:offline', (payload: PresencePayload) => {
        applyPresenceUpdate(payload, false)
      })
      socket.on('presence:online', (payload: PresencePayload) => {
        applyPresenceUpdate(payload, true)
      })
      socket.on('presence:offline', (payload: PresencePayload) => {
        applyPresenceUpdate(payload, false)
      })
      socket.on('room:presence', (payload: RoomPresencePayload) => {
        applyRoomPresenceUpdate(payload)
      })
      socket.on('room:onlineCount', (payload: RoomPresencePayload) => {
        applyRoomPresenceUpdate(payload)
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

      socket.on('message:new', (msg: ServerMessage) => {
        void upsertServerMessage(msg, { updateConversation: true, markDelivered: true })
      })

      socket.on('message:sent', (payload: unknown) => {
        const message = extractServerMessage(payload)
        if (message) {
          void upsertServerMessage(message, { updateConversation: true, markDelivered: false })
        }
        refreshConversations()
      })
      socket.on('room:created', refreshConversations)
      socket.on('room:private', refreshConversations)
      socket.on('room:read', refreshConversations)
      socket.on('room:cleared', refreshConversations)

      // 其他成员退出群聊：成员数 / 群主可能变更，刷新会话列表与成员资料
      socket.on('member:left', (payload: { roomId?: string }) => {
        if (payload?.roomId) refreshConversations()
      })
      // 有新成员加入群聊：成员数变更，刷新会话列表
      socket.on('member:joined', (payload: { roomId?: string }) => {
        if (payload?.roomId) refreshConversations()
      })
      // 自己退出群聊的后端兜底推送：确保本地会话被清理（leaveGroup 已乐观移除，此处为双保险）
      socket.on('room:left', (payload: { roomId?: string }) => {
        if (!payload?.roomId) return
        setChats((prev) => prev.filter((c) => c.id !== payload.roomId))
        if (selectedChatRef.current === payload.roomId) {
          selectedChatRef.current = null
          setSelectedChat(null)
        }
      })

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
  }, [
    currentUserId,
    loadConversations,
    applyPresenceUpdate,
    applyRoomPresenceUpdate,
    scheduleConversationRefresh,
    scheduleNotificationRefresh,
    schedulePendingFlush,
    syncRoomMessages,
    upsertServerMessage
  ])

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

  const handleFriendRequest = useCallback(
    async (id: string, action: NotificationAction): Promise<void> => {
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

  const handleGroupInvitation = useCallback(
    async (id: string, action: NotificationAction): Promise<void> => {
      const res = await notificationService.handleGroupInvitation(id, action)
      const updated = res.data
      if (res.result && updated) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, ...updated, sender: n.sender } : n))
        )
        if (action === 'ACCEPTED') {
          await loadConversations(currentUserIdRef.current)
        }
      } else {
        console.warn('[Layout] 处理群邀请失败:', res.message)
        alert(res.message || '处理群邀请失败')
      }
    },
    [loadConversations]
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
      rememberSelectedChat(chatId)
      selectedChatRef.current = chatId
      setSelectedChat(chatId)
      setClearedChat(chatId)

      const chat = chatsRef.current.find((c) => c.id === chatId)
      alert(`已清空与 ${chat?.name || ''} 的聊天记录`)
    },
    [loadMessages, rememberSelectedChat]
  )

  const deleteChat = useCallback(
    (id: string): void => {
      setChats((prev) => prev.filter((chat) => chat.id !== id))
      forgetSelectedChat(id)
      if (selectedChatRef.current === id) {
        selectedChatRef.current = null
        setSelectedChat(null)
      }
    },
    [forgetSelectedChat]
  )

  // 删除好友：调后端接口，乐观移除该好友的私聊会话并清空选中，再与后端同步。
  // 返回是否成功，供「好友资料」弹窗决定是否关闭 / 通知调用方刷新通讯录。
  const removeFriend = useCallback(
    async (friendId: string): Promise<boolean> => {
      const res = await userService.deleteFriend(friendId)
      if (!res.result) {
        alert(res.message || '删除好友失败')
        return false
      }

      // 乐观移除该好友对应的私聊会话（按 peerUserId 匹配）
      const removed = chatsRef.current.find((c) => c.type === 'chat' && c.peerUserId === friendId)
      if (removed) {
        setChats((prev) => prev.filter((c) => c.id !== removed.id))
        forgetSelectedChat(removed.id)
        if (selectedChatRef.current === removed.id) {
          selectedChatRef.current = null
          setSelectedChat(null)
        }
      }

      // 与后端同步：后端已软移除成员关系，刷新后该私聊不会再出现
      void loadConversations(currentUserIdRef.current)
      return true
    },
    [forgetSelectedChat, loadConversations]
  )

  // 退出群聊：调后端接口，乐观移除该群会话并清空选中，再与后端同步。
  // 返回是否成功，供「群资料」弹窗决定是否关闭 / 回到列表。
  const leaveGroup = useCallback(
    async (roomId: string): Promise<boolean> => {
      const res = await chatService.leaveGroup(roomId)
      if (!res.result) {
        alert(res.message || '退出群聊失败')
        return false
      }

      // 乐观移除该群会话（按 roomId 匹配）
      setChats((prev) => prev.filter((c) => c.id !== roomId))
      forgetSelectedChat(roomId)
      if (selectedChatRef.current === roomId) {
        selectedChatRef.current = null
        setSelectedChat(null)
      }

      // 与后端同步：后端已把当前用户在该群置为 INACTIVE，刷新后该群不会再出现
      void loadConversations(currentUserIdRef.current)
      return true
    },
    [forgetSelectedChat, loadConversations]
  )

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

  // 乐观上屏 + 本地可靠队列：先生成 clientMessageId，断线/ack 丢失后重试复用同一个 ID。
  const sendMessage = useCallback(
    (content: string): void => {
      const trimmed = content.trim()
      const chatId = selectedChatRef.current
      if (!trimmed || !chatId) return
      const chat = chatsRef.current.find((c) => c.id === chatId)
      if (!chat) return

      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const clientMessageId = createClientMessageId()
      const createdAt = new Date().toISOString()
      const pending: PendingReliableMessage = {
        localId,
        clientMessageId,
        chatId,
        receiverId: chat.type === 'chat' ? chat.peerUserId : undefined,
        content: trimmed,
        messageType: 'TEXT',
        status: 'pending',
        retryCount: 0,
        createdAt
      }
      const optimistic: LayoutMessage = {
        id: localId,
        clientMessageId,
        chatId,
        content: trimmed,
        createdAt,
        time: formatHM(createdAt),
        sender: 'me',
        senderName: '我',
        status: 'pending',
        messageType: 'TEXT'
      }
      setMessages((prev) => [...prev, optimistic])
      upsertPendingMessage(pending)
      schedulePendingFlush()
    },
    [schedulePendingFlush, upsertPendingMessage]
  )

  // 媒体上传后续：上传成功后持久化 fileUrl 到可靠队列，再等待 ack。
  const runAttachmentUpload = useCallback(
    async (
      localId: string,
      clientMessageId: string,
      chatId: string,
      file: File,
      caption?: string
    ): Promise<void> => {
      try {
        const prepared = await uploadMedia(file, (progress) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === localId ? { ...message, uploadProgress: progress } : message
            )
          )
        })
        const chat = chatsRef.current.find((c) => c.id === chatId)
        const pending: PendingReliableMessage = {
          localId,
          clientMessageId,
          chatId,
          receiverId: chat?.type === 'chat' ? chat.peerUserId : undefined,
          messageType: prepared.messageType,
          content: caption || undefined,
          fileUrl: prepared.objectName,
          fileName: prepared.fileName,
          fileSize: prepared.fileSize,
          fileType: prepared.fileType,
          mediaWidth: prepared.mediaWidth,
          mediaHeight: prepared.mediaHeight,
          thumbnailUrl: prepared.thumbnailUrl,
          status: 'pending',
          retryCount: 0,
          createdAt: new Date().toISOString()
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId && m.attachment
              ? {
                  ...m,
                  status: 'pending',
                  uploadProgress: undefined,
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
        upsertPendingMessage(pending)
        schedulePendingFlush()
      } catch (error) {
        console.error('[Layout] 媒体上传失败:', error)
        setMessageStatus(localId, 'failed', error instanceof Error ? error.message : '媒体上传失败')
      }
    },
    [schedulePendingFlush, setMessageStatus, upsertPendingMessage]
  )

  // 发送媒体：先以 status: 'uploading' 乐观上屏（图片用 blob: 即时预览），
  // 再异步上传 → 切 sending → 等待 ack。上传抛错即标 failed。
  const sendAttachment = useCallback(
    (file: File, caption?: string): void => {
      const chatId = selectedChatRef.current
      if (!chatId) return
      const trimmedCaption = caption?.trim()
      const isImage = isImageFile(file.name, file.type)
      const messageType: LayoutMessageType = isImage ? 'IMAGE' : 'FILE'
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const clientMessageId = createClientMessageId()
      const createdAt = new Date().toISOString()
      const optimistic: LayoutMessage = {
        id: localId,
        clientMessageId,
        chatId,
        content: trimmedCaption || '',
        createdAt,
        time: formatHM(createdAt),
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
      void runAttachmentUpload(localId, clientMessageId, chatId, file, trimmedCaption || undefined)
    },
    [runAttachmentUpload]
  )

  // 重发失败消息：按 attachment.objectName 是否存在分流——
  // 已上传完成(socket 失败) → 仅重发，不重传，不产生 MinIO 孤儿对象；
  // 上传未完成 → 用 pendingFilesRef 里的原始 File 重跑上传；文件丢失则放弃。
  const retrySendMessage = useCallback(
    (messageId: string): void => {
      const target = messagesRef.current.find((m) => m.id === messageId)
      if (!target || target.sender !== 'me') return
      const clientMessageId = target.clientMessageId || createClientMessageId()

      if (target.attachment) {
        if (target.attachment.objectName) {
          const chat = chatsRef.current.find((c) => c.id === target.chatId)
          upsertPendingMessage({
            localId: target.id,
            clientMessageId,
            chatId: target.chatId,
            receiverId: chat?.type === 'chat' ? chat.peerUserId : undefined,
            ...mediaPayloadFromAttachment(target.attachment, target.content),
            status: 'pending',
            retryCount: 0,
            createdAt: target.createdAt || new Date().toISOString()
          })
          setLocalMessageStatusByClientId(clientMessageId, 'pending', undefined, messageId)
          schedulePendingFlush()
        } else {
          const file = pendingFilesRef.current.get(messageId)
          if (!file) {
            console.warn('[Layout] 重发失败：原始文件已丢失', messageId)
            setMessageStatus(messageId, 'failed', '原始文件已丢失，请重新选择文件发送')
            return
          }
          setMessageStatus(messageId, 'uploading')
          void runAttachmentUpload(
            messageId,
            clientMessageId,
            target.chatId,
            file,
            target.content || undefined
          )
        }
      } else {
        const chat = chatsRef.current.find((c) => c.id === target.chatId)
        upsertPendingMessage({
          localId: target.id,
          clientMessageId,
          chatId: target.chatId,
          receiverId: chat?.type === 'chat' ? chat.peerUserId : undefined,
          content: target.content,
          messageType: 'TEXT',
          status: 'pending',
          retryCount: 0,
          createdAt: target.createdAt || new Date().toISOString()
        })
        setLocalMessageStatusByClientId(clientMessageId, 'pending', undefined, messageId)
        schedulePendingFlush()
      }
    },
    [
      runAttachmentUpload,
      schedulePendingFlush,
      setLocalMessageStatusByClientId,
      setMessageStatus,
      upsertPendingMessage
    ]
  )

  const navigatePanel = useCallback(
    (panel: AppPanel): void => {
      if (panel === 'chat' || panel === 'groups') {
        const restoredChatId = lastSelectedChatByPanelRef.current[panel] ?? null
        selectedChatRef.current = restoredChatId
        setSelectedChat(restoredChatId)
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
      if (panel === 'chat' || panel === 'groups') {
        const restoredChatId =
          options?.preserveSelectedChatId ?? lastSelectedChatByPanelRef.current[panel] ?? null
        if (options?.preserveSelectedChatId) {
          lastSelectedChatByPanelRef.current[panel] = options.preserveSelectedChatId
        }
        selectedChatRef.current = restoredChatId
        setSelectedChat(restoredChatId)
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
        lastSelectedChatByPanelRef.current.chat = roomId
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
      const panel = activePanelRef.current
      if (panel === 'chat' || panel === 'groups') {
        lastSelectedChatByPanelRef.current[panel] = chatId
      }
      rememberSelectedChat(chatId)
      selectedChatRef.current = chatId
      setSelectedChat(chatId)
      void markChatAsRead(chatId)
      if (window.innerWidth <= 768) {
        setMobileChatOpen(false)
        setMobileDetailOpen(true)
      }
    },
    [markChatAsRead, rememberSelectedChat]
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
  const pendingNotificationCount = useMemo(
    () => notifications.filter(isActionableNotification).length,
    [notifications]
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
      startChatWithFriend,
      removeFriend,
      leaveGroup
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
      startChatWithFriend,
      removeFriend,
      leaveGroup
    ]
  )

  const notificationsValue = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      pendingNotificationCount,
      markNotificationAsRead,
      handleFriendRequest,
      handleGroupInvitation
    }),
    [
      notifications,
      pendingNotificationCount,
      markNotificationAsRead,
      handleFriendRequest,
      handleGroupInvitation
    ]
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
