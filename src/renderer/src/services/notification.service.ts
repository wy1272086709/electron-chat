/**
 * 通知服务
 *
 * 对接后端 NotificationController（详见 docs/user-http-api.md §3.2）。
 * baseURL 已含 /api，故以下路径均以 /notifications 开头。
 * 成败统一看返回体的 result 字段。
 */

import { request, type ElectronResponse } from './request'
import type { AppNotification, NotificationAction } from '../types/notification.types'

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

  /** 处理好友申请（同意 / 拒绝）POST /notifications/handleFriendRequest */
  async handleFriendRequest(
    notificationId: string,
    action: NotificationAction
  ): Promise<ElectronResponse<AppNotification>> {
    return request.post<AppNotification>('/notifications/handleFriendRequest', {
      notificationId,
      action
    })
  },

  /** 处理群聊邀请（同意 / 拒绝）POST /notifications/handleGroupInvitation */
  async handleGroupInvitation(
    notificationId: string,
    action: NotificationAction
  ): Promise<ElectronResponse<AppNotification>> {
    return request.post<AppNotification>('/notifications/handleGroupInvitation', {
      notificationId,
      action
    })
  }
}

export default notificationService
