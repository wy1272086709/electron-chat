import React, { useEffect, useState } from 'react'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import { userService } from '@renderer/services/user.service'
import { useChatContext } from '@renderer/context/LayoutContext'
import type { UserInfo } from '@renderer/types/api.types'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'

/** 调用方可传入的已有快照（如通讯录项），用于在拉取完成前占位展示 */
interface FriendProfileSnapshot {
  name?: string
  username?: string
  avatar?: string
}

interface FriendProfileModalProps {
  userId: string
  initialSnapshot?: FriendProfileSnapshot
  onClose: () => void
  /** 删除好友成功后的回调（通讯录用它刷新本地好友列表） */
  onRemoved?: () => void
}

/**
 * 好友资料弹窗：拉取并展示好友公开资料，提供「发消息」与「删除好友」操作。
 * 自给自足——内部从 useChatContext 取 removeFriend / startChatWithFriend，
 * 调用方只需提供 userId + onClose（+ 可选 onRemoved），无需 prop 钻孔。
 */
const FriendProfileModal: React.FC<FriendProfileModalProps> = ({
  userId,
  initialSnapshot,
  onClose,
  onRemoved
}) => {
  const { removeFriend, startChatWithFriend } = useChatContext()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [avatar, setAvatar] = useState<string>(initialSnapshot?.avatar || '')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 拉取好友资料（GET /users/:id）
  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const res = await userService.getUserInfo(userId)
      if (!active) return
      if (res.result && res.data) {
        setUser(res.data)
        const url = await resolveAvatarUrl(res.data.avatar || res.data.avatarUrl)
        if (active) setAvatar(url)
        setError(null)
      } else {
        setError(res.message || '获取资料失败')
      }
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [userId])

  const displayName = user?.nickname || user?.username || initialSnapshot?.name || ''
  const username = user?.username || initialSnapshot?.username || ''
  const createdAt = user?.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : ''

  const handleSendMessage = async (): Promise<void> => {
    await startChatWithFriend(userId, { id: userId, name: displayName, username, avatar })
    onClose()
  }

  const handleDelete = async (): Promise<void> => {
    if (!window.confirm(`确定要删除好友「${displayName}」吗？\n将同时移除与该好友的私聊会话。`)) {
      return
    }
    setDeleting(true)
    const ok = await removeFriend(userId)
    setDeleting(false)
    if (ok) {
      onRemoved?.()
      onClose()
    }
  }

  return (
    <div className="friend-profile-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="friend-profile-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="friend-profile-header">
          <h2>好友资料</h2>
          <button className="friend-profile-close" onClick={onClose} title="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="friend-profile-loading">加载中...</div>
        ) : error ? (
          <div className="friend-profile-error">{error}</div>
        ) : (
          <>
            {/* Avatar + name */}
            <div className="friend-profile-avatar-section">
              <div className="friend-profile-avatar">
                <img src={avatar || FriendAvatar} alt={displayName} />
              </div>
              <div className="friend-profile-name">{displayName}</div>
              {username && <div className="friend-profile-username">@{username}</div>}
            </div>

            {/* Detail rows */}
            <div className="friend-profile-detail">
              <div className="friend-profile-row">
                <span className="friend-profile-label">昵称</span>
                <span className="friend-profile-value">{user?.nickname || '—'}</span>
              </div>
              <div className="friend-profile-row">
                <span className="friend-profile-label">用户名</span>
                <span className="friend-profile-value">{username || '—'}</span>
              </div>
              {createdAt && (
                <div className="friend-profile-row">
                  <span className="friend-profile-label">注册时间</span>
                  <span className="friend-profile-value">{createdAt}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="friend-profile-actions">
              <button
                type="button"
                className="friend-profile-button primary"
                onClick={() => void handleSendMessage()}
              >
                发消息
              </button>
              <button
                type="button"
                className="friend-profile-button danger"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? '删除中...' : '删除好友'}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .friend-profile-modal {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .friend-profile-content {
          width: 360px;
          max-width: calc(100vw - 32px);
          background-color: #1f2030;
          border-radius: 16px;
          padding: 20px 24px 24px;
          color: #fff;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }

        .friend-profile-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .friend-profile-header h2 {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }

        .friend-profile-close {
          width: 30px;
          height: 30px;
          border: none;
          border-radius: 50%;
          background: transparent;
          color: #9aa0b4;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s ease, color 0.2s ease;
        }

        .friend-profile-close:hover {
          background-color: #2a2b3a;
          color: #fff;
        }

        .friend-profile-loading,
        .friend-profile-error {
          text-align: center;
          padding: 40px 0;
          color: #9aa0b4;
        }

        .friend-profile-avatar-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 0 16px;
        }

        .friend-profile-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          overflow: hidden;
          background-color: #2a2b3a;
          margin-bottom: 12px;
        }

        .friend-profile-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .friend-profile-name {
          font-size: 18px;
          font-weight: 600;
        }

        .friend-profile-username {
          font-size: 13px;
          color: #9aa0b4;
          margin-top: 2px;
        }

        .friend-profile-detail {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 18px;
        }

        .friend-profile-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .friend-profile-label {
          color: #9aa0b4;
        }

        .friend-profile-value {
          color: #e6e8f0;
          max-width: 60%;
          text-align: right;
          word-break: break-all;
        }

        .friend-profile-actions {
          display: flex;
          gap: 12px;
        }

        .friend-profile-button {
          flex: 1;
          height: 40px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s ease, background-color 0.2s ease;
        }

        .friend-profile-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .friend-profile-button.primary {
          background-color: var(--gradient-purple-start, #6366f1);
          color: #fff;
        }

        .friend-profile-button.primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .friend-profile-button.danger {
          background-color: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }

        .friend-profile-button.danger:hover:not(:disabled) {
          background-color: #ef4444;
          color: #fff;
        }
      `}</style>
    </div>
  )
}

export default FriendProfileModal
