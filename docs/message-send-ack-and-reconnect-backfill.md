# 消息发送 ACK 回执 + 重连补拉 改造记录

> 涉及仓库：前端 `electron-chat`、后端 `nest-admin`
> 日期：2026-07-09

## 1. 背景：为什么要改

改造前，发送消息是「发后即忘」（fire-and-forget）：

- 前端 `socket.emit('message:sendRoom'/'message:sendPrivate', payload)`，**不带回调**；
- 乐观消息立即上屏，但服务端是否真正落库、是否成功，前端**无从得知**；
- `types/chat.types.ts` 里虽然定义了 `MessageStatus = 'sending'|'sent'|'delivered'|'read'|'failed'`，但**全项目没有任何一处给它赋值**，是死定义。

由此在弱网 / 超时下会出现「静默失败」：

| 场景 | 改造前表现 |
| --- | --- |
| 发送时断线 / 服务端拒收 | 本地消息照常上屏，用户以为发出去了，实际丢失 |
| 慢网（数秒才到服务端） | 无转圈、无状态，用户感觉卡住 |
| 重连后当前会话 | 断线期间对方发的消息不会出现，要切换会话再切回才刷新 |

结论：对聊天产品而言「看起来成功其实没有」是最危险的一类问题，必须把投递结果反馈给用户。

## 2. 方案

### 步骤 1：用 socket.io 的 ack 回执替代「发后即忘」

发送时给 `socket.emit` 附带回调，并用 `socket.timeout(ms)` 兜底超时：

- 收到 ack `{ result: true }` → 状态 `sent`；
- ack 返回失败 / 超时未回执 → 状态 `failed`，提示点击重发。

**协议确认（关键）**：

- `docs/chat-api.md` 的示例是 `socket.emit('message:sendPrivate', {...})`（无回调），后端原本也**没有** ack 能力——`chat.gateway.ts` 里 `@SubscribeMessage` 返回 `{ event: 'message:sent', data }`，这是 NestJS 的「再发一个事件」，**不是 ack**。
- NestJS 的真实分派逻辑见 `@nestjs/platform-socket.io` 的 `io-adapter.js`：

  ```js
  source$.subscribe(([response, ack, isAckHandledManually]) => {
    if (response.event) {
      return socket.emit(response.event, response.data); // {event,data} → 再发一个事件
    }
    if (!isAckHandledManually && isFunction(ack)) {
      ack(response); // 普通对象 → 调用客户端的 ack 回调
    }
  });
  ```

  所以只要 handler **返回一个不带 `event` 字段的普通对象**，NestJS 就会把它作为 ack 回调的实参。`isFunction(ack)` 还保证：客户端若没传回调（老版本前端）则不会调用 `ack()`，**不会崩**。

- 后端继续显式 `client.emit('message:sent', ...)`，保持「刷新会话列表」这一既有行为，未升级的客户端不受影响。**完全向后兼容。**

### 步骤 2：重连后补拉当前会话消息

`socket.on('connect')` 只打了日志。改造为：用闭包标志位区分「首次连接」与「重连」，仅在重连时对当前打开的会话补拉一次历史，消除断线期间的消息空洞。

## 3. 具体改动点（按文件）

### 3.1 后端 `nest-admin/src/chat/chat.gateway.ts`

两个发送 handler：保留 `message:sent` 事件回执（向后兼容），同时返回普通对象作为 ack；用 `try/catch` 把异常也包成 `{ result: false, message }`，避免依赖 NestJS 的异常→ack-error 行为。

**`message:sendRoom`**

```diff
   @SubscribeMessage('message:sendRoom')
   async sendRoomMessage(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: SendRoomMessageDto) {
-    const userId = this.getUserId(client);
-    const message = await this.chatService.sendRoomMessage(userId, body);
-    this.server.to(`room:${body.roomId}`).emit('message:new', message);
-    return { event: 'message:sent', data: message };
+    try {
+      const userId = this.getUserId(client);
+      const message = await this.chatService.sendRoomMessage(userId, body);
+      this.server.to(`room:${body.roomId}`).emit('message:new', message);
+      // 仍以事件形式回推 message:sent（保持「刷新会话列表」等已有行为，未升级客户端不受影响）
+      client.emit('message:sent', message);
+      // 返回普通对象 → socket.io ack：发送方若用 socket.emit(event, payload, cb) 发送，
+      // cb 会收到 { result, data }，用于在客户端精确确认这一条消息的投递结果（替代以前的「发后即忘」）
+      return { result: true, data: message };
+    } catch (error) {
+      return { result: false, message: error?.message || '发送失败' };
+    }
   }
```

