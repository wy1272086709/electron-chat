import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_CONFIG } from '@renderer/config/api.config'
import { secureStorageService } from '@renderer/services/secure-storage.service'
import type { ChatMessage as ServerMessage } from '@renderer/types/chat.types'
import type { LayoutChat, LayoutMessage } from '@renderer/types/layout.types'
import { MODERATED_MESSAGE_PLACEHOLDER } from './layoutContext.helpers'
import {
  extractServerMessage,
  NOTIFICATION_SOCKET_EVENTS,
  type MessageModeratedPayload,
  type PresencePayload,
  type RoomPresencePayload
} from './layoutContext.runtime'

interface UseChatSocketOptions {
  authInitialized: boolean
  currentUserId: string | null
  selectedChatRef: MutableRefObject<string | null>
  setSelectedChat: Dispatch<SetStateAction<string | null>>
  setSocket: Dispatch<SetStateAction<Socket | null>>
  setChats: Dispatch<SetStateAction<LayoutChat[]>>
  setMessages: Dispatch<SetStateAction<LayoutMessage[]>>
  loadConversations: (meId: string | null) => Promise<LayoutChat[]>
  applyPresenceUpdate: (payload: PresencePayload, forcedOnline?: boolean) => void
  applyRoomPresenceUpdate: (payload: RoomPresencePayload) => void
  scheduleConversationRefresh: (meId: string | null) => void
  scheduleNotificationRefresh: () => void
  schedulePendingFlush: (delay?: number) => void
  syncRoomMessages: (roomId: string) => Promise<void>
  upsertServerMessage: (
    message: ServerMessage,
    options?: { updateConversation?: boolean; markDelivered?: boolean }
  ) => Promise<void>
}

export function useChatSocket(options: UseChatSocketOptions): void {
  const {
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
  } = options

  useEffect(() => {
    let socket: Socket | null = null
    let meId: string | null = currentUserId
    let active = true

    ;(async () => {
      if (!authInitialized) return
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
        auth: { token, Authorization: `Bearer ${token}` }
      })
      setSocket(socket)

      socket.on('connect', () => {
        console.log('[Socket] connected:', socket?.id)
        schedulePendingFlush()
        void (async () => {
          const list = await loadConversations(meId)
          for (const chat of list) await syncRoomMessages(chat.id)
        })()
      })
      socket.on('disconnect', (reason) => console.log('[Socket] disconnected:', reason))
      socket.on('connect_error', (error) => console.error('[Socket] connect_error:', error.message))
      socket.on('chat:connected', (data: { userId?: string }) => {
        if (data?.userId) meId = data.userId
        console.log('[Socket] 鉴权成功:', data)
      })
      socket.on('chat:error', (error: { message?: string }) => {
        console.error('[Socket] chat:error:', error?.message)
      })
      socket.on('presence:update', (payload: PresencePayload) => applyPresenceUpdate(payload))
      socket.on('user:online', (payload: PresencePayload) => applyPresenceUpdate(payload, true))
      socket.on('user:offline', (payload: PresencePayload) => applyPresenceUpdate(payload, false))
      socket.on('presence:online', (payload: PresencePayload) => applyPresenceUpdate(payload, true))
      socket.on('presence:offline', (payload: PresencePayload) =>
        applyPresenceUpdate(payload, false)
      )
      socket.on('room:presence', (payload: RoomPresencePayload) => applyRoomPresenceUpdate(payload))
      socket.on('room:onlineCount', (payload: RoomPresencePayload) =>
        applyRoomPresenceUpdate(payload)
      )

      const refreshConversations = (): void => scheduleConversationRefresh(meId)
      const refreshNotifications = (): void => scheduleNotificationRefresh()
      const refreshAll = (): void => {
        refreshNotifications()
        refreshConversations()
      }

      socket.on('message:new', (message: ServerMessage) => {
        void upsertServerMessage(message, { updateConversation: true, markDelivered: true })
      })
      socket.on('message:moderated', (payload: MessageModeratedPayload) => {
        if (
          !payload?.messageId ||
          !payload.roomId ||
          payload.status?.toUpperCase() !== 'REJECTED'
        ) {
          return
        }
        setMessages((previous) =>
          previous.map((message) =>
            message.id === payload.messageId && message.chatId === payload.roomId
              ? { ...message, content: MODERATED_MESSAGE_PLACEHOLDER }
              : message
          )
        )
        refreshConversations()
      })
      socket.on('message:sent', (payload: unknown) => {
        const message = extractServerMessage(payload)
        if (message) {
          void upsertServerMessage(message, { updateConversation: true, markDelivered: false })
        }
        refreshConversations()
      })
      ;['room:created', 'room:private', 'room:read', 'room:cleared'].forEach((eventName) => {
        socket?.on(eventName, refreshConversations)
      })
      socket.on('member:left', (payload: { roomId?: string }) => {
        if (payload?.roomId) refreshConversations()
      })
      socket.on('member:joined', (payload: { roomId?: string }) => {
        if (payload?.roomId) refreshConversations()
      })
      socket.on('room:left', (payload: { roomId?: string }) => {
        if (!payload?.roomId) return
        setChats((previous) => previous.filter((chat) => chat.id !== payload.roomId))
        if (selectedChatRef.current === payload.roomId) {
          selectedChatRef.current = null
          setSelectedChat(null)
        }
      })
      NOTIFICATION_SOCKET_EVENTS.forEach((eventName) => socket?.on(eventName, refreshAll))
      socket.onAny((eventName: string) => {
        const normalized = eventName.toLowerCase()
        if (
          normalized.includes('notification') ||
          normalized.includes('friend') ||
          normalized.includes('invite')
        ) {
          refreshAll()
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
    applyPresenceUpdate,
    applyRoomPresenceUpdate,
    authInitialized,
    currentUserId,
    loadConversations,
    scheduleConversationRefresh,
    scheduleNotificationRefresh,
    schedulePendingFlush,
    selectedChatRef,
    setChats,
    setMessages,
    setSelectedChat,
    setSocket,
    syncRoomMessages,
    upsertServerMessage
  ])
}
