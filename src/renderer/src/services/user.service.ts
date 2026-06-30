/**
 * 用户服务
 *
 * 处理用户信息、设置等功能
 * 同时包含第三方 API 调用示例
 */
import { request } from './request'
import type { ElectronResponse } from './request'
import type { PaginatedResponse, UserInfo } from '../types/api.types'
import type { UserGroup } from '../types/chat.types'

type LoginResponse = {
  access_token: string
  user: UserInfo
}

type RegisterResponse = {
  [key: string]: AnyType
}

type SendEmailResponse = {
  code: string
} | null

/**
 * 用户服务类
 */
export const userService = {
  /**
   * 获取用户信息
   * @param userId 用户 ID
   * @returns Promise<ElectronResponse<UserInfo | null>>
   */
  async getUserInfo(userId: string): Promise<ElectronResponse<UserInfo | null>> {
    return request.get<UserInfo | null>(`/users/${userId}`)
  },

  /**
   * 更新用户信息
   * @param data 更新数据
   * @returns Promise<ElectronResponse<UserInfo>>
   */
  async updateUserInfo(data: {
    nickname?: string
    avatarUrl?: string
    email?: string
    username?: string
  }): Promise<ElectronResponse<UserInfo>> {
    return request.post<UserInfo>('/users/saveProfile', data)
  },

  /**
   * 搜索用户
   * @param keyword 搜索关键词
   * @param page 页码
   * @param pageSize 每页数量
   * @returns Promise<ElectronResponse<PaginatedResponse<UserInfo>>>
   */
  async searchUsers(
    keyword: string,
    page = 1,
    pageSize = 20
  ): Promise<ElectronResponse<PaginatedResponse<UserInfo>>> {
    return request.get<PaginatedResponse<UserInfo>>('/users/search', {
      params: { keyword, page, pageSize }
    })
  },

  /**
   * 搜索好友
   * @param keyword 搜索关键词
   * @returns Promise<ElectronResponse<UserInfo>>
   */
  async searchFriend(keyword: string) {
    return request.post<UserInfo[]>('/users/searchFriend', { query: keyword })
  },

  /**
   * 发起好友申请 POST /users/addFriend
   * @param receiverId 接收好友申请的用户 ID
   * @param message 打招呼语
   * @returns Promise<ElectronResponse<null>>
   */
  async addFriend(receiverId: string, message?: string): Promise<ElectronResponse<null>> {
    return request.post<null>('/users/addFriend', { receiverId, message })
  },

  /**
   * 获取好友列表 GET /users/friends
   * @returns Promise<ElectronResponse<UserInfo[]>>
   */
  async getFriends(): Promise<ElectronResponse<UserInfo[]>> {
    return request.get<UserInfo[]>('/users/friends')
  },

  /**
   * 获取群聊列表（含角色与成员数）GET /users/groups
   * @returns Promise<ElectronResponse<UserGroup[]>>
   */
  async getGroups(): Promise<ElectronResponse<UserGroup[]>> {
    return request.get<UserGroup[]>('/users/groups')
  },

  async login(): Promise<ElectronResponse<LoginResponse>> {
    return request.post<LoginResponse>('/users/login')
  },

  async register(params: AnyType): Promise<ElectronResponse<RegisterResponse>> {
    return request.post<RegisterResponse>('/users/register', {
      ...params
    })
  },

  async sendEmail(to: string): Promise<ElectronResponse<SendEmailResponse>> {
    return request.post<SendEmailResponse>('/users/sendEmail', {
      to
    })
  },

  /**
   * 示例：调用第三方 AI 服务（如 OpenAI）
   * 注意：这是直接请求，需要服务端支持 CORS
   * @param prompt 用户输入
   * @returns Promise
   */
  async askAI(prompt: string) {
    // 使用 directRequest 直接请求第三方 API
    return request.directRequest({
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || 'your-api-key'}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000
      }
    })
  },

  /**
   * 示例：调用天气服务 API
   * @param city 城市名称
   * @returns Promise
   */
  async getWeather(city: string) {
    return request.directRequest({
      method: 'GET',
      url: 'https://api.openweathermap.org/data/2.5/weather',
      params: {
        q: city,
        appid: process.env.WEATHER_API_KEY || 'your-api-key',
        units: 'metric',
        lang: 'zh_cn'
      }
    })
  },
  async getPresignedUrl(filename: string) {
    return request.get<{ url: string }>(`/minio/presignedUrl?name=${filename}`)
  },
  async getAvatarUrl(fileName: string) {
    return request.get<{ url: string }>(`/minio/previewUrl?name=${fileName}`)
  }
}

export default userService