**`message:sendPrivate`**（同构，ack 里只回 `result.message`）

```diff
   @SubscribeMessage('message:sendPrivate')
   async sendPrivateMessage(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: SendPrivateMessageDto) {
-    const userId = this.getUserId(client);
-    const result = await this.chatService.sendPrivateMessage(userId, body);
-    await client.join(`room:${result.room.id}`);
-    for (const member of result.room.members) {
-      this.server.to(`user:${member.userId}`).emit('room:private', result.room);
-    }
-    this.server.to(`user:${body.receiverId}`).emit('message:new', result.message);
-    return { event: 'message:sent', data: result };
+    try {
+      const userId = this.getUserId(client);
+      const result = await this.chatService.sendPrivateMessage(userId, body);
+      await client.join(`room:${result.room.id}`);
+      for (const member of result.room.members) {
+        this.server.to(`user:${member.userId}`).emit('room:private', result.room);
+      }
+      this.server.to(`user:${body.receiverId}`).emit('message:new', result.message);
+      client.emit('message:sent', result);
+      // 返回 ack：cb 收到 { result, data }，data 为落库后的 message（含服务端 id）
+      return { result: true, data: result.message };
+    } catch (error) {
+      return { result: false, message: error?.message || '发送失败' };
+    }
   }
```

### 3.2 前端 `types/layout.types.ts`

新增 UI 用的投递状态（只保留真正实现的三个态，不沿用 `chat.types.ts` 里含 `delivered/read` 的死定义）：

```diff
+/**
+ * 本地消息投递状态：仅对「我」发出的消息有意义。
+ * - sending：已乐观上屏，等待服务端 ack
+ * - sent：收到 message:sent 回执 / ack 成功
+ * - failed：ack 超时或失败，可点击重发
+ */
+export type MessageDeliveryStatus = 'sending' | 'sent' | 'failed'
+
 export interface LayoutMessage {
   id: string
   chatId: string
   content: string
   time: string
   sender: 'me' | 'other'
   senderName?: string
   senderAvatar?: string
+  status?: MessageDeliveryStatus
 }
```

### 3.3 前端 `context/layoutContext.types.ts`

`ChatContextValue` 用 `sendMessage` / `retrySendMessage` 替换 `handleOptimisticSend`：

```diff
   handleRefreshConversations: (newRoomId?: string) => Promise<void>
-  handleOptimisticSend: (content: string) => void
+  sendMessage: (content: string) => void
+  retrySendMessage: (messageId: string) => void
   startChatWithFriend: (userId: string, friend?: StartChatFriendSnapshot) => Promise<void>
```

### 3.4 前端 `context/LayoutContext.tsx`（核心）

新增超时常量与 ack 载荷类型：

```diff
 const NOTIFICATION_SOCKET_EVENTS = [ ... ] as const

+/** 等待服务端 ack 的超时时间（ms）；超时未回执则把消息标记为 failed，提示用户重发 */
+const SEND_ACK_TIMEOUT_MS = 8000
+
+/** socket.emit 回执（ack）的载荷形态，对齐后端 DataResult */
+type SendAckResponse = { result?: boolean; data?: unknown; message?: string }
```

新增 `messagesRef`（重发时读取最新消息）：

```diff
   const chatsRef = useRef<LayoutChat[]>(chats)
+  const messagesRef = useRef<LayoutMessage[]>(messages)
```
```diff
   useEffect(() => { chatsRef.current = chats }, [chats])
+  useEffect(() => { messagesRef.current = messages }, [messages])
```

用三个函数替换旧的 `handleOptimisticSend`：`setMessageStatus` / `emitAndWatchAck` / `sendMessage` / `retrySendMessage`。

