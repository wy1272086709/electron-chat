/* eslint-disable react-refresh/only-export-components */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Socket } from 'socket.io-client'
import { chatService } from '@renderer/services/chat.service'
import { notificationService } from '@renderer/services/notification.service'
import { secureStorageService } from '@renderer/services/secure-storage.service'
import type { ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type { AppNotification } from '@renderer/types/notification.types'
import type {
  AppPanel,
  Favorite,
  LayoutChat,
  LayoutMessage,
  MessageDeliveryStatus
} from '@renderer/types/layout.types'
import {
  buildLastMessagePreview,
  mapConversation,
  mapServerMessage,
  mergeConversationList,
  resolveChatAvatar
} from './layoutContext.helpers'
import type { LayoutContextValue } from './layoutContext.types'
import {
  extractServerMessage,
  getReliableStateKey,
  isActionableNotification,
  normalizePresencePayload,
  pendingToLayoutMessage,
  SEND_ACK_GRACE_MS,
  SEND_BACKGROUND_VERIFY_DELAY_MS,
  SEND_MAX_RETRY_COUNT,
  SEND_RETRY_DELAY_MS,
  SYNC_PAGE_SIZE,
  type PendingReliableMessage,
  type PresencePayload,
  type ReliableChatLocalState,
  type RoomPresencePayload,
  type SendAckResponse
} from './layoutContext.runtime'
import { useChatSocket } from './useChatSocket'
import { useLayoutActions } from './useLayoutActions'
import { useLatestRef } from './useLatestRef'
import { LayoutContextProviders } from './LayoutContextProviders'

export {
  useChatContext,
  useFavoritesContext,
  useLayoutContext,
  useNavigationContext,
  useNotificationsContext
} from './LayoutContextProviders'

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate()
  const [activePanel, setActivePanel] = useState<AppPanel>('chat')
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [clearedChat, setClearedChat] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [authInitialized, setAuthInitialized] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [chats, setChats] = useState<LayoutChat[]>([])
  const [messages, setMessages] = useState<LayoutMessage[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [favorites] = useState<Favorite[]>([])
  const selectedChatRef = useLatestRef(selectedChat)
  const lastSelectedChatByPanelRef = useRef<Partial<Record<'chat' | 'groups', string | null>>>({})
  const activePanelRef = useLatestRef(activePanel)
  const currentUserIdRef = useLatestRef(currentUserId)
  const chatsRef = useLatestRef(chats)
  const messagesRef = useLatestRef(messages)
  const socketRef = useLatestRef(socket)
  const pendingQueueRef = useRef<PendingReliableMessage[]>([])
  const roomCursorsRef = useRef<Record<string, string>>({})
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const seenClientMessageIdsRef = useRef<Set<string>>(new Set())
  const reliableStateKeyRef = useRef<string>(getReliableStateKey(null))
  const flushingPendingRef = useRef(false)
  const pendingFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncInFlightRoomsRef = useRef<Set<string>>(new Set())
  const flushPendingQueueRef = useRef<() => Promise<void>>(async () => undefined)
  const pendingFilesRef = useRef<Map<string, File>>(new Map())
  const conversationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notificationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        let settled = false
        const timer = window.setTimeout(() => {
          if (settled) return
          settled = true
          resolve(null)
        }, SEND_ACK_GRACE_MS)
        const handleAck = (ack?: SendAckResponse): void => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          if (ack?.result === false) {
            reject(new Error(ack.message || '消息发送失败'))
            return
          }
          resolve(extractServerMessage(ack?.data))
        }

        if (chat.type === 'group') {
          sock.emit('message:sendRoom', { roomId: item.chatId, ...basePayload }, handleAck)
          return
        }

        const receiverId = item.receiverId || chat.peerUserId
        if (!receiverId) {
          settled = true
          window.clearTimeout(timer)
          reject(new Error('缺少私聊接收方，无法发送'))
          return
        }
        sock.emit('message:sendPrivate', { receiverId, ...basePayload }, handleAck)
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
    let shouldVerifyLater = false

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
        const alreadyOptimisticallySent = messagesRef.current.some(
          (message) =>
            message.clientMessageId === latest.clientMessageId && message.status === 'sent'
        )
        if (!alreadyOptimisticallySent) {
          setLocalMessageStatusByClientId(
            latest.clientMessageId,
            'sending',
            undefined,
            latest.localId
          )
        }

        try {
          const serverMessage = await emitPendingWithAck(sending)
          if (serverMessage) {
            await upsertServerMessage(serverMessage, {
              updateConversation: true,
              markDelivered: true
            })
          } else {
            setLocalMessageStatusByClientId(
              sending.clientMessageId,
              'sent',
              undefined,
              sending.localId
            )
            scheduleConversationRefresh(currentUserIdRef.current)
            await syncRoomMessages(sending.chatId)

            const stillPending = pendingQueueRef.current.some(
              (item) => item.clientMessageId === sending.clientMessageId
            )
            if (!stillPending) continue

            const failed = nextRetryCount >= SEND_MAX_RETRY_COUNT
            updatePendingMessage(sending.clientMessageId, {
              status: failed ? 'failed' : 'pending',
              retryCount: nextRetryCount
            })
            if (failed) {
              setLocalMessageStatusByClientId(
                sending.clientMessageId,
                'failed',
                '未收到服务端确认，请点击重试',
                sending.localId
              )
            } else {
              shouldVerifyLater = true
            }
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
    } else if (shouldVerifyLater) {
      schedulePendingFlush(SEND_BACKGROUND_VERIFY_DELAY_MS)
    }
  }, [
    emitPendingWithAck,
    scheduleConversationRefresh,
    schedulePendingFlush,
    setLocalMessageStatusByClientId,
    syncRoomMessages,
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
      setAuthInitialized(true)
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

  useChatSocket({
    authInitialized,
    currentUserId,
    selectedChatRef,
    setSelectedChat,
    setSocket,
    setChats,
    setMessages,
    loadConversations,
    applyPresenceUpdate,
    applyRoomPresenceUpdate,
    scheduleConversationRefresh,
    scheduleNotificationRefresh,
    schedulePendingFlush,
    syncRoomMessages,
    upsertServerMessage
  })

  const actions = useLayoutActions({
    navigate,
    clearedChat,
    selectedChatRef,
    lastSelectedChatByPanelRef,
    activePanelRef,
    currentUserIdRef,
    chatsRef,
    messagesRef,
    pendingFilesRef,
    setActivePanel,
    setSelectedChat,
    setMobileChatOpen,
    setMobileDetailOpen,
    setClearedChat,
    setChats,
    setMessages,
    setNotifications,
    loadConversations,
    loadMessages,
    rememberSelectedChat,
    forgetSelectedChat,
    upsertPendingMessage,
    schedulePendingFlush,
    setLocalMessageStatusByClientId
  })
  const friendChats = useMemo(() => chats.filter((c) => c.type === 'chat'), [chats])
  const groupChats = useMemo(() => chats.filter((c) => c.type === 'group'), [chats])

  useEffect(() => {
    if (activePanel !== 'chat' && activePanel !== 'groups') return

    const panelChats = activePanel === 'chat' ? friendChats : groupChats
    const currentIsAvailable = panelChats.some((chat) => chat.id === selectedChatRef.current)
    if (currentIsAvailable) return

    const fallbackChatId = panelChats[0]?.id ?? null
    lastSelectedChatByPanelRef.current[activePanel] = fallbackChatId
    selectedChatRef.current = fallbackChatId
    setSelectedChat(fallbackChatId)
  }, [activePanel, friendChats, groupChats])
  const unreadCount = useMemo(
    () => chats.reduce((total, chat) => total + (chat.unread || 0), 0),
    [chats]
  )
  const pendingNotificationCount = useMemo(
    () => notifications.filter(isActionableNotification).length,
    [notifications]
  )
  const value: LayoutContextValue = {
    activePanel,
    mobileChatOpen,
    mobileDetailOpen,
    currentUserId,
    selectedChat,
    socket,
    chats,
    friendChats,
    groupChats,
    messages,
    clearedChat,
    unreadCount,
    handleRefreshConversations,
    notifications,
    pendingNotificationCount,
    favorites,
    ...actions
  }

  return <LayoutContextProviders value={value}>{children}</LayoutContextProviders>
}
