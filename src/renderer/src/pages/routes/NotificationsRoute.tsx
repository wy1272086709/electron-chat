import React, { useEffect } from 'react'
import Notifications from '@renderer/components/notifications/Notifications'
import { useNavigationContext, useNotificationsContext } from '@renderer/context/LayoutContext'

const NotificationsRoute: React.FC = () => {
  const { activePanel, setActivePanelState } = useNavigationContext()
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead, handleFriendRequest } =
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
        onMarkAllRead={markAllNotificationsAsRead}
        onHandleFriendRequest={handleFriendRequest}
      />
    </div>
  )
}

export default NotificationsRoute
