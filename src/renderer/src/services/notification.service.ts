/**
 * 通知服务
 *
 * 对接后端 NotificationController（详见 docs/user-http-api.md §3.2）。
 * baseURL 已含 /api，故以下路径均以 /notifications 开头。
 * 成败统一看返回体的 result 字段。
 */

import { request, type ElectronResponse } from './request'
import type { AppNotification, FriendRequestAction } from '../types/notification.types'

/** markAllRead 返回的是 Prisma updateMany 结果 */
export interface MarkAllReadResult {
  count: number
}

/**
 * 通知服务
 */
export const notificationService = {
  /** 获取当前用户收到的所有通知（含 sender 嵌套）GET /notifications */
  async getNotifications(): Promise<ElectronResponse<AppNotification[]>> {
    return request.get<AppNotification[]>('/notifications')
  },

  /** 获取好友申请通知 GET /notifications/friendRequests */
  async getFriendRequests(): Promise<ElectronResponse<AppNotification[]>> {
    return request.get<AppNotification[]>('/notifications/friendRequests')
  },

  /** 标记单条已读 POST /notifications/markRead */
  async markRead(notificationId: string): Promise<ElectronResponse<AppNotification>> {
    return request.post<AppNotification>('/notifications/markRead', { notificationId })
  },

  /** 标记全部已读 POST /notifications/markAllRead */
  async markAllRead(): Promise<ElectronResponse<MarkAllReadResult>> {
    return request.post<MarkAllReadResult>('/notifications/markAllRead')
  },

  /** 处理好友申请（同意 / 拒绝）POST /notifications/handleFriendRequest */
  async handleFriendRequest(
    notificationId: string,
    action: FriendRequestAction
  ): Promise<ElectronResponse<AppNotification>> {
    return request.post<AppNotification>('/notifications/handleFriendRequest', {
      notificationId,
      action
    })
  }
}

export default notificationService
