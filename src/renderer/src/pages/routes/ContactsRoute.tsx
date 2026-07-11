import React, { useEffect } from 'react'
import Contacts from '@renderer/components/contacts/Contacts'
import { useChatContext, useNavigationContext } from '@renderer/context/LayoutContext'

const ContactsRoute: React.FC = () => {
  const { activePanel, setActivePanelState } = useNavigationContext()
  const { startChatWithFriend } = useChatContext()

  useEffect(() => {
    if (activePanel !== 'contacts') {
      setActivePanelState('contacts')
    }
  }, [activePanel, setActivePanelState])

  return (
    <div className="right-panel active">
      <Contacts onStartChat={startChatWithFriend} />
    </div>
  )
}

export default ContactsRoute
