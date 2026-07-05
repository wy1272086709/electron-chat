import React, { useCallback, useEffect, useMemo, useState } from 'react'
import FriendAvatar from '@renderer/assets/friend_avatar.svg'
import AddFriendModal from '@renderer/components/contacts/AddFriendModal'
import { userService } from '@renderer/services/user.service'
import type { UserInfo } from '@renderer/types/api.types'
import { resolveAvatarUrl } from '@renderer/utils/avatar-url'

interface ContactsProps {
  /** 发起 / 打开与某好友的私聊：创建私聊房间后切换到「好友消息」面板并选中 */
  onStartChat: (userId: string, friend?: Contact) => void
}

// 联系人列表项（从 GET /users/friends 的 UserInfo 映射而来）
interface Contact {
  id: string
  name: string
  username: string
  avatar: string
}

// 取分组首字母：A-Z 直接用，其余（中文等）归入「#」
const groupKeyOf = (name: string): string => {
  const ch = name.trim().charAt(0).toUpperCase()
  return /^[A-Z]$/.test(ch) ? ch : '#'
}

const Contacts: React.FC<ContactsProps> = ({ onStartChat }) => {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false)

  const loadFriends = useCallback(async (): Promise<void> => {
    setLoading(true)
    const res = await userService.getFriends()
    if (res.result && res.data) {
      const list = await Promise.all(
        res.data.map(async (u: UserInfo) => ({
          id: u.id,
          name: u.nickname || u.username,
          username: u.username,
          avatar: await resolveAvatarUrl(u.avatar || u.avatarUrl)
        }))
      )
      setContacts(list)
    } else {
      console.warn('[Contacts] 加载好友列表失败:', res.message)
      setContacts([])
    }
    setLoading(false)
  }, [])

  // 拉取好友列表（GET /users/friends）
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFriends()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadFriends])

  // 关键词过滤 + 按首字母分组排序
  const grouped = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase()
    const filtered = trimmed
      ? contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(trimmed) || c.username.toLowerCase().includes(trimmed)
        )
      : contacts

    const map = new Map<string, Contact[]>()
    for (const c of filtered) {
      const key = groupKeyOf(c.name)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    // 组内按名称排序（中文之间无拼音库，仅稳定排序）
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    }

    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })
    return keys.map((k) => ({ key: k, friends: map.get(k)! }))
  }, [contacts, keyword])

  const totalCount = contacts.length

  return (
    <div className="contacts-panel">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <h2>通讯录</h2>
        <button
          className="contacts-add-button"
          onClick={() => setIsAddFriendOpen(true)}
          title="添加好友"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-8 0c2.21 0 4-1.79 4-4S9.21 4 7 4 3 5.79 3 8s1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h12v-2c0-2.66-5.33-4-8-4zm8 0c-.31 0-.66.02-1.03.05 1.16.84 2.03 1.97 2.03 3.45V20h8v-2c0-2.66-5.33-4-8-4zm7-4v2h-2v2h-2v-2h-2v-2h2V8h2v2h2z" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="contacts-body">
        {/* Search Box */}
        <div className="search-box contacts-search">
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
            placeholder="搜索好友"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        {/* Summary */}
        {totalCount > 0 && <div className="contacts-summary">共 {totalCount} 位好友</div>}

        {/* Contacts List */}
        <div className="contacts-list">
          {loading ? (
            <div className="empty-contacts">
              <p>加载中...</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="empty-contacts">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ opacity: 0.3 }}
              >
                <path d="M20 0H4v2h16V0zM4 24h16v-2H4v2zM20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 2.75c1.24 0 2.25 1.01 2.25 2.25 0 1.24-1.01 2.25-2.25 2.25S9.75 10.24 9.75 9 10.76 6.75 12 6.75zM17 17H7v-1.5c0-1.67 3.33-2.5 5-2.5s5 .83 5 2.5V17z" />
              </svg>
              <p>{keyword.trim() ? '未找到匹配的好友' : '还没有好友'}</p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.key} className="contact-group">
                <div className="contact-group-header">{group.key}</div>
                {group.friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="contact-item"
                    onClick={() => onStartChat(friend.id, friend)}
                    title={`与 ${friend.name} 聊天`}
                  >
                    <div className="contact-avatar">
                      <img
                        src={friend.avatar || FriendAvatar}
                        alt={friend.name}
                        onError={(e) => {
                          e.currentTarget.src = FriendAvatar
                        }}
                      />
                    </div>
                    <div className="contact-info">
                      <span className="contact-name">{friend.name}</span>
                      <span className="contact-username">@{friend.username}</span>
                    </div>
                    <button
                      className="contact-chat-button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onStartChat(friend.id, friend)
                      }}
                      title="发消息"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .contacts-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .contacts-body {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          padding: 0 20px 20px;
        }

        .contacts-add-button {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background-color: rgba(99, 102, 241, 0.15);
          color: var(--gradient-purple-start);
          cursor: pointer;
          transition:
            background-color 0.2s ease,
            color 0.2s ease;
        }

        .contacts-add-button:hover {
          background-color: var(--gradient-purple-start);
          color: white;
        }

        .contacts-search {
          flex: none;
          margin: 12px 0;
        }

        .contacts-summary {
          font-size: 12px;
          color: #666;
          margin-bottom: 8px;
          padding-left: 4px;
        }

        .contacts-list {
          flex: 1;
          overflow-y: auto;
        }

        .contact-group {
          margin-bottom: 4px;
        }

        .contact-group-header {
          font-size: 12px;
          font-weight: 600;
          color: #888;
          padding: 8px 4px 6px;
        }

        .contact-item {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          transition: background-color 0.3s ease;
        }

        .contact-item:hover {
          background-color: #2a2b3a;
        }

        .contact-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          overflow: hidden;
          margin-right: 12px;
          flex-shrink: 0;
          background-color: #2a2b3a;
        }

        .contact-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .contact-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .contact-name {
          font-size: 14px;
          font-weight: 500;
          color: white;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .contact-username {
          font-size: 12px;
          color: #666;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .contact-chat-button {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background-color: rgba(99, 102, 241, 0.15);
          color: var(--gradient-purple-start);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          opacity: 0;
          transition: all 0.3s ease;
        }

        .contact-item:hover .contact-chat-button {
          opacity: 1;
        }

        .contact-chat-button:hover {
          background-color: var(--gradient-purple-start);
          color: white;
        }

        .empty-contacts {
          text-align: center;
          padding: 60px 20px;
          color: #666;
        }

        .empty-contacts p {
          margin-top: 16px;
          font-size: 16px;
        }
      `}</style>
      {isAddFriendOpen && (
        <AddFriendModal
          onClose={() => setIsAddFriendOpen(false)}
          onAdded={() => {
            void loadFriends()
          }}
        />
      )}
    </div>
  )
}

export default Contacts
