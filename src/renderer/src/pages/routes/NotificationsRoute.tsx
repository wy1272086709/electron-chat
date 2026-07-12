import React, { useEffect } from 'react'
import Notifications from '@renderer/components/notifications/Notifications'
import { useNavigationContext, useNotificationsContext } from '@renderer/context/LayoutContext'

const NotificationsRoute: React.FC = () => {
  const { activePanel, setActivePanelState } = useNavigationContext()
  const { notifications, markNotificationAsRead, handleFriendRequest, handleGroupInvitation } =
    useNotificationsContext()

  useEffect(() => {
    if (activePanel !== 'notifications') {
      setActivePanelState('notifications')
    }
  }, [activePanel, setActivePanelState])

  return (
    <div className="right-panel active">
      <Notifications
        notifications={notifications}
        onMarkRead={markNotificationAsRead}
        onHandleFriendRequest={handleFriendRequest}
        onHandleGroupInvitation={handleGroupInvitation}
      />
    </div>
  )
}

export default NotificationsRoute
