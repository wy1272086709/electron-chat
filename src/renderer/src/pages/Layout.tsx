import React from 'react'
import { Outlet } from 'react-router-dom'
import LeftPanel from '@renderer/components/layout/LeftPanel'
import ProfileModal from '@renderer/components/layout/ProfileModal'
import { LayoutProvider, useLayoutContext } from '@renderer/context/LayoutContext'

const LayoutShell: React.FC = () => {
  const { activePanel, unreadCount, navigatePanel } = useLayoutContext()
  const [showProfileModal, setProfileModalVisible] = React.useState(false)

  const handleShowProfileModal = (show: boolean): void => {
    setProfileModalVisible(show)
  }

  return (
    <div className="app-container">
      <LeftPanel
        activePanel={activePanel}
        setActivePanel={navigatePanel}
        unreadCount={unreadCount}
        setShowProfileModal={handleShowProfileModal}
      />
      <Outlet />
      {showProfileModal && <ProfileModal onClose={() => handleShowProfileModal(false)} />}
    </div>
  )
}

const Layout: React.FC = () => {
  return (
    <LayoutProvider>
      <LayoutShell />
    </LayoutProvider>
  )
}

export default Layout
