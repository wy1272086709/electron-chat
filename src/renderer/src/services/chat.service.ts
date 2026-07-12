/**
 * 聊天服务
 *
 * 对接后端 ChatController（详见 docs/chat-http-api.md）。
 * baseURL 已含 /api，故以下路径均以 /chat 开头。
 * 成败统一看返回体的 result 字段。
 */

import { request, type ElectronResponse } from './request'
import type {
  Conversation,
  ChatMessage,
  ChatMessageSyncResult,
  RoomMember,
  ChatClearState,
  ChatRoomResult,
  CreateGroupRoomParams,
  LeaveRoomResult
} from '../types/chat.types'

/**
 * 聊天服务
 */
export const chatService = {
  /** 3.3 会话列表 GET /chat/rooms */
  async getConversations(): Promise<ElectronResponse<Conversation[]>> {
    return request.get<Conversation[]>('/chat/rooms')
  },

  /** 3.4 历史消息 GET /chat/rooms/:roomId/messages?take=（返回 createdAt desc，新的在前） */
  async getMessages(roomId: string, take = 50): Promise<ElectronResponse<ChatMessage[]>> {
    return request.get<ChatMessage[]>(`/chat/rooms/${roomId}/messages`, {
      params: { take }
    })
  },

  /** 可靠投递补拉 GET /chat/rooms/:roomId/messages/sync?afterMessageId=&take= */
  async syncMessages(
    roomId: string,
    afterMessageId?: string,
    take = 100
  ): Promise<ElectronResponse<ChatMessageSyncResult>> {
    return request.get<ChatMessageSyncResult>(`/chat/rooms/${roomId}/messages/sync`, {
      params: { take, ...(afterMessageId ? { afterMessageId } : {}) }
    })
  },

  /** 3.5 成员列表 GET /chat/rooms/:roomId/members */
  async getRoomMembers(roomId: string): Promise<ElectronResponse<RoomMember[]>> {
    return request.get<RoomMember[]>(`/chat/rooms/${roomId}/members`)
  },

  /** 3.6 标记已读 POST /chat/rooms/:roomId/read */
  async markRoomRead(roomId: string): Promise<ElectronResponse<RoomMember>> {
    return request.post<RoomMember>(`/chat/rooms/${roomId}/read`)
  },

  /** 3.7 清空聊天（软清空，仅对当前用户隐藏）POST /chat/rooms/:roomId/clear */
  async clearRoom(roomId: string): Promise<ElectronResponse<ChatClearState>> {
    return request.post<ChatClearState>(`/chat/rooms/${roomId}/clear`)
  },

  /** 3.8 退出群聊 POST /chat/rooms/:roomId/leave（群主退出自动转让，最后一人退出则解散） */
  async leaveGroup(roomId: string): Promise<ElectronResponse<LeaveRoomResult>> {
    return request.post<LeaveRoomResult>(`/chat/rooms/${roomId}/leave`)
  },

  /** 邀请成员加入群聊 POST /chat/rooms/:roomId/invitations（发通知，待对方确认） */
  async inviteMembers(
    roomId: string,
    memberIds: string[]
  ): Promise<ElectronResponse<{ notificationIds?: string[]; invitedMemberIds?: string[] }>> {
    return request.post<{ notificationIds?: string[]; invitedMemberIds?: string[] }>(
      `/chat/rooms/${roomId}/invitations`,
      {
        memberIds
      }
    )
  },

  /** 兼容旧的直接加人接口，仅用于后端管理场景；普通邀请成员不要调用这个方法 */
  async addMembersDirectly(
    roomId: string,
    memberIds: string[]
  ): Promise<ElectronResponse<{ addedMemberIds: string[] }>> {
    return request.post<{ addedMemberIds: string[] }>(`/chat/rooms/${roomId}/members`, {
      memberIds
    })
  },

  /** 3.1 创建群聊 POST /chat/rooms/group */
  async createGroupRoom(data: CreateGroupRoomParams): Promise<ElectronResponse<ChatRoomResult>> {
    return request.post<ChatRoomResult>('/chat/rooms/group', data)
  },

  /** 3.2 发起 / 获取私聊会话 POST /chat/rooms/private */
  async createPrivateRoom(receiverId: string): Promise<ElectronResponse<ChatRoomResult>> {
    return request.post<ChatRoomResult>('/chat/rooms/private', { receiverId })
  }
}

export default chatService
