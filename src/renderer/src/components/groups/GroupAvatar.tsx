import React from 'react'

interface GroupAvatarProps {
  /** 群成员数量，仅用于决定图标里显示几个人形（1~9），默认 4 */
  memberCount?: number
}

/**
 * 微信风格的群聊头像：圆角方形底色 + 白色人形网格。
 * 直接撑满父容器（父容器需给出宽高，如 .chat-avatar）。
 */
const GroupAvatar: React.FC<GroupAvatarProps> = ({ memberCount = 4 }) => {
  const count = Math.max(1, Math.min(Math.ceil(Number(memberCount) || 1), 9))
  const cols = count === 1 ? 1 : count <= 4 ? 2 : 3
  const rows = Math.ceil(count / cols)

  const PAD = 15
  const INNER = 100 - PAD * 2
  const cellW = INNER / cols
  const cellH = INNER / rows
  const s = Math.min(cellW, cellH) // 单个人形单元尺寸

  const ox = PAD + (INNER - cols * cellW) / 2
  const oy = PAD + (INNER - rows * cellH) / 2

  const persons: { cx: number; top: number }[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    const cellsInRow = row === rows - 1 ? count - row * cols : cols
    const rowOffset = (cols - cellsInRow) / 2
    const cx = ox + (rowOffset + col + 0.5) * cellW
    const top = oy + row * cellH + (cellH - s) / 2
    persons.push({ cx, top })
  }

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      style={{ display: 'block', maxWidth: 44, maxHeight: 44 }}
      role="img"
      aria-label="群聊"
    >
      <rect x="0" y="0" width="100" height="100" rx="16" fill="#9db2ce" />
      {persons.map((p, i) => (
        <g key={i} fill="#ffffff">
          {/* 头 */}
          <circle cx={p.cx} cy={p.top + s * 0.3} r={s * 0.16} />
          {/* 肩膀（上半圆穹顶） */}
          <path
            d={`M ${p.cx - s * 0.27} ${p.top + s * 0.78} A ${s * 0.27} ${s * 0.27} 0 0 1 ${p.cx + s * 0.27} ${p.top + s * 0.78} Z`}
          />
        </g>
      ))}
    </svg>
  )
}

export default GroupAvatar
