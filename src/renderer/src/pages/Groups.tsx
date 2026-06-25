import React from 'react'

interface Group {
  id: string
  name: string
  avatar: string
  lastMessage: string
  time: string
  unread?: number
  members: number
  type: 'group'
}

interface GroupsProps {
  groups: Group[]
  selectedGroup: string | null
  onGroupSelect: (groupId: string) => void
  onDeleteGroup: (groupId: string) => void
}

const Groups: React.FC<GroupsProps> = ({ groups, selectedGroup, onGroupSelect, onDeleteGroup }) => {
  const formatDate = (time: string): string => {
    // Mock function - in real app, parse actual date
    if (time.includes(':')) {
      return time
    }
    return new Date(time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="groups-container">
      {/* Header */}
      <div className="panel-header">
        <h2>群聊</h2>
      </div>

      {/* Search Box */}
      <div className="search-box">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input type="text" className="search-input" placeholder="搜索群聊" />
      </div>

      {/* Group List */}
      <div className="group-list">
        {groups.map((group) => (
          <div
            key={group.id}
            className={`group-item ${selectedGroup === group.id ? 'active' : ''}`}
            onClick={() => onGroupSelect(group.id)}
          >
            {/* Avatar */}
            <div className="group-avatar">
              <img
                src={group.avatar}
                alt={group.name}
                onError={(e) => {
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=6366f1&color=fff&size=48`
                }}
              />
              <div className="group-indicator">👥</div>
            </div>

            {/* Group Info */}
            <div className="group-info">
              <div className="group-header-row">
                <span className="group-name">{group.name}</span>
                <span className="group-time">{formatDate(group.time)}</span>
              </div>
              <div className="group-header-row">
                <span className="group-preview">{group.lastMessage}</span>
                {group.unread && group.unread > 0 && (
                  <span className="unread-count">{group.unread}</span>
                )}
              </div>
              <span className="group-members">{group.members} 成员</span>
            </div>

            {/* Delete Button (hover only) */}
            {selectedGroup === group.id && (
              <button
                className="delete-group-button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteGroup(group.id)
                }}
                title="删除群聊"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Groups