```ts
const setMessageStatus = useCallback((messageId: string, status: MessageDeliveryStatus): void => {
  setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status } : m)))
}, [])

// 发送消息的底层动作：依据 chatId/peerUserId 选事件，emit 时附带 ack 回调，
// 由 socket.io 的 .timeout() 在超时后以 Error 触发回调，从而驱动 sending → sent/failed。
const emitAndWatchAck = useCallback(
  (chatId: string, content: string, localId: string): void => {
    const sock = socket
    if (!sock) return
    const chat = chatsRef.current.find((c) => c.id === chatId)
    if (!chat) return
    const isGroup = chat.type === 'group'

    const handleAck = (err: Error | null, ack?: SendAckResponse): void => {
      const ok = !err && ack?.result === true
      setMessageStatus(localId, ok ? 'sent' : 'failed')
    }

    if (isGroup) {
      sock
        .timeout(SEND_ACK_TIMEOUT_MS)
        .emit('message:sendRoom', { roomId: chatId, content, messageType: 'TEXT' }, handleAck)
    } else {
      if (!chat.peerUserId) {
        setMessageStatus(localId, 'failed')
        return
      }
      sock
        .timeout(SEND_ACK_TIMEOUT_MS)
        .emit(
          'message:sendPrivate',
          { receiverId: chat.peerUserId, content, messageType: 'TEXT' },
          handleAck
        )
    }
  },
  [socket, setMessageStatus]
)

// 乐观上屏 + 等待 ack：先以 status: 'sending' 立即插入本地消息，再发出带回执的 emit
const sendMessage = useCallback(
  (content: string): void => {
    const trimmed = content.trim()
    const chatId = selectedChatRef.current
    if (!trimmed || !chatId || !socket) return
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: LayoutMessage = {
      id: localId,
      chatId,
      content: trimmed,
      time: formatHM(new Date().toISOString()),
      sender: 'me',
      senderName: '我',
      status: 'sending'
    }
    setMessages((prev) => [...prev, optimistic])
    emitAndWatchAck(chatId, trimmed, localId)
  },
  [emitAndWatchAck, socket]
)

// 重发失败消息：复用同一条本地消息的 id 与内容，重新走 emit + ack
const retrySendMessage = useCallback(
  (messageId: string): void => {
    const target = messagesRef.current.find((m) => m.id === messageId)
    if (!target || target.sender !== 'me' || !socket) return
    setMessageStatus(messageId, 'sending')
    emitAndWatchAck(target.chatId, target.content, messageId)
  },
  [emitAndWatchAck, setMessageStatus, socket]
)
```

步骤 2：重连补拉（`connect` 处理器）：

```diff
-      socket.on('connect', () => console.log('[Socket] connected:', socket?.id))
+      // 首次连接由 selectedChat effect 负责加载历史；这里用闭包标志位区分「重连」，
+      // 仅在重连时为当前打开的会话补拉一次消息，消除断线期间漏掉的消息（步骤 2）。
+      let hasConnectedOnce = false
+      socket.on('connect', () => {
+        console.log('[Socket] connected:', socket?.id)
+        if (!hasConnectedOnce) {
+          hasConnectedOnce = true
+          return
+        }
+        const openChatId = selectedChatRef.current
+        const panel = activePanelRef.current
+        if (openChatId && (panel === 'chat' || panel === 'groups')) {
+          void loadMessages(openChatId, meId)
+        }
+      })
```

> 该 socket effect 的依赖数组相应补上 `loadMessages`（其本身是 `useCallback([])`，稳定，不会触发重连）。

`chatValue` memo 同步替换暴露的方法：

```diff
       handleRefreshConversations,
-      handleOptimisticSend,
+      sendMessage,
+      retrySendMessage,
       startChatWithFriend
```

### 3.5 前端 `components/chat/ChatDetail.tsx`

子组件不再直接持有 socket，只把文本交给回调：

```diff
-import React, { useState, useRef, useEffect, useContext } from 'react'
+import React, { useState, useRef, useEffect } from 'react'
 ...
-import { SocketContext } from '@renderer/context'
+import type { MessageDeliveryStatus } from '@renderer/types/layout.types'
```
```diff
   interface Message {
     ...
     senderAvatar?: string
+    status?: MessageDeliveryStatus
   }

   interface ChatDetailProps {
     ...
-    /** 发送消息时回调（父组件乐观插入，让消息立即上屏） */
-    onSendMessage?: (content: string) => void
+    /** 发送消息回调（父组件负责乐观上屏 + ack 状态机，子组件不再直接操作 socket） */
+    onSendMessage?: (content: string) => void
+    /** 重发失败消息 */
+    onRetrySend?: (messageId: string) => void
   }
```
```diff
   const handleSendMessage: () => void = () => {
     const content = newMessage.trim()
-    if (!content || !chat || !socket) return
-    // 群聊走 message:sendRoom；私聊走 message:sendPrivate（receiverId 为对方 userId）
-    if (isGroup) {
-      socket.emit('message:sendRoom', { roomId: chat.id, content, messageType: 'TEXT' })
-    } else {
-      if (!chat.peerUserId) { ... }
-      socket.emit('message:sendPrivate', { receiverId: chat.peerUserId, content, messageType: 'TEXT' })
-    }
-    onSendMessage?.(content)
+    if (!content || !chat) return
+    // 发送（含乐观上屏 + ack 状态机）下沉到 LayoutProvider：子组件不再直接操作 socket，
+    // 只负责把文本交给回调。群/私聊的区分由 LayoutProvider 依据当前会话类型处理。
+    onSendMessage?.(content)
     setNewMessage('')
     ...
   }
```

