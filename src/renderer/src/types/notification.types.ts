/**
 * 通知相关类型定义（对齐后端 notification 模块 / Prisma Notification 模型）
 * 详见 docs/user-http-api.md §3.2 及 NotificationController（/api/notifications）。
 */

// 通知类型：好友申请、群聊邀请
export type NotificationType = 'FRIEND_REQUEST' | 'GROUP_INVITATION'

// 通知处理结果：待处理、同意、拒绝
export type NotificationResult = 'PENDING' | 'ACCEPTED' | 'REJECTED'

// 发送者简要资料（GET /notifications 内嵌的 sender，含 email）
export interface NotificationSender {
  id: string
  username: string
  nickname?: string | null
  email?: string
  avatarUrl?: string | null
}

// extra 额外信息：加好友时的打招呼语等（JSON，结构不定）
export interface NotificationExtra {
  message?: string
  [key: string]: unknown
}

/**
 * 通知记录
 * - GET /notifications、GET /notifications/friendRequests 返回元素均含 sender 嵌套；
 * - POST /notifications/handleFriendRequest 返回的是裸记录（不含 sender），更新本地时需保留原 sender。
 */
export interface AppNotification {
  id: string
  type: NotificationType
  isRead: boolean
  result: NotificationResult
  /** 邀请对象 ID：好友申请时为对方用户 ID，群聊邀请时为 chat_room 的 ID */
  targetId: string
  /** 额外信息：加好友打招呼语等 */
  extra?: NotificationExtra | null
  receiverId: string
  senderId: string
  createdAt: string
  updatedAt: string
  sender?: NotificationSender
}

// 处理好友请求动作
export type FriendRequestAction = 'ACCEPTED' | 'REJECTED'
