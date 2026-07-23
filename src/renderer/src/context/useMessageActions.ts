import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { uploadMedia } from '@renderer/services/upload.service'
import type {
  LayoutChat,
  LayoutMessage,
  LayoutMessageType,
  MessageDeliveryStatus
} from '@renderer/types/layout.types'
import { isImageFile } from '@renderer/utils/file-meta'
import { formatHM } from './layoutContext.helpers'
import {
  createClientMessageId,
  mediaPayloadFromAttachment,
  type PendingReliableMessage
} from './layoutContext.runtime'

interface UseMessageActionsOptions {
  selectedChatRef: MutableRefObject<string | null>
  chatsRef: MutableRefObject<LayoutChat[]>
  messagesRef: MutableRefObject<LayoutMessage[]>
  pendingFilesRef: MutableRefObject<Map<string, File>>
  setMessages: Dispatch<SetStateAction<LayoutMessage[]>>
  upsertPendingMessage: (item: PendingReliableMessage) => void
  schedulePendingFlush: (delay?: number) => void
  setLocalMessageStatusByClientId: (
    clientMessageId: string,
    status: MessageDeliveryStatus,
    errorMessage?: string,
    localId?: string
  ) => void
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useMessageActions(options: UseMessageActionsOptions) {
  const {
    selectedChatRef,
    chatsRef,
    messagesRef,
    pendingFilesRef,
    setMessages,
    upsertPendingMessage,
    schedulePendingFlush,
    setLocalMessageStatusByClientId
  } = options

  const setMessageStatus = useCallback(
    (messageId: string, status: MessageDeliveryStatus, errorMessage?: string): void => {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? {
                ...message,
                status,
                errorMessage: status === 'failed' ? errorMessage : undefined
              }
            : message
        )
      )
    },
    [setMessages]
  )

  const sendMessage = useCallback(
    (content: string): void => {
      const trimmed = content.trim()
      const chatId = selectedChatRef.current
      if (!trimmed || !chatId) return
      const chat = chatsRef.current.find((item) => item.id === chatId)
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
      setMessages((previous) => [
        ...previous,
        {
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
      ])
      upsertPendingMessage(pending)
      schedulePendingFlush()
    },
    [chatsRef, schedulePendingFlush, selectedChatRef, setMessages, upsertPendingMessage]
  )

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
          setMessages((previous) =>
            previous.map((message) =>
              message.id === localId ? { ...message, uploadProgress: progress } : message
            )
          )
        })
        const chat = chatsRef.current.find((item) => item.id === chatId)
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
        setMessages((previous) =>
          previous.map((message) =>
            message.id === localId && message.attachment
              ? {
                  ...message,
                  status: 'pending',
                  uploadProgress: undefined,
                  attachment: {
                    ...message.attachment,
                    objectName: prepared.objectName,
                    fileSize: prepared.fileSize,
                    fileType: prepared.fileType,
                    mediaWidth: prepared.mediaWidth,
                    mediaHeight: prepared.mediaHeight,
                    thumbnailUrl: prepared.thumbnailUrl
                  }
                }
              : message
          )
        )
        upsertPendingMessage(pending)
        schedulePendingFlush()
      } catch (error) {
        console.error('[Layout] 媒体上传失败:', error)
        setMessageStatus(localId, 'failed', error instanceof Error ? error.message : '媒体上传失败')
      }
    },
    [chatsRef, schedulePendingFlush, setMessageStatus, setMessages, upsertPendingMessage]
  )

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
      setMessages((previous) => [
        ...previous,
        {
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
      ])
      pendingFilesRef.current.set(localId, file)
      void runAttachmentUpload(localId, clientMessageId, chatId, file, trimmedCaption || undefined)
    },
    [pendingFilesRef, runAttachmentUpload, selectedChatRef, setMessages]
  )

  const retrySendMessage = useCallback(
    (messageId: string): void => {
      const target = messagesRef.current.find((message) => message.id === messageId)
      if (!target || target.sender !== 'me') return
      const clientMessageId = target.clientMessageId || createClientMessageId()
      const chat = chatsRef.current.find((item) => item.id === target.chatId)

      if (target.attachment?.objectName) {
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
        return
      }

      if (target.attachment) {
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
        return
      }

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
    },
    [
      chatsRef,
      messagesRef,
      pendingFilesRef,
      runAttachmentUpload,
      schedulePendingFlush,
      setLocalMessageStatusByClientId,
      setMessageStatus,
      upsertPendingMessage
    ]
  )

  return { sendMessage, sendAttachment, retrySendMessage }
}
