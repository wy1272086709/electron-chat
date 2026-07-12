import React, { useEffect, useMemo, useState } from 'react'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import { chatService } from '@renderer/services/chat.service'
import { userService } from '@renderer/services/user.service'
import { useChatContext } from '@renderer/context/LayoutContext'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'
import type { UserInfo } from '@renderer/types/api.types'

interface InviteMembersModalProps {
  roomId: string
  /** 当前群成员的用户 ID（用于排除已在群内的好友） */
  existingMemberIds: string[]
  onClose: () => void
  /** 邀请通知发送成功后的回调 */
  onInvited?: () => void
}

/**
 * 邀请成员弹窗：拉取当前用户好友，排除已在群内的成员，勾选后一次性邀请。
 * 这里只发送群邀请通知，真正入群需要对方在通知里同意。
 */
const InviteMembersModal: React.FC<InviteMembersModalProps> = ({
  roomId,
  existingMemberIds,
  onClose,
  onInvited
}) => {
  const { currentUserId } = useChatContext()
  const [friends, setFriends] = useState<UserInfo[]>([])
  const [avatars, setAvatars] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const memberSet = useMemo(
    () => new Set(existingMemberIds.concat(currentUserId ?? '')),
    [existingMemberIds, currentUserId]
  )

  // 拉取好友列表并解析头像
  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const res = await userService.getFriends()
      if (!active) return
      if (res.result && res.data) {
        setFriends(res.data)
        setError(null)
        const entries = await Promise.all(
          res.data.map(
            async (f) => [f.id, await resolveAvatarUrl(f.avatar || f.avatarUrl)] as const
          )
        )
        if (active) setAvatars(Object.fromEntries(entries))
      } else {
        setError(res.message || '获取好友列表失败')
      }
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  // 仅展示「不在群里」的好友，并按关键词过滤
  const candidates = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return friends
      .filter((f) => !memberSet.has(f.id))
      .filter((f) => {
        if (!kw) return true
        return (
          (f.nickname ?? '').toLowerCase().includes(kw) ||
          (f.username ?? '').toLowerCase().includes(kw)
        )
      })
  }, [friends, memberSet, keyword])

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleInvite = async (): Promise<void> => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setInviting(true)
    const res = await chatService.inviteMembers(roomId, ids)
    setInviting(false)
    if (res.result) {
      onInvited?.()
      alert('群邀请已发送，等待对方同意')
      onClose()
    } else {
      alert(res.message || '发送群邀请失败')
    }
  }

  return (
    <div className="invite-members-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="invite-members-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="invite-members-header">
          <h2>邀请成员</h2>
          <button className="invite-members-close" onClick={onClose} title="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="invite-members-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="搜索好友"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        {/* List */}
        <div className="invite-members-list">
          {loading ? (
            <div className="invite-members-empty">加载中...</div>
          ) : error ? (
            <div className="invite-members-empty">{error}</div>
          ) : candidates.length === 0 ? (
            <div className="invite-members-empty">没有可邀请的好友</div>
          ) : (
            candidates.map((f) => {
              const name = f.nickname || f.username
              const checked = selected.has(f.id)
              return (
                <div
                  key={f.id}
                  className={`invite-members-item ${checked ? 'is-checked' : ''}`}
                  onClick={() => toggle(f.id)}
                >
                  <div className="invite-members-avatar">
                    <img src={avatars[f.id] || FriendAvatar} alt={name} />
                  </div>
                  <div className="invite-members-name">{name}</div>
                  <span className={`invite-members-check ${checked ? 'is-checked' : ''}`}>
                    {checked && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Actions */}
        <div className="invite-members-actions">
          <button type="button" className="invite-members-button secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="invite-members-button primary"
            disabled={selected.size === 0 || inviting}
            onClick={() => void handleInvite()}
          >
            {inviting ? '发送中...' : `发送邀请（${selected.size}）`}
          </button>
        </div>
      </div>

      <style>{`
        .invite-members-modal {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
        }

        .invite-members-content {
          width: 360px;
          max-width: calc(100vw - 32px);
          max-height: calc(100vh - 64px);
          display: flex;
          flex-direction: column;
          background-color: #1f2030;
          border-radius: 16px;
          padding: 20px 24px 24px;
          color: #fff;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }

        .invite-members-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .invite-members-header h2 {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }

        .invite-members-close {
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

        .invite-members-close:hover {
          background-color: #2a2b3a;
          color: #fff;
        }

        .invite-members-search {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 38px;
          padding: 0 12px;
          border-radius: 10px;
          background-color: #2a2b3a;
          color: #9aa0b4;
          margin-bottom: 12px;
        }

        .invite-members-search input {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          color: #fff;
          font-size: 14px;
        }

        .invite-members-search input::placeholder {
          color: #6b7280;
        }

        .invite-members-list {
          max-height: 320px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: 18px;
        }

        .invite-members-empty {
          text-align: center;
          color: #9aa0b4;
          padding: 40px 0;
        }

        .invite-members-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }

        .invite-members-item:hover {
          background-color: rgba(255, 255, 255, 0.04);
        }

        .invite-members-item.is-checked {
          background-color: rgba(99, 102, 241, 0.12);
        }

        .invite-members-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          background-color: #2a2b3a;
          flex-shrink: 0;
        }

        .invite-members-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .invite-members-name {
          flex: 1;
          font-size: 14px;
          color: #e6e8f0;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .invite-members-check {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid #4b5063;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .invite-members-check.is-checked {
          border-color: var(--gradient-purple-start, #6366f1);
          background-color: var(--gradient-purple-start, #6366f1);
          color: #fff;
        }

        .invite-members-actions {
          display: flex;
          gap: 12px;
        }

        .invite-members-button {
          flex: 1;
          height: 40px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s ease, background-color 0.2s ease;
        }

        .invite-members-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .invite-members-button.primary {
          background-color: var(--gradient-purple-start, #6366f1);
          color: #fff;
        }

        .invite-members-button.primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .invite-members-button.secondary {
          background-color: #2a2b3a;
          color: #e6e8f0;
        }

        .invite-members-button.secondary:hover {
          background-color: #33333c;
        }
      `}</style>
    </div>
  )
}

export default InviteMembersModal
