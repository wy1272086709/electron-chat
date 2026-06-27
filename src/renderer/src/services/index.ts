/**
 * 服务模块统一导出
 *
 * 提供了一个便捷的入口来导入所有服务
 */

// 统一请求服务
export { request } from './request'
export type { RequestConfig } from './request'

// 安全存储服务
export { secureStorageService } from './secure-storage.service'
export type { STORAGE_KEYS } from './secure-storage.service'

// 业务服务
export { authService } from './auth.service'
export { chatService } from './chat.service'
export { userService } from './user.service'
export { notificationService } from './notification.service'

// 类型导出
export type {
  ApiResponse,
  PaginatedResponse,
  ApiError,
  RequestConfig as ApiRequestConfig,
  TokenInfo,
  UserInfo,
} from '../types/api.types'

export type {
  Chat,
  Message,
  ChatListItem,
  SendMessageParams,
  GetMessagesParams,
  ChatType,
  MessageType,
  MessageStatus,
} from '../types/chat.types'

// 服务类型导出
export type { LoginParams, RegisterParams, ChangePasswordParams } from './auth.service'
