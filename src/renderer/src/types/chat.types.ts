/**
 * 聊天相关类型定义
 */

// 聊天类型枚举
export type ChatType = 'private' | 'group'

// 消息类型枚举
export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'video' | 'system'

// 消息状态
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

// 聊天会话信息
export interface Chat {
  id: string
  name: string
  avatar: string
  type: ChatType
  lastMessage?: string
  lastMessageTime?: number
  unreadCount?: number
  isOnline?: boolean
  members?: string[] // 群组成员 ID 列表
  createdAt?: number
  updatedAt?: number
}

// 消息内容
export interface Message {
  id: string
  chatId: string
  content: string
  type: MessageType
  senderId: string
  senderName?: string
  senderAvatar?: string
  receiverId?: string
  timestamp: number
  status?: MessageStatus
  isDeleted?: boolean
  fileUrl?: string
  fileName?: string
  fileSize?: number
  replyTo?: string // 回复的消息 ID
  reactions?: Reaction[] // 消息表情反应
}

// 消息反应（表情回应）
export interface Reaction {
  emoji: string
  count: number
  users: string[] // 用户 ID 列表
}

// 聊天列表项
export interface ChatListItem extends Chat {
  lastMessage?: string
  lastMessageTime?: number
  unread?: number
}

// 发送消息参数
export interface SendMessageParams {
  chatId: string
  content: string
  type?: MessageType
  replyTo?: string
  fileUrl?: string
  fileName?: string
  fileSize?: number
}

// 获取消息历史参数
export interface GetMessagesParams {
  chatId: string
  page?: number
  pageSize?: number
  beforeTime?: number // 获取指定时间之前的消息
}

// 聊天事件类型
export type ChatEventType =
  | 'message:new'
  | 'message:read'
  | 'message:deleted'
  | 'chat:created'
  | 'chat:updated'
  | 'member:joined'
  | 'member:left'
  | 'typing:start'
  | 'typing:stop'

// 聊天事件
export interface ChatEvent {
  type: ChatEventType
  chatId: string
  data: any
  timestamp: number
}
