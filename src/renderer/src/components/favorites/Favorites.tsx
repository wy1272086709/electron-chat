import React, { useState } from 'react'

interface Favorite {
  id: string
  type: 'message' | 'file'
  title: string
  content?: string
  fileName?: string
  time: string
  chatId?: string
}

interface FavoritesProps {
  favorites: Favorite[]
}

const Favorites: React.FC<FavoritesProps> = ({ favorites }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'message' | 'file'>('all')
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>(
    'all'
  )

  const filteredFavorites = favorites.filter((favorite) => {
    // Filter by type
    if (activeTab !== 'all' && favorite.type !== activeTab) {
      return false
    }

    // Filter by time
    const now = new Date()
    const favoriteDate = new Date(favorite.time)
    const diffTime = Math.abs(now.getTime() - favoriteDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (selectedTimeFilter === 'today' && diffDays > 1) return false
    if (selectedTimeFilter === 'week' && diffDays > 7) return false
    if (selectedTimeFilter === 'month' && diffDays > 30) return false

    return true
  })

  const formatTime = (time: string) => {
    const date = new Date(time)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return '昨天'
    } else if (diffDays < 7) {
      return `${diffDays}天前`
    } else {
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric'
      })
    }
  }

  const handleFavoriteClick = (favorite: Favorite) => {
    // In a real app, this would open the chat or file
    console.log('Open favorite:', favorite)
  }

  const handleDeleteFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    // In a real app, this would delete from backend
    console.log('Delete favorite:', id)
  }

  const handleFileNameClick = () => {
    // Placeholder for file name click handler
  }

  const getFileSize = () => {
    // Mock file sizes
    const sizes = ['2.3 MB', '156 KB', '4.7 MB', '892 KB']
    return sizes[Math.floor(Math.random() * sizes.length)]
  }

  return (
    <div className="favorites-panel">
      {/* Header */}
      <div className="panel-header">
        <h2>收藏</h2>
      </div>

      {/* Tabs */}
      <div className="favorites-tabs">
        <button
          className={`favorites-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          全部
        </button>
        <button
          className={`favorites-tab ${activeTab === 'message' ? 'active' : ''}`}
          onClick={() => setActiveTab('message')}
        >
          消息
        </button>
        <button
          className={`favorites-tab ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => setActiveTab('file')}
        >
          文件
        </button>
      </div>

      {/* Time Filter */}
      <div className="favorites-filter">
        <button
          className={`filter-button ${selectedTimeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedTimeFilter('all')}
        >
          全部时间
        </button>
        <button
          className={`filter-button ${selectedTimeFilter === 'today' ? 'active' : ''}`}
          onClick={() => setSelectedTimeFilter('today')}
        >
          今天
        </button>
        <button
          className={`filter-button ${selectedTimeFilter === 'week' ? 'active' : ''}`}
          onClick={() => setSelectedTimeFilter('week')}
        >
          本周
        </button>
        <button
          className={`filter-button ${selectedTimeFilter === 'month' ? 'active' : ''}`}
          onClick={() => setSelectedTimeFilter('month')}
        >
          本月
        </button>
      </div>

      {/* Favorites List */}
      <div className="favorites-list">
        {filteredFavorites.length === 0 ? (
          <div className="empty-favorites">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{ opacity: 0.3 }}
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <p>暂无收藏内容</p>
          </div>
        ) : (
          filteredFavorites.map((favorite) => (
            <div
              key={favorite.id}
              className="favorite-item"
              onClick={() => handleFavoriteClick(favorite)}
            >
              {/* Favorite Icon */}
              <div className={`favorite-type ${favorite.type}`}>
                {favorite.type === 'message' ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
                  </svg>
                )}
              </div>

              {/* Favorite Info */}
              <div className="favorite-info">
                <div className="favorite-title-row">
                  <h3 className="favorite-title">{favorite.title}</h3>
                  <div className="favorite-meta">
                    {favorite.type === 'file' && favorite.fileName && (
                      <span className="file-size">{getFileSize()}</span>
                    )}
                    <span className="favorite-time">{formatTime(favorite.time)}</span>
                  </div>
                </div>
                {favorite.content && (
                  <p className="favorite-description">
                    {favorite.content.length > 100
                      ? `${favorite.content.substring(0, 100)}...`
                      : favorite.content}
                  </p>
                )}
                {favorite.fileName && (
                  <button className="file-name" onClick={handleFileNameClick}>
                    {favorite.fileName}
                  </button>
                )}
              </div>

              {/* Delete Button */}
              <button
                className="delete-favorite-button"
                onClick={(e) => handleDeleteFavorite(favorite.id, e)}
                title="删除收藏"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      <style>{`
        .favorites-tabs {
          display: flex;
          gap: 24px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #33333c;
        }

        .favorites-tab {
          position: relative;
          padding: 8px 0;
          background: none;
          border: none;
          color: #666;
          font-size: 15px;
          cursor: pointer;
          transition: color 0.3s ease;
        }

        .favorites-tab.active {
          color: white;
        }

        .favorites-tab.active::after {
          content: '';
          position: absolute;
          bottom: -16px;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(135deg, var(--gradient-purple-start) 0%, var(--gradient-cyan-start) 100%);
        }

        .favorites-filter {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .filter-button {
          padding: 6px 12px;
          border-radius: 6px;
          background-color: #2a2b3a;
          color: #666;
          border: none;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .filter-button:hover,
        .filter-button.active {
          background-color: var(--gradient-purple-start);
          color: white;
        }

        .favorite-title-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .favorite-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #666;
        }

        .file-size {
          background-color: #3a3b4a;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .favorite-description {
          font-size: 13px;
          color: #666;
          margin-bottom: 4px;
          line-height: 1.4;
        }

        .file-name {
          font-size: 12px;
          color: #666;
          font-family: monospace;
          background-color: #3a3b4a;
          padding: 2px 6px;
          border-radius: 4px;
          display: inline-block;
        }

        .delete-favorite-button {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: all 0.3s ease;
        }

        .favorite-item:hover .delete-favorite-button {
          opacity: 1;
        }

        .delete-favorite-button:hover {
          background-color: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .empty-favorites {
          text-align: center;
          padding: 60px 20px;
          color: #666;
        }

        .empty-favorites p {
          margin-top: 16px;
          font-size: 16px;
        }
      `}</style>
    </div>
  )
}

export default Favorites
