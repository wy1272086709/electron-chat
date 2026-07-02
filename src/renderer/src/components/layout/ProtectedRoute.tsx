import { useState, useEffect, FC } from 'react'
import { secureStorageService } from '@renderer/services/secure-storage.service'
import { Navigate, Outlet } from 'react-router-dom'

// 创建受保护的路由组件
const ProtectedRoute: FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuthStatus: () => Promise<void> = async () => {
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '16px',
          color: '#666'
        }}
      >
        加载中...
      </div>
    )
  }

  // 根据登录状态重定向或显示受保护的子路由
  return isLoggedIn ? <Outlet /> : <Navigate to="/login" replace />
}

export default ProtectedRoute
