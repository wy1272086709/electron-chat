import React, { useState } from 'react'

interface Notification {
  id: string
  type: 'add_friend' | 'join_group'
  title: string
  description: string
  time: string
  read: boolean
}

interface NotificationsProps {
  notifications: Notification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
}

const Notifications: React.FC<NotificationsProps> = ({
  notifications,
  onMarkRead,
  onMarkAllRead
}) => {
  const [selectedTab, setSelectedTab] = useState<'all' | 'unread'>('all')

  const filteredNotifications = notifications.filter(notification => {
    if (selectedTab === 'unread') {
      return !notification.read
    }
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length

  const handleMarkRead = (id: string) => {
    onMarkRead(id)
  }

  const handleAcceptFriend = (id: string) => {
    // In a real app, this would send an API request
    console.log('Accept friend request:', id)
    // Mark as read after accepting
    handleMarkRead(id)
  }

  const handleDeclineFriend = (id: string) => {
    // In a real app, this would send an API request
    console.log('Decline friend request:', id)
    // Remove from notifications
    // onMarkRead(id) // or remove entirely
  }

  const handleJoinGroup = (id: string) => {
    // In a real app, this would send an API request
    console.log('Join group:', id)
    handleMarkRead(id)
  }

  const formatTime = (time: string) => {
    // Mock format - in real app, parse actual date
    if (time.includes('分钟前')) {
      return time
    }
    if (time.includes('小时前')) {
      return time
    }
    return new Date(time).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="notifications-panel">
      {/* Header */}
      <div className="panel-header">
        <h2>通知</h2>
        <button
          className="mark-all-read-button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
        >
          标记全部已读
        </button>
      </div>

      {/* Tabs */}
      <div className="notifications-tabs">
        <button
          className={`notification-tab ${selectedTab === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedTab('all')}
        >
          全部
        </button>
        <button
          className={`notification-tab ${selectedTab === 'unread' ? 'active' : ''}`}
          onClick={() => setSelectedTab('unread')}
        >
          未读
          {unreadCount > 0 && (
            <span className="notification-badge">{unreadCount}</span>
          )}
        </button>
      </div>

      {/* Notifications List */}
      <div className="notifications-list">
        {filteredNotifications.length === 0 ? (
          <div className="empty-notifications">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.3 }}>
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            <p>暂无通知</p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`notification-item ${notification.read ? 'read' : ''}`}
            >
              {/* Notification Icon */}
              <div className={`notification-icon ${notification.type === 'add_friend' ? 'add-friend' : 'join-group'}`}>
                {notification.type === 'add_friend' ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                  </svg>
                )}
              </div>

              {/* Notification Content */}
              <div className="notification-content">
                <div className="notification-title-row">
                  <h3 className="notification-title">{notification.title}</h3>
                  <span className="notification-time">{formatTime(notification.time)}</span>
                </div>
                <p className="notification-description">{notification.description}</p>
              </div>

              {/* Actions */}
              {!notification.read && (
                <div className="notification-actions">
                  {notification.type === 'add_friend' ? (
                    <div className="friend-request-actions">
                      <button
                        className="action-button accept"
                        onClick={() => handleAcceptFriend(notification.id)}
                      >
                        接受
                      </button>
                      <button
                        className="action-button decline"
                        onClick={() => handleDeclineFriend(notification.id)}
                      >
                        拒绝
                      </button>
                    </div>
                  ) : (
                    <button
                      className="action-button accept"
                      onClick={() => handleJoinGroup(notification.id)}
                    >
                      加入
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <style>{`
        .mark-all-read-button {
          padding: 6px 12px;
          background-color: #2a2b3a;
          color: #666;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .mark-all-read-button:hover {
          background-color: #3a3b4a;
          color: white;
        }

        .mark-all-read-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .notifications-tabs {
          display: flex;
          gap: 24px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #33333c;
        }

        .notification-tab {
          position: relative;
          padding: 8px 0;
          background: none;
          border: none;
          color: #666;
          font-size: 15px;
          cursor: pointer;
          transition: color 0.3s ease;
        }

        .notification-tab.active {
          color: white;
        }

        .notification-badge {
          position: absolute;
          top: -4px;
          right: -20px;
          background: #ef4444;
          color: white;
          border-radius: 10px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: 600;
          min-width: 16px;
          text-align: center;
        }

        .notification-item.read {
          opacity: 0.6;
        }

        .notification-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .notification-time {
          font-size: 12px;
          color: #666;
        }

        .notification-actions {
          display: flex;
          gap: 8px;
          margin-left: auto;
        }

        .friend-request-actions {
          display: flex;
          gap: 8px;
        }

        .action-button {
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .action-button.accept {
          background-color: #10b981;
          color: white;
        }

        .action-button.accept:hover {
          background-color: #059669;
        }

        .action-button.decline {
          background-color: #ef4444;
          color: white;
        }

        .action-button.decline:hover {
          background-color: #dc2626;
        }

        .empty-notifications {
          text-align: center;
          padding: 60px 20px;
          color: #666;
        }

        .empty-notifications p {
          margin-top: 16px;
          font-size: 16px;
        }
      `}</style>
    </div>
  )
}

export default Notifications