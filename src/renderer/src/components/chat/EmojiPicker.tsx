import React, { useState } from 'react'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose }) => {
  const [isVisible, setIsVisible] = useState(true)

  const emojis = [
    '😀',
    '😃',
    '😄',
    '😁',
    '😅',
    '😂',
    '🤣',
    '😊',
    '😇',
    '🙂',
    '🙃',
    '😉',
    '😌',
    '😍',
    '🥰',
    '😘',
    '😗',
    '😙',
    '😚',
    '😋',
    '😛',
    '😜',
    '🤪',
    '😝',
    '🤑',
    '🤗',
    '🤭',
    '🤫',
    '🤔',
    '🤐',
    '🤨',
    '😐',
    '😑',
    '😶',
    '😏',
    '😒',
    '🙄',
    '😬',
    '🤥',
    '😌',
    '😔',
    '😪',
    '😴',
    '😷',
    '🤒',
    '🤕',
    '🤢',
    '🤮',
    '🤧',
    '🥵',
    '🥶',
    '😎',
    '🤠',
    '🤡',
    '🥳',
    '😏',
    '😒',
    '🙄',
    '🤔',
    '😌',
    '😔',
    '😪',
    '😴',
    '🤤',
    '😷',
    '🤒',
    '🤕',
    '🤢',
    '🤮',
    '🤧',
    '🥵',
    '🥶',
    '😎',
    '🤠',
    '😊',
    '😇',
    '🙂',
    '🙃',
    '😉',
    '😌',
    '😍',
    '🥰',
    '😘',
    '😗',
    '😙',
    '😚',
    '😋',
    '😛',
    '😜',
    '🤪',
    '😝',
    '🤑',
    '🤗',
    '🤭',
    '🤫',
    '😐',
    '😑',
    '😶',
    '😏',
    '😒',
    '🙄',
    '😬',
    '🤥',
    '😌',
    '😔',
    '😪',
    '😴',
    '😷',
    '🤒',
    '🤕',
    '🤢',
    '🤮',
    '🤧',
    '🥵',
    '🥶',
    '😎',
    '🤠',
    '🤡',
    '🥳',
    '😏',
    '😒',
    '🙄',
    '🤔',
    '😌',
    '😔',
    '😪',
    '😴',
    '🤤',
    '😷',
    '🤒',
    '🤕',
    '🤢',
    '🤮',
    '🤧',
    '🥵',
    '🥶',
    '😎',
    '🤠',
    '😊',
    '😇',
    '🙂',
    '🙃',
    '😉',
    '😌',
    '😍',
    '🥰',
    '😘',
    '😗',
    '😙',
    '😚',
    '😋',
    '😛',
    '😜',
    '🤪',
    '😝',
    '🤑',
    '🤗',
    '🤭',
    '🤫',
    '😐',
    '😑',
    '😶',
    '😏',
    '😒',
    '🙄',
    '😬',
    '🤥',
    '😌',
    '😔',
    '😪',
    '😴',
    '😷',
    '🤒',
    '🤕',
    '🤢',
    '🤮',
    '🤧',
    '🥵',
    '🥶',
    '😎',
    '🤠',
    '🤡',
    '🥳',
    '😏',
    '😒',
    '🙄',
    '🤔'
  ]

  const handleSelect = (emoji: string) => {
    onSelect(emoji)
    onClose()
  }

  const handleClose = () => {
    setIsVisible(false)
    onClose()
  }

  if (!isVisible) return null

  return (
    <div className="emoji-picker-overlay" onClick={handleClose}>
      <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
        <div className="emoji-picker-header">
          <h3>选择表情</h3>
          <button className="emoji-picker-close" onClick={handleClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
        <div className="emoji-grid">
          {emojis.map((emoji, index) => (
            <button
              key={index}
              className="emoji-item"
              onClick={() => handleSelect(emoji)}
              title={`选择 ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <style>{`
        .emoji-picker-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 1000;
        }

        .emoji-picker {
          background-color: #2a2a2a;
          border-radius: 12px;
          padding: 16px;
          width: 90%;
          max-width: 400px;
          max-height: 70vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .emoji-picker-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .emoji-picker-header h3 {
          color: #fff;
          margin: 0;
          font-size: 16px;
        }

        .emoji-picker-close {
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
          padding: 4px;
          transition: color 0.2s;
        }

        .emoji-picker-close:hover {
          color: #fff;
        }

        .emoji-grid {
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          gap: 8px;
          overflow-y: auto;
          max-height: calc(70vh - 48px);
        }

        .emoji-item {
          background: none;
          border: none;
          color: #fff;
          font-size: 24px;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          transition: background-color 0.2s;
        }

        .emoji-item:hover {
          background-color: #3a3a3a;
        }

        .emoji-item:active {
          background-color: #4a4a4a;
        }

        /* 暗色主题下滚动条样式 */
        .emoji-grid::-webkit-scrollbar {
          width: 8px;
        }

        .emoji-grid::-webkit-scrollbar-track {
          background: #1a1a1a;
          border-radius: 4px;
        }

        .emoji-grid::-webkit-scrollbar-thumb {
          background: #4a4a4a;
          border-radius: 4px;
        }

        .emoji-grid::-webkit-scrollbar-thumb:hover {
          background: #5a5a5a;
        }
      `}</style>
    </div>
  )
}

export default EmojiPicker
