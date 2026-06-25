import React from 'react'

// 简化版本用于测试
const App: React.FC = () => {
  const isAuthenticated = localStorage.getItem('isLoggedIn') === 'true'

  return (
    <div>
      <h1>测试页面</h1>
      <p>登录状态: {isAuthenticated ? '已登录' : '未登录'}</p>
      <p>当前路径: {window.location.pathname}</p>
      <button
        onClick={() => {
          localStorage.setItem('isLoggedIn', 'true')
          localStorage.setItem('username', 'testuser')
          window.location.reload()
        }}
      >
        模拟登录
      </button>
      <button
        onClick={() => {
          localStorage.removeItem('isLoggedIn')
          localStorage.removeItem('username')
          window.location.reload()
        }}
      >
        退出登录
      </button>
    </div>
  )
}

export default App