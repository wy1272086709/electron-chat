import React from 'react'
import { Outlet } from 'react-router-dom'
import LeftPanel from '@renderer/components/layout/LeftPanel'
import ProfileModal from '@renderer/components/layout/ProfileModal'
import {
  LayoutProvider,
  useChatContext,
  useNavigationContext
} from '@renderer/context/LayoutContext'
import { useProfile } from '@renderer/hooks/useProfile'

const LayoutShell: React.FC = () => {
  const { activePanel, navigatePanel } = useNavigationContext()
  const { unreadCount } = useChatContext()
  const [showProfileModal, setProfileModalVisible] = React.useState(false)
  const { profile, handleInputChange, handleAvatarChange, handleSubmit } = useProfile({
    onSubmitSuccess: () => setProfileModalVisible(false)
  })

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
        profile={profile}
      />
      <Outlet />
      {showProfileModal && (
        <ProfileModal
          onClose={() => handleShowProfileModal(false)}
          profile={profile}
          handleInputChange={handleInputChange}
          handleAvatarChange={handleAvatarChange}
          handleSubmit={handleSubmit}
        />
      )}
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
