# 通讯录跳转消息页后用户无法选中问题记录

## 背景

在通讯录页面点击好友或点击好友右侧的发消息按钮后，页面会跳转到消息界面，但消息列表中的目标用户没有保持选中，右侧聊天详情也可能显示为空状态。

## 现象

1. `Contacts` 组件点击联系人时会调用 `onStartChat(friend.id)`。
2. `ContactsRoute` 将 `LayoutContext.startChatWithFriend` 作为 `onStartChat` 传入。
3. `startChatWithFriend` 调用 `POST /chat/rooms/private` 创建或复用私聊房间，再跳转到 `/messages`。
4. 跳转后 `selectedChat` 被路由面板同步逻辑清空，导致消息页无法选中刚创建或复用的私聊会话。

## 排查过程

- 先检查 `ContactsRoute.tsx`，确认通讯录点击链路确实进入 `startChatWithFriend`。
- 再检查 `Contacts.tsx`，确认联系人列表项和发消息按钮传入的是好友用户 ID，而不是房间 ID。
- 继续检查 `LayoutContext.tsx`，发现 `startChatWithFriend` 会把私聊接口返回的房间 ID 写入 `selectedChat`，随后 `navigate('/messages')`。
- 最后检查 `ChatRoute.tsx` 的面板同步 effect，发现路由切到消息页时会调用 `setActivePanelState(type)`；而 `setActivePanelState` 在面板变化时会清空 `selectedChat`。
- 第一轮修复后，用户点击验证仍失败。继续从“是否有选中值”和“列表中是否有对应项”两个方向拆分：即使 `selectedChat` 保住，只要 `friendChats` 没有该 room，列表就不会高亮。
- 第二轮修复后，用户点击验证仍失败。继续复查接口返回形态，发现 `getPrivateRoomId` 可以从 `RoomMember[]` 中取到 `roomId`，但旧的兜底 mapper 遇到数组返回 `null`，导致本地列表项没有插入。
- 第三轮修复后，继续检查路由生命周期，发现 `startChatWithFriend` 在通讯录路由尚未卸载时提前设置 `activePanel = 'chat'`，通讯录路由 effect 仍可能把面板同步回 `contacts` 并清空选中。
- 最后检查 `LayoutContext.tsx` 的状态更新方式，发现 `loadConversations` 会用服务端列表直接覆盖 `chats`。如果后端列表暂时不含新私聊 room，会把刚插入的本地兜底会话冲掉。

## 根因

通讯录点击好友是一个跨面板流程：先从 `contacts` 面板创建或复用私聊房间，再进入 `chat` 面板并选中该房间。

原来的 `setActivePanelState` 把“同步当前路由对应面板”和“切换面板时清空选中会话”耦合在一起。用户从通讯录跳到消息页时，`startChatWithFriend` 刚设置好的 `selectedChat` 会被消息路由的面板同步 effect 清掉。

此外，私聊接口的返回值在历史代码中出现过两种读取方式：标准返回为房间对象 `data.id`，也曾尝试从成员数组里的 `roomId` 读取。为了避免返回形态差异导致选中失败，本次修复也对房间 ID 提取做了保护。

用户实际点击验证后，问题仍未完全解决。继续排查发现第二层问题：消息页列表只展示 `friendChats`，而 `friendChats` 来自 `mapConversation` 对会话类型的判断。原实现只认 `room.topic === 'PRIVATE'`。如果后端会话列表中的私聊 `topic` 为空、大小写不一致，或创建私聊后列表接口暂时还没返回目标房间，前端会出现 `selectedChat` 已设置但消息列表没有对应项的情况，于是表现仍然像“没有选中用户”。

第二次用户验证后仍未解决，继续复盘发现本地兜底还有遗漏：当 `POST /chat/rooms/private` 返回的是 `RoomMember[]` 这类成员数组时，虽然可以从成员项里取到 `roomId`，但旧的 `mapPrivateRoomFallback` 只处理房间对象，遇到数组直接返回 `null`，因此兜底会话没有插入到 `chats`。同时在窄屏/移动布局下，从通讯录发起私聊没有像手动点击会话一样打开详情面板，也会造成“跳转后看不到选中会话”的体感。

第三次继续排查时，又发现一个路由竞态：`startChatWithFriend` 在仍处于通讯录路由时提前 `setActivePanel('chat')`，通讯录路由的 effect 仍可能在卸载前检测到 `activePanel !== 'contacts'`，随后调用 `setActivePanelState('contacts')` 把刚设置的 `selectedChat` 清空。最终改为在 `startChatWithFriend` 中只设置 `selectedChat` 和本地兜底会话，然后 `navigate('/messages')`，由消息路由接管面板同步。

