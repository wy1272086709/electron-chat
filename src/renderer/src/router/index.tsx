import { createHashRouter, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import ChangePasswordPage from '../pages/ChangePasswordPage'
import MainLayout from '../pages/MainLayout'
import { secureStorageService } from '../services/secure-storage.service'

// 创建受保护的路由组件
const ProtectedRoute = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const loggedIn = await secureStorageService.getLoggedIn()
        setIsLoggedIn(loggedIn)
      } catch (error) {
        console.error('检查登录状态失败:', error)
        setIsLoggedIn(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuthStatus()
  }, [])

  // 显示加载状态
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '16px',
        color: '#666'
      }}>
        加载中...
      </div>
    )
  }

  // 根据登录状态重定向或显示主界面
  return isLoggedIn ? <MainLayout /> : <Navigate to="/login" replace />
}

const router = createHashRouter([
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/register',
    element: <RegisterPage />
  },
  {
    path: '/change-password',
    element: <ChangePasswordPage />
  },
  {
    path: '/',
    element: <ProtectedRoute />
  }
])

export default router
