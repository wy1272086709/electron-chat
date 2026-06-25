import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LoginLogo from '../components/LoginLogo'
import InputField from '../components/InputField'
import PasswordInput from '../components/PasswordInput'
import LoginButton from '../components/LoginButton'
import { authService } from '../services/auth.service'

const RegisterPage: React.FC = () => {
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const navigate = useNavigate()

  // 倒计时效果
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [countdown])

  const handleLoginClick = (e: React.MouseEvent) => {
    e.preventDefault()
    navigate('/login')
  }

  const validateForm = () => {
    if (!username || !nickname || !email || !password || !confirmPassword || !verificationCode) {
      setError('所有字段都必须填写')
      return false
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return false
    }

    if (password.length < 6) {
      setError('密码长度不能少于6位')
      return false
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址')
      return false
    }

    if (verificationCode.length !== 6) {
      setError('验证码必须是6位')
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
    setSuccess('')

    try {
      const response = await authService.sendVerificationCode(email)
      console.log('发送验证码响应:', response)
      if (response.result && response.data?.code) {
        setSuccess('验证码已发送到您的邮箱')
        // 开始倒计时（60秒）
        setCountdown(60)
      } else {
        setError(response.message || '发送验证码失败')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '发送验证码失败，请稍后重试'
      setError(errorMessage)
    } finally {
      setSendingCode(false)
    }
  }

  // 处理注册
  const handleRegister = async (): Promise<void> => {
    if (!validateForm()) {
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await authService.register({
        username,
        nickname,
        email,
        password,
        confirmPassword,
        code: verificationCode
      })

      if (response.result && response.data) {
        setSuccess('注册成功！正在跳转...')

        // 延迟跳转到登录页
        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 1500)
      } else {
        setError(response.message || '注册失败，请稍后重试')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '注册失败，请稍后重试'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
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
            <h1 className="welcome-title">创建账号</h1>
            <p className="welcome-subtitle">注册以开始使用 Nexus IM</p>
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

        {/* Nickname Input Section */}
        <div className="login-section">
          <InputField
            type="text"
            placeholder="请输入昵称"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            label="昵称"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
              </svg>
            }
            name="nickname"
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
          <label className="input-label">验证码</label>
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
              {countdown > 0 ? `${countdown}秒后重发` : sendingCode ? '发送中...' : '发送验证码'}
            </button>
          </div>
        </div>

        {/* Password Input Section */}
        <div className="login-section">
          <label className="input-label">密码</label>
          <PasswordInput
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            label="密码"
            name="password"
          />
        </div>

        {/* Confirm Password Input Section */}
        <div className="login-section">
          <label className="input-label">确认密码</label>
          <PasswordInput
            placeholder="请确认密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            label="确认密码"
            name="confirmPassword"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="login-section">
            <div className="error-message">{error}</div>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="login-section">
            <div className="success-message">{success}</div>
          </div>
        )}

        {/* Register Button */}
        <div className="login-section">
          <LoginButton
            onClick={handleRegister}
            loading={loading}
            disabled={
              !username ||
              !nickname ||
              !email ||
              !password ||
              !confirmPassword ||
              !verificationCode ||
              loading
            }
          >
            注册
          </LoginButton>
        </div>

        {/* Back to Login Section */}
        <div className="login-section">
          <div className="register-section">
            <p className="register-text">
              已有账号?
              <a href="#" className="register-link" onClick={handleLoginClick}>
                {' '}
                立即登录
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
