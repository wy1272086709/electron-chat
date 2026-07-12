import React, { useCallback, useEffect, useState } from 'react'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import GroupAvatar from '@renderer/components/groups/GroupAvatar'
import InviteMembersModal from '@renderer/components/groups/InviteMembersModal'
import { chatService } from '@renderer/services/chat.service'
import { useChatContext } from '@renderer/context/LayoutContext'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'
import type { RoomMember } from '@renderer/types/chat.types'

interface GroupProfileModalProps {
  roomId: string
  groupName: string
  memberCount?: number
  onClose: () => void
  /** 退出群聊成功后的回调（调用方用来收尾，如回到会话列表） */
  onLeft?: () => void
}

/** 成员角色 → 中文标签 */
const roleLabel = (role?: string): string => {
  switch (role) {
    case 'OWNER':
      return '群主'
    case 'ADMIN':
      return '管理员'
    default:
      return '成员'
  }
}

/**
 * 群资料弹窗：拉取并展示群成员列表，提供「退出群聊」操作。
 * 自给自足——内部从 useChatContext 取 leaveGroup / currentUserId，
 * 调用方只需提供 roomId + groupName + onClose（+ 可选 onLeft），无需 prop 钻孔。
 */
const GroupProfileModal: React.FC<GroupProfileModalProps> = ({
  roomId,
  groupName,
  memberCount,
  onClose,
  onLeft
}) => {
  const { leaveGroup, currentUserId } = useChatContext()
  const [members, setMembers] = useState<RoomMember[]>([])
  const [avatars, setAvatars] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 拉取群成员（GET /chat/rooms/:roomId/members），并解析每个成员的头像预签名 URL。
  const loadMembers = useCallback(async () => {
    setLoading(true)
    const res = await chatService.getRoomMembers(roomId)
    if (res.result && res.data) {
      setMembers(res.data)
      setError(null)
      const entries = await Promise.all(
        res.data.map(async (m) => [m.userId, await resolveAvatarUrl(m.user?.avatarUrl)] as const)
      )
      setAvatars(Object.fromEntries(entries))
    } else {
      setError(res.message || '获取群成员失败')
    }
    setLoading(false)
  }, [roomId])

  useEffect(() => {
    let active = true
    void (async () => {
      await loadMembers()
      // 加载期间组件卸载则丢弃结果
      active = false
    })().catch(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [loadMembers])

  const handleLeave = async (): Promise<void> => {
    if (!window.confirm(`确定要退出群聊「${groupName}」吗？\n退出后将不再接收该群消息。`)) {
      return
    }
    setLeaving(true)
    const ok = await leaveGroup(roomId)
    setLeaving(false)
    if (ok) {
      onLeft?.()
      onClose()
    }
  }

  return (
    <div className="group-profile-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="group-profile-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="group-profile-header">
          <h2>群聊信息</h2>
          <button className="group-profile-close" onClick={onClose} title="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="group-profile-loading">加载中...</div>
        ) : error ? (
          <div className="group-profile-error">{error}</div>
        ) : (
          <>
            {/* Avatar + name */}
            <div className="group-profile-avatar-section">
              <div className="group-profile-avatar">
                <GroupAvatar memberCount={members.length || memberCount} />
              </div>
              <div className="group-profile-name">{groupName}</div>
              <div className="group-profile-count">
                {members.length || (memberCount ?? 0)} 名成员
              </div>
            </div>

            {/* Member list */}
            <div className="group-profile-members">
              <div className="group-profile-members-title">群成员（{members.length}）</div>
              <div className="group-profile-member-list">
                {members.map((m) => {
                  const name = m.user?.nickname || m.user?.username || m.userId
                  const isMe = m.userId === currentUserId
                  const isOwner = m.role === 'OWNER'
                  return (
                    <div className="group-profile-member" key={m.userId}>
                      <div className="group-profile-member-avatar">
                        <img src={avatars[m.userId] || FriendAvatar} alt={name} />
                      </div>
                      <div className="group-profile-member-name">
                        {name}
                        {isMe && <span className="group-profile-me">（我）</span>}
                      </div>
                      <span className={`group-profile-role ${isOwner ? 'is-owner' : ''}`}>
                        {roleLabel(m.role)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="group-profile-actions">
              <button
                type="button"
                className="group-profile-button primary"
                onClick={() => setShowInvite(true)}
              >
                邀请成员
              </button>
              <button
                type="button"
                className="group-profile-button danger"
                disabled={leaving}
                onClick={() => void handleLeave()}
              >
                {leaving ? '退出中...' : '退出群聊'}
              </button>
            </div>
          </>
        )}
      </div>

      {showInvite && (
        <InviteMembersModal
          roomId={roomId}
          existingMemberIds={members.map((m) => m.userId)}
          onClose={() => setShowInvite(false)}
        />
      )}

      <style>{`
        .group-profile-modal {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .group-profile-content {
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

        .group-profile-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .group-profile-header h2 {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }

        .group-profile-close {
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

        .group-profile-close:hover {
          background-color: #2a2b3a;
          color: #fff;
        }

        .group-profile-loading,
        .group-profile-error {
          text-align: center;
          padding: 40px 0;
          color: #9aa0b4;
        }

        .group-profile-avatar-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 0 16px;
        }

        .group-profile-avatar {
          width: 80px;
          height: 80px;
          border-radius: 16px;
          overflow: hidden;
          background-color: #2a2b3a;
          margin-bottom: 12px;
        }

        .group-profile-name {
          font-size: 18px;
          font-weight: 600;
          word-break: break-all;
          text-align: center;
        }

        .group-profile-count {
          font-size: 13px;
          color: #9aa0b4;
          margin-top: 2px;
        }

        .group-profile-members {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 18px;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .group-profile-members-title {
          font-size: 13px;
          color: #9aa0b4;
          padding: 12px 0 8px;
        }

        .group-profile-member-list {
          max-height: 240px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-bottom: 12px;
        }

        .group-profile-member {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 6px 4px;
          border-radius: 8px;
        }

        .group-profile-member-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          background-color: #2a2b3a;
          flex-shrink: 0;
        }

        .group-profile-member-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .group-profile-member-name {
          flex: 1;
          font-size: 14px;
          color: #e6e8f0;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .group-profile-me {
          color: #9aa0b4;
          font-size: 12px;
        }

        .group-profile-role {
          font-size: 12px;
          color: #9aa0b4;
          padding: 2px 8px;
          border-radius: 10px;
          background-color: rgba(255, 255, 255, 0.05);
          flex-shrink: 0;
        }

        .group-profile-role.is-owner {
          color: #fbbf24;
          background-color: rgba(251, 191, 36, 0.12);
        }

        .group-profile-actions {
          display: flex;
          gap: 12px;
        }

        .group-profile-button {
          flex: 1;
          height: 40px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s ease, background-color 0.2s ease;
        }

        .group-profile-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .group-profile-button.primary {
          background-color: var(--gradient-purple-start, #6366f1);
          color: #fff;
        }

        .group-profile-button.primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .group-profile-button.danger {
          background-color: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }

        .group-profile-button.danger:hover:not(:disabled) {
          background-color: #ef4444;
          color: #fff;
        }
      `}</style>
    </div>
  )
}

export default GroupProfileModal
