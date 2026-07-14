import React from 'react'

interface TransferProgressProps {
  progress: number
  label: string
  size?: number
}

const TransferProgress: React.FC<TransferProgressProps> = ({ progress, label, size = 28 }) => {
  const normalized = Math.min(1, Math.max(0, progress))
  const degrees = normalized * 360

  return (
    <span
      className="transfer-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalized * 100)}
      title={`${label} ${Math.round(normalized * 100)}%`}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(#ffffff ${degrees}deg, rgba(255, 255, 255, 0.24) ${degrees}deg)`
      }}
    />
  )
}

export default TransferProgress
