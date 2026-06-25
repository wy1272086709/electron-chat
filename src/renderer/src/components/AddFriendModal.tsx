import React, { useState, useEffect } from 'react'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import { userService } from '@renderer/services/user.service'
import type { UserInfo } from '@renderer/types/api.types'

interface User {
  id: string
  name: string
  avatar: string
  isOnline: boolean
  nickname?: string
  bio?: string
}

interface AddFriendModalProps {
  onClose: () => void
  onAddFriend?: (userId: string, reason?: string) => void
}

const AddFriendModal: React.FC<AddFriendModalProps> = ({ onClose, onAddFriend }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [addReason, setAddReason] = useState('')
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // 使用 searchFriend 接口搜索用户
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim()) {
        setFilteredUsers([])
        setSearchError(null)
        return
      }

      setIsLoading(true)
      setSearchError(null)

      try {
        const response = await userService.searchFriend(searchQuery.trim())

        if (response.result && response.data) {
          // 转换接口数据格式为组件需要的格式
          const users: User[] = response.data.list.map((userInfo: UserInfo) => ({
            id: userInfo.id,
            name: userInfo.nickname || userInfo.username || '未知用户',
            avatar: userInfo.avatar || FriendAvatar,
            isOnline: false, // 接口暂时没有 isOnline 字段
            nickname: userInfo.nickname,
            bio: undefined
          }))
          setFilteredUsers(users)
        } else {
          setFilteredUsers([])
          setSearchError(response.message || '搜索失败')
        }
      } catch (error) {
        console.error('搜索用户失败:', error)
        setFilteredUsers([])
        setSearchError('搜索失败，请稍后重试')
      } finally {
        setIsLoading(false)
      }
    }

    // 防抖处理：300ms 后再执行搜索
    const timer = setTimeout(() => {
      searchUsers()
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleAddFriend = () => {
    if (selectedUser && onAddFriend) {
      if (!addReason.trim()) {
        alert('请输入打招呼提示')
        return
      }
      onAddFriend(selectedUser.id, addReason.trim())
      onClose()
    }
  }

  return (
    <div className="add-friend-modal">
      <div className="add-friend-modal-content">
        {/* Header */}
        <div className="add-friend-header">
          <h2 className="add-friend-title">添加好友</h2>
          <button className="add-friend-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Search Box */}
        <div className="search-box-container">
          <svg
            className="search-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="搜索用户"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* User List */}
        <div className="user-list">
          {searchQuery ? (
            <>
              <div className="user-list-header">
                <h3>搜索结果</h3>
                <span className="user-count">{filteredUsers.length} 位用户</span>
              </div>

              {isLoading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>搜索中...</p>
                </div>
              ) : searchError ? (
                <div className="error-state">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4m0 4h.01" />
                  </svg>
                  <p>{searchError}</p>
                </div>
              ) : filteredUsers.length > 0 ? (
                <div className="user-items">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className={`user-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                      onClick={() => setSelectedUser(user)}
                    >
                      {/* User Avatar */}
                      <div className="user-avatar">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          onError={(e) => {
                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=6366f1&color=fff&size=48`
                          }}
                        />
                        {user.isOnline && <div className="online-indicator" />}
                      </div>

                      {/* User Info */}
                      <div className="user-info">
                        <div className="user-name-row">
                          <span className="user-name">{user.name}</span>
                          {user.isOnline && <span className="online-status">在线</span>}
                        </div>
                        <span className="user-id">ID: {user.id}</span>
                      </div>

                      {/* Selection Indicator */}
                      <div className="selection-indicator">
                        {selectedUser?.id === user.id && (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                          </svg>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-results">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p>未找到用户 &quot;{searchQuery}&quot;</p>
                  <p className="hint">请输入准确的用户名进行搜索</p>
                </div>
              )}
            </>
          ) : (
            <div className="search-prompt">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p>请输入用户名搜索好友</p>
              <p className="hint">支持精确搜索，请输入完整的用户名</p>
            </div>
          )}

          {/* Greeting Message Input - Only show when a user is selected */}
          {selectedUser && (
            <div className="add-reason-container">
              <label className="add-reason-label">
                打招呼提示 <span className="required">*</span>
              </label>
              <textarea
                className="add-reason-input"
                placeholder="请输入你想对他说的话..."
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
                rows={2}
                required
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="add-friend-actions">
          <button className="action-button secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="action-button primary"
            onClick={handleAddFriend}
            disabled={!selectedUser || !addReason.trim()}
          >
            添加好友
          </button>
        </div>
        <style>{`
          .no-results,
          .search-prompt,
          .loading-state,
          .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            text-align: center;
            color: #6b7280;
          }

          .no-results svg,
          .search-prompt svg,
          .error-state svg {
            margin-bottom: 16px;
            opacity: 0.5;
          }

          .loading-state svg {
            margin-bottom: 16px;
          }

          .no-results p,
          .search-prompt p,
          .loading-state p,
          .error-state p {
            margin: 8px 0;
            font-size: 16px;
          }

          .no-results .hint,
          .search-prompt .hint {
            font-size: 14px;
            color: #9ca3af;
            margin-top: 4px;
          }

          .loading-state .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid #e5e7eb;
            border-top-color: #6366f1;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-bottom: 16px;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }

          .error-state {
            color: #ef4444;
          }

          .error-state svg {
            color: #ef4444;
            opacity: 1;
          }

          .add-reason-container {
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
          }

          .add-reason-container label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: #374151;
            margin-bottom: 8px;
          }

          .required {
            color: #ef4444;
            margin-left: 4px;
          }

          .add-reason-input:invalid {
            border-color: #ef4444;
          }

          .add-reason-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            resize: vertical;
            min-height: 60px;
            box-sizing: border-box;
          }

          .add-reason-input:focus {
            outline: none;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
          }

          .action-button.primary:disabled {
            background-color: #9ca3af;
            cursor: not-allowed;
            opacity: 0.6;
          }
        `}</style>
      </div>
    </div>
  )
}

export default AddFriendModal
