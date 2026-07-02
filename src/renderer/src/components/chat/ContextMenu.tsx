import React, { useEffect } from 'react'

interface ContextMenuProps {
  x: number
  y: number
  chatId: string
  chatName: string
  onMarkAsRead: (chatId: string) => void
  onClearChat: (chatId: string) => void
  onClose: () => void
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  chatId,
  chatName,
  onMarkAsRead,
  onClearChat,
  onClose
}) => {
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const menu = document.getElementById('context-menu')
      if (menu && !menu.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('click', handleClickOutside)
    document.addEventListener(
      'contextmenu',
      (e) => {
        e.preventDefault()
      },
      { once: true }
    )

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [onClose])

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const handleMarkAsRead = () => {
    onMarkAsRead(chatId)
    onClose()
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const handleClearChat = () => {
    if (confirm(`确定要清空与 ${chatName} 的聊天记录吗？此操作不可恢复。`)) {
      onClearChat(chatId)
      onClose()
    }
  }

  return (
    <div
      id="context-menu"
      className="context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 1000
      }}
    >
      <ul className="context-menu-list">
        <li className="context-menu-item" onClick={handleMarkAsRead}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          设为已读
        </li>
        <li className="context-menu-item" onClick={handleClearChat}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
          清空聊天
        </li>
      </ul>
      <style>{`
        .context-menu {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 4px;
          min-width: 160px;
        }

        .context-menu-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .context-menu-item {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          cursor: pointer;
          border-radius: 4px;
          font-size: 14px;
          color: #333;
          transition: background-color 0.2s;
        }

        .context-menu-item:hover {
          background-color: #f5f5f5;
        }

        .context-menu-item svg {
          margin-right: 8px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}

export default ContextMenu