新增状态指示（发送中转圈 / 失败点击重发），插在 `message-body` 与 `message-time` 之间：

```tsx
{message.sender === 'me' && message.status === 'sending' && (
  <span className="message-status is-sending" aria-label="发送中" />
)}
{message.sender === 'me' && message.status === 'failed' && (
  <button
    type="button"
    className="message-status is-failed"
    title="发送失败，点击重试"
    onClick={() => onRetrySend?.(message.id)}
  >
    !
  </button>
)}
```

配套样式（深色聊天气泡上的浅色指示器）：

```css
.message-status { display: inline-flex; align-items: center; justify-content: center; align-self: flex-end; margin-bottom: 4px; margin-right: 4px; flex-shrink: 0; }
.message-status.is-sending { width: 14px; height: 14px; border: 2px solid #6b7280; border-top-color: transparent; border-radius: 50%; animation: message-status-spin 0.8s linear infinite; }
.message-status.is-failed { width: 18px; height: 18px; padding: 0; border: none; border-radius: 50%; background: #ef4444; color: #fff; font-size: 12px; font-weight: 700; line-height: 1; cursor: pointer; }
.message-status.is-failed:hover { background: #dc2626; }
@keyframes message-status-spin { to { transform: rotate(360deg); } }
```

### 3.6 前端 `pages/routes/ChatRoute.tsx`

去掉 `SocketContext.Provider` 包裹层（ChatDetail 不再需要直接拿 socket），改用新的发送 action：

```diff
-import { SocketContext } from '@renderer/context'
 import { useChatContext, useNavigationContext } from '@renderer/context/LayoutContext'
 ...
   const {
     selectedChat,
-    socket,
     chats,
     ...
     handleRefreshConversations,
-    handleOptimisticSend
+    sendMessage,
+    retrySendMessage
   } = useChatContext()
 ...
-          <SocketContext.Provider value={{ socket }}>
             <ChatDetail
               ...
-              onSendMessage={handleOptimisticSend}
+              onSendMessage={sendMessage}
+              onRetrySend={retrySendMessage}
             />
-          </SocketContext.Provider>
```

## 4. 验证结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 前端类型检查 | `npm run typecheck:web` | 本次改动文件**全部通过**；仅 `Notifications.tsx` 有一个**既有**未用变量报错（该文件在本次会话前已处于 `M` 暂存态，与本次无关） |
| 前端 Lint（本次文件） | `npx eslint <改动文件>` | `0 errors` / `0 warnings`（`--fix` 后） |
| 后端类型检查 | `npx tsc --noEmit`（nest-admin） | `exit 0` |
| 协议正确性 | 核对 `@nestjs/platform-socket.io/adapters/io-adapter.js:46-53` | 确认「返回不带 `event` 的对象 → `ack(response)`」，且 `isFunction(ack)` 兜底无回调场景 |

> 静态检查已全绿。**运行时建议手动复测**：① 正常发送 → 转圈→消失；② 断网发送 → 8s 后变红色「!」→ 点击重发恢复；③ 看着某会话时拔网再连 → 断线期间对方消息自动补齐。

## 5. 注意事项 / 耦合

- **前后端必须一起部署**：前端现在依赖 ack 回调判定 `sent/failed`。若只升级前端、后端仍是旧版（不返回普通对象 ack），则 `socket.timeout()` 8s 后会一律标 `failed`。后端改动**向后兼容**（老前端走 `message:sent` 事件、新前端走 ack，互不影响）。
- `context/index.ts` 的 `SocketContext` / `useSocket` 已**无消费者**（变成死代码）。本次未删除以缩小改动面，可作为后续清理项。
- `MessageStatus`（`chat.types.ts`）那条含 `delivered/read` 的旧定义仍未启用，本次不触碰，避免误导；UI 只用新定义的 `MessageDeliveryStatus` 三个态。
- 确认依赖事件：`message:sent` 事件继续保留用于刷新会话列表；ack 仅负责单条投递结果。两者职责分离，互不替代。

## 6. 后续可选优化

- 给发送加上**幂等 key**（客户端生成 `clientMessageId` 随包带上），重发也不会重复落库（需后端配合去重）。
- 真正实现 `delivered` / `read`：补 `socket.on('message:read')` 处理器 + 后端读后推送。
- 传输层 `transports: ['websocket']` 可加 `polling` 兜底，并在 `connect_error` 持续失败时给用户「网络异常」提示。
- 失败消息可加重试次数上限 / 本地持久化，避免刷新即丢。
