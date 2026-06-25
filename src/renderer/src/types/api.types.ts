/**
 * API 通用类型定义
 */

import { AxiosRequestConfig } from 'axios'

// 通用 API 响应结构
export interface ApiResponse<T = AnyType> {
  result: boolean
  data: T
  message?: string
  code?: number
  timestamp?: number
}

// 分页响应结构
export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// API 错误响应
export interface ApiError {
  result: false
  data: null
  message?: string
  code?: number
}

// 请求配置扩展（支持更多类型）
export interface RequestConfig extends AxiosRequestConfig {
  skipErrorHandler?: boolean // 跳过全局错误处理
  showError?: boolean // 是否显示错误提示
}

// Token 信息
export interface TokenInfo {
  accessToken: string
  refreshToken?: string
  expiresIn: number
}

// 用户信息
export interface UserInfo {
  id: string
  username: string
  nickname: string
  email: string
  avatar?: string
  createdAt?: string
  updatedAt?: string
}

export enum EmailVerificationType {
  REGISTER = 'register',
  FORGET_PASSWORD = 'forgetPassword'
}
