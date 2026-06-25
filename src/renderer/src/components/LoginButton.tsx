import React from 'react'

type ButtonType = 'register' | 'login';

interface LoginButtonProps {
  onClick: () => Promise<void> | void
  disabled?: boolean
  loading?: boolean
  className?: string
  children?: React.ReactNode
  type?: ButtonType
}

const LoginButton: React.FC<LoginButtonProps> = ({
  onClick,
  disabled = false,
  loading = false,
  className = '',
  type = 'login',
  children
}) => {
  const handleClick: () => Promise<void> | void = async () => {
    if (!disabled && !loading) {
      try {
        await onClick()
      } catch (error) {
        console.error('Login error:', error)
      }
    }
  }
  const textMap = {
    register: '注册',
    login: '登录'
  }
  return (
    <button
      className={`login-button ${className}`}
      onClick={handleClick}
      disabled={disabled || loading}
    >
      {['register', 'login'].includes(type) && loading ? `${textMap[type]}中...` : children}
    </button>
  )
}

export default LoginButton