import React from 'react'

interface LoginLogoProps {
  className?: string
}

const LoginLogo: React.FC<LoginLogoProps> = ({ className = '' }) => {
  return (
    <div className={`logo-section ${className}`}>
      <div className="logo-icon">
        {/* Lightning bolt SVG */}
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M11 4H6l-2 8h4l-1 10 9-11h-5l2-8z" />
        </svg>
      </div>
      <h1 className="logo-title">Nexus IM</h1>
    </div>
  )
}

export default LoginLogo
