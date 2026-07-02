import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoginLogo from '../components/LoginLogo'
import InputField from '../components/InputField'
import PasswordInput from '../components/PasswordInput'
import LoginButton from '../components/LoginButton'
import { authService } from '../services/auth.service'
import { secureStorageService } from '../services/secure-storage.service'

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const validateForm = () => {
    if (!email || !password) {
      setError('所有字段都必须填写')
      return false
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址')
      return false
    }

    if (password.length < 6) {
      setError('密码长度不能少于6位')
      return false
    }

    return true
  }

  const handleLogin = async (): Promise<void> => {
    if (!validateForm()) {
      return
    }

    setLoading(true)
    setError('')

    try {
      console.log('[登录] 发送登录请求:', { email })

      // 调用真实的登录 API
      const response = await authService.login({ account: email, password })

      console.log('[登录] 请求成功:', response)

      if (response.result) {
        const { user } = response.data || {}

        // token 由 request.ts 从响应头 Authorization 统一保存
        await secureStorageService.setLoggedIn(true)
        await secureStorageService.setUserEmail(email)

        // 只在有用户信息时存储
        if (user) {
          await secureStorageService.setUserInfo(user)
        }

        // 登录成功后跳转到主页
        navigate('/', { replace: true })
        console.log('[登录] 跳转到主页')
      } else {
        throw new Error(response.message || '登录失败')
      }
    } catch (err: unknown) {
      console.error('[登录] 登录失败:', err)

      // 处理错误信息
      let errorMessage = '登录失败，请重试'

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

  const handleRegisterClick = (e: React.MouseEvent) => {
    e.preventDefault()
    navigate('/register')
  }

  const handleChangePasswordClick = (e: React.MouseEvent) => {
    e.preventDefault()
    navigate('/change-password')
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
            <h1 className="welcome-title">欢迎回来</h1>
            <p className="welcome-subtitle">登录以继续使用 Nexus IM</p>
          </div>
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

        {/* Error Message */}
        {error && (
          <div className="login-section">
            <div className="error-message">{error}</div>
          </div>
        )}

        {/* Links Section */}
        <div className="login-section">
          <div className="flex justify-between">
            <a href="#" className="register-link" onClick={handleChangePasswordClick}>
              忘记密码?
            </a>
            <a href="#" className="register-link" onClick={handleRegisterClick}>
              注册账号
            </a>
          </div>
        </div>

        {/* Login Button */}
        <div className="login-section">
          <LoginButton
            onClick={handleLogin}
            loading={loading}
            disabled={!email || !password || loading}
          >
            登录
          </LoginButton>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
