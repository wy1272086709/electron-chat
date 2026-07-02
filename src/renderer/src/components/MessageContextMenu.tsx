import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** 单条菜单项：由调用方组装（图标 + 文案 + 点击行为） */
export interface MessageMenuItem {
  key: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
}

interface MessageContextMenuProps {
  /** 菜单左上角初始坐标（一般为鼠标 clientX/clientY） */
  x: number
  y: number
  items: MessageMenuItem[]
  onClose: () => void
}

/**
 * 通用右键菜单（用于单条消息等）
 *
 * - 自动修正坐标：靠近视口右/下边缘时回退，避免溢出
 * - 点击外部 / Esc / 滚动 / 窗口尺寸变化 时关闭
 * - 菜单项点击后自动关闭
 *
 * 注意：组件内联样式为全局 CSS，故类名带 message-context-menu 前缀以防与
 * components/ContextMenu.tsx 的 .context-menu-* 冲突。
 */
const MessageContextMenu: React.FC<MessageContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x, y })

  // 边界修正：避免菜单溢出视口右下侧（useLayoutEffect 在首次绘制前完成，避免闪烁）
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nextX =
      x + rect.width > window.innerWidth - 8 ? Math.max(8, window.innerWidth - rect.width - 8) : x
    const nextY =
      y + rect.height > window.innerHeight - 8
        ? Math.max(8, window.innerHeight - rect.height - 8)
        : y
    setPos({ x: nextX, y: nextY })
  }, [x, y])

  // 关闭时机：点击外部 / Esc / 滚动 / resize
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const handleClose = (): void => onClose()

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleClose, true)
    window.addEventListener('resize', handleClose)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleClose, true)
      window.removeEventListener('resize', handleClose)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="message-context-menu"
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000 }}
    >
      <ul className="message-context-menu-list">
        {items.map((item) => (
          <li
            key={item.key}
            className="message-context-menu-item"
            onClick={() => {
              item.onClick()
              onClose()
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      <style>{`
        .message-context-menu {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
          padding: 4px;
          min-width: 140px;
          user-select: none;
        }

        .message-context-menu-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .message-context-menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          cursor: pointer;
          border-radius: 4px;
          font-size: 14px;
          color: #333;
          transition: background-color 0.15s;
        }

        .message-context-menu-item:hover {
          background-color: #f5f5f5;
        }

        .message-context-menu-item svg {
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}

export default MessageContextMenu
