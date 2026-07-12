import React, { useEffect, useMemo, useState } from 'react'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import { userService } from '@renderer/services/user.service'
import type { UserInfo } from '@renderer/types/api.types'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'

interface AddFriendModalProps {
  onClose: () => void
  onAdded?: () => void
}

interface SearchUser {
  id: string
  name: string
  username: string
  avatar: string
}

const mapUser = async (user: UserInfo): Promise<SearchUser> => ({
  id: user.id,
  name: user.nickname || user.username,
  username: user.username,
  avatar: await resolveAvatarUrl(user.avatar || user.avatarUrl)
})

const AddFriendModal: React.FC<AddFriendModalProps> = ({ onClose, onAdded }) => {
  const [keyword, setKeyword] = useState('')
  const [users, setUsers] = useState<SearchUser[]>([])
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const trimmedKeyword = useMemo(() => keyword.trim(), [keyword])

  useEffect(() => {
    if (!trimmedKeyword) {
      return undefined
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      const res = await userService.searchFriend(trimmedKeyword)
      if (cancelled) return
      console.log('res->searchFriends:', res)
      if (res.result && res.data) {
        const list = await Promise.all(res.data.map(mapUser))
        if (cancelled) return
        setUsers(list)
      } else {
        setUsers([])
        setError(res.message || '搜索失败')
      }
      setLoading(false)
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmedKeyword])

  const handleSubmit = async (): Promise<void> => {
    if (!selectedUser || submitting) return

    setSubmitting(true)
    setError('')
    const res = await userService.addFriend(selectedUser.id, message.trim() || undefined)
    setSubmitting(false)

    if (res.result) {
      alert(res.message || '好友申请已发送')
      onAdded?.()
      onClose()
    } else {
      setError(res.message || '发送好友申请失败')
    }
  }

  return (
    <div className="add-friend-modal" role="dialog" aria-modal="true" aria-label="添加好友">
      <div className="add-friend-content">
        <div className="add-friend-header">
          <h3>添加好友</h3>
          <button className="add-friend-icon-button" onClick={onClose} title="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.29-6.29 1.42 1.41z" />
            </svg>
          </button>
        </div>

        <div className="add-friend-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16a6.471 6.471 0 0 0 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            value={keyword}
            onChange={(e) => {
              const nextKeyword = e.target.value
              setKeyword(nextKeyword)
              setSelectedUser(null)
              if (!nextKeyword.trim()) {
                setUsers([])
                setError('')
              }
            }}
            placeholder="搜索用户名或昵称"
            autoFocus
          />
        </div>

        <div className="add-friend-results">
          {!trimmedKeyword ? (
            <div className="add-friend-empty">输入用户名或昵称搜索用户</div>
          ) : loading ? (
            <div className="add-friend-empty">搜索中...</div>
          ) : users.length === 0 ? (
            <div className="add-friend-empty">{error || '未找到用户'}</div>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                className={`add-friend-user ${selectedUser?.id === user.id ? 'selected' : ''}`}
                onClick={() => setSelectedUser(user)}
              >
                <img
                  src={user.avatar || FriendAvatar}
                  alt={user.name}
                  onError={(e) => {
                    e.currentTarget.src = FriendAvatar
                  }}
                />
                <span>
                  <strong>{user.name}</strong>
                  <small>@{user.username}</small>
                </span>
                {selectedUser?.id === user.id && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>

        {selectedUser && (
          <textarea
            className="add-friend-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="打个招呼吧"
            rows={3}
          />
        )}

        {error && users.length > 0 && <div className="add-friend-error">{error}</div>}

        <div className="add-friend-actions">
          <button className="add-friend-cancel" onClick={onClose}>
            取消
          </button>
          <button
            className="add-friend-submit"
            onClick={handleSubmit}
            disabled={!selectedUser || submitting}
          >
            {submitting ? '发送中...' : '发送申请'}
          </button>
        </div>
      </div>

      <style>{`
        .add-friend-modal {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.45);
        }

        .add-friend-content {
          width: min(460px, calc(100vw - 32px));
          max-height: min(640px, calc(100vh - 32px));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #343548;
          border-radius: 8px;
          background: #1d1e2f;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
        }

        .add-friend-header {
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          border-bottom: 1px solid #2a2b3a;
        }

        .add-friend-header h3 {
          margin: 0;
          color: #f7f7fb;
          font-size: 18px;
          font-weight: 600;
        }

        .add-friend-icon-button {
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: #9ca3af;
          cursor: pointer;
        }

        .add-friend-icon-button:hover {
          background: #2a2b3a;
          color: #fff;
        }

        .add-friend-search {
          height: 46px;
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 20px 20px 12px;
          padding: 0 14px;
          border-radius: 23px;
          background: #2b2c3e;
          color: #7d8190;
        }

        .add-friend-search input {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          color: #f7f7fb;
          font-size: 14px;
        }

        .add-friend-search input::placeholder {
          color: #737685;
        }

        .add-friend-results {
          min-height: 180px;
          max-height: 260px;
          overflow-y: auto;
          padding: 0 12px;
        }

        .add-friend-empty {
          height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7d8190;
          font-size: 14px;
        }

        .add-friend-user {
          width: 100%;
          height: 64px;
          display: flex;
          align-items: center;
          gap: 12px;
          border: none;
          border-radius: 8px;
          padding: 0 10px;
          background: transparent;
          color: #f7f7fb;
          cursor: pointer;
          text-align: left;
        }

        .add-friend-user:hover,
        .add-friend-user.selected {
          background: #2a2b3a;
        }

        .add-friend-user img {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          object-fit: cover;
          flex: none;
        }

        .add-friend-user span {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .add-friend-user strong,
        .add-friend-user small {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .add-friend-user strong {
          font-size: 14px;
          font-weight: 600;
        }

        .add-friend-user small {
          color: #7d8190;
          font-size: 12px;
        }

        .add-friend-user > svg {
          color: var(--gradient-purple-start);
          flex: none;
        }

        .add-friend-message {
          margin: 12px 20px 0;
          padding: 12px;
          border: 1px solid #343548;
          border-radius: 8px;
          outline: none;
          resize: none;
          background: #242537;
          color: #f7f7fb;
          font-size: 14px;
        }

        .add-friend-message:focus {
          border-color: var(--gradient-purple-start);
        }

        .add-friend-message::placeholder {
          color: #737685;
        }

        .add-friend-error {
          margin: 12px 20px 0;
          color: #ef4444;
          font-size: 13px;
        }

        .add-friend-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 20px;
        }

        .add-friend-actions button {
          height: 36px;
          min-width: 84px;
          border-radius: 6px;
          border: none;
          font-size: 14px;
          cursor: pointer;
        }

        .add-friend-cancel {
          background: #2a2b3a;
          color: #d1d5db;
        }

        .add-friend-cancel:hover {
          background: #343548;
        }

        .add-friend-submit {
          background: var(--gradient-purple-start);
          color: #fff;
        }

        .add-friend-submit:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
      `}</style>
    </div>
  )
}

export default AddFriendModal
