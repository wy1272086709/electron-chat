/**
 * 聊天服务
 *
 * 处理聊天会话、消息发送、接收等功能
 */

import { request } from './request'
import type { ApiResponse, PaginatedResponse } from '../types/api.types'
import type {
  Chat,
  Message,
  ChatListItem,
  SendMessageParams,
  GetMessagesParams,
} from '../types/chat.types'

/**
 * 聊天服务类
 */
export const chatService = {
  /**
   * 获取聊天列表
   * @returns Promise<ApiResponse<ChatListItem[]>>
   */
  async getChatList(): Promise<ApiResponse<ChatListItem[]>> {
    return request.get<ApiResponse<ChatListItem[]>>('/chats')
  },

  /**
   * 获取单个聊天详情
   * @param chatId 聊天 ID
   * @returns Promise<ApiResponse<Chat>>
   */
  async getChatDetail(chatId: string): Promise<ApiResponse<Chat>> {
    return request.get<ApiResponse<Chat>>(`/chats/${chatId}`)
  },

  /**
   * 创建聊天
   * @param data 聊天数据
   * @returns Promise<ApiResponse<Chat>>
   */
  async createChat(data: {
    type: 'private' | 'group'
    name?: string
    memberIds?: string[]
  }): Promise<ApiResponse<Chat>> {
    return request.post<ApiResponse<Chat>>('/chats', data)
  },

  /**
   * 更新聊天信息
   * @param chatId 聊天 ID
   * @param data 更新数据
   * @returns Promise<ApiResponse<Chat>>
   */
  async updateChat(
    chatId: string,
    data: { name?: string; avatar?: string }
  ): Promise<ApiResponse<Chat>> {
    return request.put<ApiResponse<Chat>>(`/chats/${chatId}`, data)
  },

  /**
   * 删除聊天
   * @param chatId 聊天 ID
   * @returns Promise<ApiResponse>
   */
  async deleteChat(chatId: string): Promise<ApiResponse<null>> {
    return request.delete<ApiResponse<null>>(`/chats/${chatId}`)
  },

  /**
   * 获取消息历史
   * @param params 获取消息参数
   * @returns Promise<ApiResponse<PaginatedResponse<Message>>>
   */
  async getMessages(
    params: GetMessagesParams
  ): Promise<ApiResponse<PaginatedResponse<Message>>> {
    const { chatId, page = 1, pageSize = 50, beforeTime } = params
    return request.get<ApiResponse<PaginatedResponse<Message>>>(`/chats/${chatId}/messages`, {
      params: { page, pageSize, beforeTime },
    })
  },

  /**
   * 发送消息
   * @param params 发送消息参数
   * @returns Promise<ApiResponse<Message>>
   */
  async sendMessage(params: SendMessageParams): Promise<ApiResponse<Message>> {
    const { chatId, ...data } = params
    return request.post<ApiResponse<Message>>(`/chats/${chatId}/messages`, data)
  },

  /**
   * 撤回消息
   * @param chatId 聊天 ID
   * @param messageId 消息 ID
   * @returns Promise<ApiResponse>
   */
  async recallMessage(chatId: string, messageId: string): Promise<ApiResponse<null>> {
    return request.post<ApiResponse<null>>(`/chats/${chatId}/messages/${messageId}/recall`)
  },

  /**
   * 删除消息
   * @param chatId 聊天 ID
   * @param messageId 消息 ID
   * @returns Promise<ApiResponse>
   */
  async deleteMessage(chatId: string, messageId: string): Promise<ApiResponse<null>> {
    return request.delete<ApiResponse<null>>(`/chats/${chatId}/messages/${messageId}`)
  },

  /**
   * 标记消息已读
   * @param chatId 聊天 ID
   * @param messageId 消息 ID
   * @returns Promise<ApiResponse>
   */
  async markMessageAsRead(chatId: string, messageId: string): Promise<ApiResponse<null>> {
    return request.post<ApiResponse<null>>(
      `/chats/${chatId}/messages/${messageId}/read`
    )
  },

  /**
   * 批量标记消息已读
   * @param chatId 聊天 ID
   * @returns Promise<ApiResponse>
   */
  async markAllMessagesAsRead(chatId: string): Promise<ApiResponse<null>> {
    return request.post<ApiResponse<null>>(`/chats/${chatId}/messages/read-all`)
  },

  /**
   * 上传文件（图片、文档等）
   * @param file 文件对象
   * @param type 文件类型
   * @returns Promise<ApiResponse<{ url: string }>>
   */
  async uploadFile(
    file: File,
    type: 'image' | 'document' | 'video' | 'voice'
  ): Promise<ApiResponse<{ url: string }>> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)

    return request.post<ApiResponse<{ url: string }>>('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  /**
   * 获取在线用户列表
   * @returns Promise<ApiResponse<string[]>>
   */
  async getOnlineUsers(): Promise<ApiResponse<string[]>> {
    return request.get<ApiResponse<string[]>>('/chats/online-users')
  },

  /**
   * 添加好友
   * @param userId 用户 ID
   * @returns Promise<ApiResponse<Chat>>
   */
  async addFriend(userId: string): Promise<ApiResponse<Chat>> {
    return request.post<ApiResponse<Chat>>('/chats/add-friend', { userId })
  },

  /**
   * 移除好友
   * @param chatId 聊天 ID
   * @returns Promise<ApiResponse>
   */
  async removeFriend(chatId: string): Promise<ApiResponse<null>> {
    return request.post<ApiResponse<null>>(`/chats/${chatId}/remove-friend`)
  },
}

export default chatService
