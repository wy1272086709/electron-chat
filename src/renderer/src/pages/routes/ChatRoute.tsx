import React, { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import ChatList from '@renderer/components/chat/ChatList'
import ChatDetail from '@renderer/components/chat/ChatDetail'
import { SocketContext } from '@renderer/context'
import { useLayoutContext } from '@renderer/context/LayoutContext'

interface ChatRouteProps {
  type: 'chat' | 'groups'
}

const ChatRoute: React.FC<ChatRouteProps> = ({ type }) => {
  const location = useLocation()
  const {
    activePanel,
    selectedChat,
    mobileChatOpen,
    mobileDetailOpen,
    socket,
    chats,
    friendChats,
    groupChats,
    messages,
    clearedChat,
    setActivePanelState,
    handleChatSelect,
    deleteChat,
    markChatAsRead,
    clearChatMessages,
    handleRefreshConversations,
    handleBackToList,
    handleOptimisticSend
  } = useLayoutContext()

  useEffect(() => {
    if (activePanel !== type) {
      const routeState = location.state as { preserveSelectedChatId?: string } | null
      setActivePanelState(type, { preserveSelectedChatId: routeState?.preserveSelectedChatId })
    }
  }, [activePanel, location.state, setActivePanelState, type])

  const selectedChatDetail = selectedChat ? chats.find((c) => c.id === selectedChat) : undefined
  const panelChats = type === 'chat' ? friendChats : groupChats
  const pageChats =
    selectedChatDetail && !panelChats.some((chat) => chat.id === selectedChatDetail.id)
      ? [selectedChatDetail, ...panelChats]
      : panelChats
  const emptyText = type === 'chat' ? '选择一位好友开始对话' : '选择一个群聊查看消息'

  return (
    <>
      {(window.innerWidth > 768 || mobileChatOpen) && (
        <div className="center-panel">
          <ChatList
            chats={pageChats}
            activePanel={type}
            selectedChat={selectedChat}
            onChatSelect={handleChatSelect}
            onDeleteChat={deleteChat}
            onMarkAsRead={markChatAsRead}
            onClearChat={clearChatMessages}
            onRefresh={handleRefreshConversations}
          />
        </div>
      )}

      <div className={`right-panel ${mobileDetailOpen ? 'active' : ''}`}>
        {selectedChat ? (
          <SocketContext.Provider value={{ socket }}>
            <ChatDetail
              chat={selectedChatDetail}
              messages={messages.filter((m) => m.chatId === selectedChat)}
              onBack={handleBackToList}
              isMobile={window.innerWidth <= 768}
              onCleared={clearedChat === selectedChat}
              onSendMessage={handleOptimisticSend}
            />
          </SocketContext.Provider>
        ) : (
          <div className="empty-chat-detail">
            <p>{emptyText}</p>
          </div>
        )}
      </div>

      <style>{`
        .empty-chat-detail {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
        }
      `}</style>
    </>
  )
}

export default ChatRoute