第四次继续审查 `LayoutContext.tsx` 性能和状态流时，发现 `loadConversations` 直接 `setChats(list)` 会覆盖本地兜底项。这个覆盖会让修复在接口返回慢、不完整或 topic 不规范时仍然失效。同时，`markChatAsRead`、`clearChatMessages`、`deleteChat`、`handleBackToList` 等 action 每次渲染都会创建新函数，导致 `LayoutContext.Provider` 的 value 更容易变化，扩大下游重渲染范围。

## 修复方案

1. 新增 `getPrivateRoomId(data)`，兼容从房间对象 `id` 或成员数组 `roomId` 提取私聊房间 ID。
2. `startChatWithFriend` 在拿不到房间 ID 时直接提示失败，避免把 `undefined` 写入 `selectedChat`。
3. 从通讯录跳转到 `/messages` 时，通过路由 state 携带 `preserveSelectedChatId`。
4. `ChatRoute` 在同步消息面板状态时读取该标记，并调用 `setActivePanelState(type, { preserveSelectedChatId })`。
5. `setActivePanelState` 保持默认行为不变：普通路由切换仍会清空旧选中；只有显式传入的 `preserveSelectedChatId` 与当前 `selectedChat` 匹配时，跨面板打开私聊流程才保留选中。
6. 增加 `isPrivateConversation`，优先使用 `room.topic` 判断私聊，同时对 `topic` 缺失的两人房间做兼容识别。
7. 增加 `mapPrivateRoomFallback`。`startChatWithFriend` 刷新会话列表后，如果目标 `roomId` 仍未出现在本地 `chats` 中，就用私聊接口返回的房间成员信息插入一条本地好友会话，保证消息页立即有可选中的列表项。
8. `Contacts` 调用 `onStartChat` 时传入联系人快照。即使私聊接口只返回成员数组、没有完整用户嵌套资料，也能用通讯录中的昵称、用户名和头像构造本地兜底会话。
9. `startChatWithFriend` 在移动布局下同步打开详情面板，与手动点击消息列表会话的行为一致。
10. `startChatWithFriend` 不再在通讯录路由中提前设置 `activePanel`，避免通讯录路由卸载前的同步 effect 清空选中。
11. `ChatRoute` 增加最终渲染兜底：如果 `selectedChat` 对应会话存在于总 `chats`，但不在当前面板列表中，则临时补到列表顶部，保证当前选中项一定能渲染并高亮。
12. `loadConversations` 改为通过 `mergeConversationList` 合并服务端列表和当前选中的本地兜底会话，避免接口列表覆盖掉刚创建的本地会话项。
13. `LayoutContext` 增加 `currentUserIdRef` 和 `chatsRef`，让稳定回调可以读取最新状态，减少对 state 依赖的函数重建。
14. 将 `markChatAsRead`、`clearChatMessages`、`deleteChat`、`handleBackToList` 等 action 包成 `useCallback`，降低 Provider value 因函数引用变化造成的额外渲染。

## 性能优化记录

- **问题**：`LayoutContext` 是全局上下文，value 中任意函数引用变化都会让消费它的组件重新渲染。原先多个 action 是普通函数，Provider 每次渲染都会创建新引用。
- **处理**：把无须依赖渲染态的 action 改成 `useCallback`，并用 `selectedChatRef`、`currentUserIdRef`、`chatsRef` 读取最新状态。
- **问题**：会话刷新直接覆盖 `chats`，会与本地乐观插入/兜底插入冲突。
- **处理**：新增 `mergeConversationList`，在服务端列表缺少当前选中会话时保留本地会话项。
- **边界**：当前上下文仍包含较多状态，后续如果继续优化，可按职责拆成 `ChatContext`、`NotificationContext`、`NavigationContext`，减少无关组件订阅同一个大 value。

## 涉及文件

- `src/renderer/src/context/LayoutContext.tsx`
- `src/renderer/src/pages/routes/ChatRoute.tsx`

## 验证建议

1. 打开通讯录页面。
2. 点击任意好友列表项。
3. 确认页面跳转到消息页。
4. 确认左侧消息列表中对应好友会话处于选中状态。
5. 确认右侧聊天详情展示该好友的聊天内容或空会话输入区。
