export type AppPanel = 'chat' | 'groups' | 'contacts' | 'notifications' | 'favorites'

export interface LayoutChat {
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
  peerUserId?: string
}

/**
 * 媒体消息分类（与后端 MessageType 的 IMAGE/FILE 对齐；TEXT 走 content）。
 * 缺省视为 TEXT，保持旧文本消息向后兼容。
 */
export type LayoutMessageType = 'TEXT' | 'IMAGE' | 'FILE'

/**
 * 本地消息投递状态：仅对「我」发出的消息有意义。
 * - uploading：媒体正在上传到对象存储（主进程 PUT 阶段）
 * - pending：已进入本地可靠发送队列，等待 socket 可用或下一次重试
 * - sending：已乐观上屏，等待服务端 ack（文本 / 已上传完成的媒体）
 * - sent：收到 message:sent 回执 / ack 成功
 * - failed：上传失败 / ack 超时或失败，可点击重发
 */
export type MessageDeliveryStatus = 'pending' | 'uploading' | 'sending' | 'sent' | 'failed'

/**
 * 媒体附件：图片 / 文件消息的元数据。
 * - objectName：对象存储 key（即消息的 fileUrl）。上传成功后才有；缺失表示上传未完成。
 * - localPreviewUrl：上传期间的 blob: 预览地址（仅「我」发出的乐观消息用，sent 后 revoke）。
 * - 其余字段对齐后端 Message：fileName/fileSize/fileType/mediaWidth/mediaHeight/thumbnailUrl。
 */
export interface MessageAttachment {
  messageType: Exclude<LayoutMessageType, 'TEXT'>
  objectName?: string
  localPreviewUrl?: string
  fileName: string
  fileSize: number
  fileType: string
  mediaWidth?: number
  mediaHeight?: number
  thumbnailUrl?: string
}

export interface LayoutMessage {
  id: string
  /** 前端生成的幂等 ID；重试必须复用，避免后端重复落库 */
  clientMessageId?: string
  chatId: string
  content: string
  /** 服务端原始创建时间；本地 pending 消息使用本地创建时间 */
  createdAt?: string
  time: string
  sender: 'me' | 'other'
  senderName?: string
  senderAvatar?: string
  status?: MessageDeliveryStatus
  /** 0-1 的真实上传字节进度；仅 uploading 状态存在。 */
  uploadProgress?: number
  /** 发送失败原因，用于红点提示和排查上传 / socket 失败 */
  errorMessage?: string
  /** 消息类型，缺省 TEXT；IMAGE/FILE 时 attachment 必有 */
  messageType?: LayoutMessageType
  /** 图片 / 文件附件元数据；文本消息无 */
  attachment?: MessageAttachment
}

export interface Favorite {
  id: string
  type: 'text' | 'image' | 'file' | 'chat'
  title: string
  content?: string
  fileName?: string
  fileSize?: string
  fileExt?: string
  thumbnail?: string
  source: string
  time: string
  chatId?: string
}
