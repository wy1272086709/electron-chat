import React from 'react'
import AvaterSvg from '@renderer/assets/avatar.svg'
import { useNavigate } from 'react-router-dom'
import { secureStorageService } from '@renderer/services/secure-storage.service'
import type { AppPanel } from '@renderer/types/layout.types'
import type { Profile } from '@renderer/hooks/useProfile'

interface LeftPanelProps {
  activePanel: AppPanel
  setActivePanel: (panel: AppPanel) => void
  notificationBadgeCount: number
  setShowProfileModal: (show: boolean) => void
  profile: Profile
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  activePanel,
  setActivePanel,
  notificationBadgeCount,
  setShowProfileModal,
  profile
}) => {
  const navigate = useNavigate()
  const navItems: Array<{
    id: AppPanel
    icon: React.ReactNode
    label: string
    badge?: boolean
  }> = [
    {
      id: 'chat',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      ),
      label: '好友'
    },
    {
      id: 'groups',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      ),
      label: '群聊'
    },
    {
      id: 'contacts',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 0H4v2h16V0zM4 24h16v-2H4v2zM20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 2.75c1.24 0 2.25 1.01 2.25 2.25 0 1.24-1.01 2.25-2.25 2.25S9.75 10.24 9.75 9 10.76 6.75 12 6.75zM17 17H7v-1.5c0-1.67 3.33-2.5 5-2.5s5 .83 5 2.5V17z" />
        </svg>
      ),
      label: '通讯录'
    },
    {
      id: 'notifications',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
      ),
      label: '通知',
      badge: true
    },
    {
      id: 'favorites',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ),
      label: '收藏'
    }
  ]

  return (
    <div className="left-panel">
      {/* Navigation Items */}
      <div>
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${activePanel === item.id ? 'active' : ''}`}
            onClick={() => setActivePanel(item.id)}
            title={item.label}
          >
            {item.icon}
            {item.badge && notificationBadgeCount > 0 && (
              <span className="notification-badge">{notificationBadgeCount}</span>
            )}
          </div>
        ))}
      </div>

      {/* Profile Section */}
      <div className="profile-section">
        <div className="profile-avatar" onClick={() => setShowProfileModal(true)} title="个人资料">
          <img src={profile.avatar || AvaterSvg} alt="Profile" />
        </div>
        <div
          className="logout-button"
          onClick={async () => {
            // 使用安全存储服务清除登录状态
            secureStorageService.clearAuthData()
            console.log('Current path before navigation:', window.location.pathname)
            navigate('/login', { replace: true })
            console.log('Navigation called, new path will be:', window.location.pathname)
          }}
          title="退出登录"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default LeftPanel
