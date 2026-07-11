import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoginLogo from '@renderer/components/auth/LoginLogo'
import InputField from '@renderer/components/auth/InputField'
import PasswordInput from '@renderer/components/auth/PasswordInput'
import LoginButton from '@renderer/components/auth/LoginButton'
import { authService } from '../services/auth.service'
import { EmailVerificationType } from '../types/api.types'

const ChangePasswordPage: React.FC = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const navigate = useNavigate()

  // 验证码发送倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [countdown])

  const validateForm: () => boolean = () => {
    if (!username || !email || !verificationCode || !newPassword || !confirmPassword) {
      setError('所有字段都必须填写')
      return false
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址')
      return false
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return false
    }

    if (newPassword.length < 6) {
      setError('新密码长度不能少于6位')
      return false
    }

    return true
  }

  // 发送验证码
  const handleSendCode = async (): Promise<void> => {
    if (!email) {
      setError('请先输入邮箱地址')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址')
      return
    }

    setSendingCode(true)
    setError('')
    setSuccessMessage('')

    try {
      console.log('[重置密码] 发送验证码到:', email)
      const response = await authService.sendVerificationCode(
        email,
        EmailVerificationType.FORGET_PASSWORD
      )

      console.log('[重置密码] 发送验证码成功:', response)

      if (response.result) {
        setSuccessMessage('验证码已发送，请查收邮箱')
        // 开始60秒倒计时
        setCountdown(60)
      } else {
        throw new Error(response.message || '发送验证码失败')
      }
    } catch (err: unknown) {
      console.error('[重置密码] 发送验证码失败:', err)

      let errorMessage = '发送验证码失败，请重试'

      if (err && typeof err === 'object') {
        const error = err as { error?: string; message?: string; code?: number }
        if (error.error) {
          errorMessage = error.error
        } else if (error.message) {
          errorMessage = error.message
        }
      } else if (typeof err === 'string') {
        errorMessage = err
      }

      setError(errorMessage)
    } finally {
      setSendingCode(false)
    }
  }

  const handleChangePassword = async (): Promise<void> => {
    if (!validateForm()) {
      return
    }

    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      console.log('[重置密码] 提交重置密码请求:', { username, email })

      // 调用重置密码 API（传递明文密码，后端负责加密）
      const response = await authService.resetPassword(
        email,
        verificationCode,
        username,
        confirmPassword, // passwordHash - 旧密码哈希（重置密码场景为空）
        newPassword // newPasswordHash - 新密码（传递明文，后端处理加密）
      )

      console.log('[重置密码] 重置密码成功:', response)

      if (response.result) {
        setSuccessMessage('密码重置成功，请使用新密码登录')

        // 延迟跳转到登录页面
        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 1500)
      } else {
        throw new Error(response.message || '重置密码失败')
      }
    } catch (err: unknown) {
      console.error('[重置密码] 重置密码失败:', err)

      let errorMessage = '重置密码失败，请重试'

      if (err && typeof err === 'object') {
        const error = err as { error?: string; message?: string; code?: number }
        if (error.error) {
          errorMessage = error.error
        } else if (error.message) {
          errorMessage = error.message
        }
      } else if (typeof err === 'string') {
        errorMessage = err
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleBackToHome: React.MouseEventHandler = (e: React.MouseEvent) => {
    e.preventDefault()
    navigate('/login')
  }

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo and Title Section */}
        <div className="login-section">
          <LoginLogo />
        </div>

        {/* Welcome Section */}
        <div className="login-section">
          <div className="welcome-section">
            <h1 className="welcome-title">忘记密码</h1>
            <p className="welcome-subtitle">请填写以下信息重置您的密码</p>
          </div>
        </div>

        {/* Username Input Section */}
        <div className="login-section">
          <InputField
            type="text"
            placeholder="请输入用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            label="用户名"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            }
            name="username"
          />
        </div>

        {/* Email Input Section */}
        <div className="login-section">
          <InputField
            type="email"
            placeholder="请输入邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            label="邮箱"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
            }
            name="email"
          />
        </div>

        {/* Verification Code Input Section */}
        <div className="login-section verification-group">
          <div>
            <label className="input-label">验证码</label>
          </div>
          <div className="verification-code-wrapper">
            <input
              type="text"
              className="verification-code-input"
              placeholder="请输入验证码"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={6}
            />
            <button
              type="button"
              className="verification-button"
              onClick={handleSendCode}
              disabled={!email || sendingCode || countdown > 0}
            >
              {countdown > 0 ? `${countdown}秒后重试` : sendingCode ? '发送中...' : '发送验证码'}
            </button>
          </div>
        </div>

        {/* New Password Input Section */}
        <div className="login-section">
          <div>
            <label className="input-label">新密码</label>
          </div>
          <PasswordInput
            placeholder="请输入新密码"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            label="新密码"
            name="newPassword"
          />
        </div>

        {/* Confirm New Password Input Section */}
        <div className="login-section">
          <div>
            <label className="input-label">确认新密码</label>
          </div>
          <PasswordInput
            placeholder="请确认新密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            label="确认密码"
            name="confirmPassword"
          />
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="login-section">
            <div className="success-message">{successMessage}</div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="login-section">
            <div className="error-message">{error}</div>
          </div>
        )}

        {/* Change Password Button */}
        <div className="login-section">
          <LoginButton
            onClick={handleChangePassword}
            loading={loading}
            disabled={
              !username ||
              !email ||
              !verificationCode ||
              !newPassword ||
              !confirmPassword ||
              loading
            }
          >
            重置密码
          </LoginButton>
        </div>

        {/* Back to Login Section */}
        <div className="login-section">
          <div className="register-section">
            <p className="register-text">
              返回登录
              <a href="#" className="register-link" onClick={handleBackToHome}>
                {' '}
                立即返回
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChangePasswordPage
