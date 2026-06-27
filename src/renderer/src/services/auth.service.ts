/**
 * 认证服务
 *
 * 处理用户登录、注册、密码修改等认证相关功能
 */

import { request } from './request'
import { ApiResponse, UserInfo, TokenInfo, EmailVerificationType } from '../types/api.types'
import type { ElectronResponse } from './request'

// 登录参数
export interface LoginParams {
  account: string
  password: string
}

// 登录响应
export interface LoginResponse {
  user: UserInfo
  access_token: string
}

export type RegisterResponse = Pick<UserInfo, 'username' | 'email' | 'nickname'>

// 注册参数
export interface RegisterParams {
  username: string
  nickname: string
  email: string
  password: string
  confirmPassword: string
  code: string
}

// 修改密码参数
export interface ChangePasswordParams {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

// 发送验证码响应
export type SendCodeResponse = {
  code: string
} | null

/**
 * 认证服务类
 */
export const authService = {
  /**
   * 用户登录
   * @param params 登录参数
   * @returns Promise<ElectronResponse<LoginResponse>>
   */
  async login(params: LoginParams): Promise<ElectronResponse<LoginResponse>> {
    return request.post<LoginResponse>('/users/login', params)
  },

  /**
   * 用户注册
   * @param params 注册参数
   * @returns Promise<ElectronResponse<RegisterResponse>>
   */
  async register(params: RegisterParams): Promise<ElectronResponse<RegisterResponse>> {
    return request.post('/users/register', params)
  },

  /**
   * 登出
   * @returns Promise<ElectronResponse<ApiResponse<null>>>
   */
  async logout(): Promise<ElectronResponse<null>> {
    return request.post('/auth/logout')
  },

  /**
   * 修改密码
   * @param params 修改密码参数
   * @returns Promise<ElectronResponse<null>>
   */
  async changePassword(params: ChangePasswordParams): Promise<ElectronResponse<null>> {
    return request.post('/users/change-password', params)
  },

  /**
   * 发送验证码
   * @param email 邮箱地址
   * @returns Promise<ElectronResponse<ApiResponse<SendCodeResponse>>>
   */
  async sendVerificationCode(
    email: string,
    type: EmailVerificationType = EmailVerificationType.REGISTER
  ): Promise<ElectronResponse<SendCodeResponse>> {
    return request.post('/users/sendEmail', { to: email, type })
  },

  /**
   * 验证验证码
   * @param email 邮箱地址
   * @param code 验证码
   * @returns Promise<ElectronResponse<ApiResponse<boolean>>>
   */
  async verifyCode(email: string, code: string): Promise<ElectronResponse<ApiResponse<boolean>>> {
    return request.post<ApiResponse<boolean>>('/auth/verify-code', { email, code })
  },

  /**
   * 刷新 Token
   * @param refreshToken 刷新令牌
   * @returns Promise<ElectronResponse<ApiResponse<TokenInfo>>>
   */
  async refreshToken(refreshToken: string): Promise<ElectronResponse<TokenInfo>> {
    return request.post('/auth/refresh-token', { refreshToken })
  },

  /**
   * 获取当前用户信息
   * @returns Promise<ElectronResponse<ApiResponse<UserInfo>>>
   */
  async getCurrentUser(): Promise<ElectronResponse<UserInfo>> {
    return request.get('/auth/me')
  },

  /**
   * 重置密码
   * @param email 邮箱地址
   * @param code 验证码
   * @param username 用户名
   * @param password 密码
   * @param newPassword 新密码
   * @returns Promise<ElectronResponse<ApiResponse<null>>>
   */
  async resetPassword(
    email: string,
    code: string,
    username: string,
    confirmPassword: string,
    password: string
  ): Promise<ElectronResponse<null>> {
    return request.post('/users/forgetPassword', {
      email,
      code,
      username,
      confirmPassword,
      password
    })
  }
}

export default authService
