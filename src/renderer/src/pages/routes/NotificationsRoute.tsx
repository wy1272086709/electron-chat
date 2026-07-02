import React, { useEffect } from 'react'
import Notifications from '@renderer/components/notifications/Notifications'
import { useLayoutContext } from '@renderer/context/LayoutContext'

const NotificationsRoute: React.FC = () => {
  const {
    activePanel,
    setActivePanelState,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    handleFriendRequest
  } = useLayoutContext()

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
        onMarkAllRead={markAllNotificationsAsRead}
        onHandleFriendRequest={handleFriendRequest}
      />
    </div>
  )
}

export default NotificationsRoute
