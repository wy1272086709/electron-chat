/**
 * Socket 共享上下文
 *
 * /chat 命名空间的 socket.io 实例由 LayoutProvider 创建并持有，
 * 通过本 Context 以 { socket } 形式下发给子树（如 ChatDetail），供其 emit 消息。
 * 连接建立前 socket 为 null，子组件使用前需判空。
 */
import { createContext, useContext } from 'react'
import type { Socket } from 'socket.io-client'

export interface SocketContextValue {
  socket: Socket | null
}

export const SocketContext = createContext<SocketContextValue>({ socket: null })

/** 在 SocketContext.Provider 子树内取共享 socket */
export const useSocket = (): SocketContextValue => useContext(SocketContext)
