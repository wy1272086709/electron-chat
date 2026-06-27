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

// ===== 后端接口数据结构（对齐 docs/chat-http-api.md、docs/user-http-api.md）=====

// 用户简要资料（消息发送者 / 房间成员内嵌）
export interface ChatUserBrief {
  id: string
  username: string
  nickname?: string | null
  avatarUrl?: string | null
}

// 会话列表中的成员引用（含对方资料）
export interface RoomMemberRef {
  userId: string
  user: ChatUserBrief
  role?: 'OWNER' | 'MEMBER'
  status?: string
  joinedAt?: string
  lastReadAt?: string | null
}

// 会话列表项（GET /chat/rooms）
export interface Conversation {
  room: {
    id: string
    name: string
    topic?: string | null // 'GROUP' | 'PRIVATE'，用于区分群/私聊
    members?: RoomMemberRef[]
  }
  role?: 'OWNER' | 'MEMBER'
  lastReadAt?: string | null
  clearedAt?: string | null
  lastMessage?: {
    id: string
    content?: string
    messageType?: string
    senderId: string
    createdAt: string
    sender?: ChatUserBrief
  } | null
  unreadCount?: number
}

// 房间成员（GET /chat/rooms/:roomId/members）
export interface RoomMember {
  id: string
  roomId: string
  userId: string
  role: string
  status: string
  joinedAt: string
  lastReadAt?: string | null
  user?: ChatUserBrief
}

// 历史消息（GET /chat/rooms/:roomId/messages）
export interface ChatMessage {
  id: string
  roomId: string
  senderId: string
  content?: string
  messageType?: string
  fileUrl?: string | null
  fileName?: string | null
  isDeleted?: boolean
  createdAt: string
  sender?: ChatUserBrief
}

// 清空状态（POST /chat/rooms/:roomId/clear）
export interface ChatClearState {
  id: string
  roomId: string
  userId: string
  clearedAt: string
}

// 创建群聊 / 私聊房间返回结构
export interface ChatRoomResult {
  id: string
  name: string
  description?: string | null
  topic?: string | null
  ownerId?: string
  createdBy?: string
  isArchived?: boolean
  createdAt?: string
  updatedAt?: string
  members?: RoomMember[]
}

// 创建群聊参数
export interface CreateGroupRoomParams {
  name: string
  description?: string
  memberIds?: string[]
}

// 群聊列表项（GET /users/groups）
export interface UserGroup {
  id: string
  name: string
  description?: string | null
  topic?: string | null
  ownerId?: string
  isArchived?: boolean
  createdAt?: string
  updatedAt?: string
  role?: 'OWNER' | 'MEMBER'
  joinedAt?: string
  memberCount?: number
}
