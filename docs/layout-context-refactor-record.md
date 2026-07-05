# LayoutContext 重构记录

## 背景

`src/renderer/src/context/LayoutContext.tsx` 是当前渲染端最核心的全局状态容器。它同时负责：

- 左侧导航当前面板状态。
- 当前选中的会话。
- 好友消息、群聊消息、消息详情数据。
- 通知数据。
- WebSocket 连接和实时事件处理。
- 通讯录点击好友后创建 / 打开私聊会话。
- 移动端列表 / 详情面板切换。

这种写法短期方便，但问题也明显：文件越来越长，纯数据映射、接口副作用、路由切换、Socket 事件、UI 状态都挤在一起。任何一个状态变化都会让 `LayoutContext.Provider` 重新生成 value，所有 `useLayoutContext()` 的消费者都有机会一起重渲染。

## 关联 Bug 背景

这次重构不是单纯“整理代码”，而是从一个真实 bug 牵出来的：在通讯录页面点击好友后，应用会跳到消息页，但目标用户没有保持选中，右侧聊天详情也可能为空。

完整链路是：

1. `Contacts` 点击好友。
2. `ContactsRoute` 调用 `LayoutContext.startChatWithFriend`。
3. `startChatWithFriend` 调用 `POST /chat/rooms/private` 创建或复用私聊房间。
4. 前端拿到房间 ID 后设置 `selectedChat`。
5. 页面跳转到 `/messages`。
6. `ChatRoute` 根据 `selectedChat` 高亮左侧会话并展示右侧详情。

实际问题不是一个点导致的，而是多个状态边界叠在一起：

- 路由同步面板状态时会清空 `selectedChat`。
- 私聊会话可能没有出现在 `friendChats` 中。
- 私聊接口返回可能是房间对象，也可能是成员数组。
- 创建私聊后，服务端会话列表可能暂时没有返回该房间。
- `loadConversations` 会用服务端列表覆盖本地刚插入的兜底会话。
- `startChatWithFriend` 曾经在通讯录路由尚未卸载时提前设置 `activePanel = 'chat'`，通讯录路由 effect 仍可能反向同步回 `contacts` 并清空选中。

## 排查过程

第一步先确认点击入口。`Contacts.tsx` 中联系人行和发消息按钮都能触发 `onStartChat(friend.id)`，说明事件入口没有丢。

第二步检查路由桥接。`ContactsRoute.tsx` 把 `startChatWithFriend` 直接传给 `Contacts`，说明通讯录页面没有中间状态转换。

第三步检查 `startChatWithFriend`。它调用私聊接口后设置 `selectedChat`，再跳转 `/messages`。这看似正确，但实际跳转后 `ChatRoute` 会调用 `setActivePanelState(type)` 同步面板，而原来的 `setActivePanelState` 在面板变化时会清空 `selectedChat`。

第四步检查消息页列表来源。`ChatRoute` 展示的是 `friendChats`，而 `friendChats` 由 `mapConversation` 把 `chats` 过滤出来。原判断只认 `room.topic === 'PRIVATE'`。如果后端返回的 `topic` 为空、大小写不一致，或者刚创建的私聊还没被会话列表返回，就会出现 `selectedChat` 有值但列表没有对应项的情况。

第五步检查接口返回形态。`getPrivateRoomId` 能从房间对象或成员数组里取 `roomId`，但旧的兜底会话构造只处理房间对象。如果接口返回成员数组，兜底会话不会插入。

第六步检查路由生命周期。`startChatWithFriend` 如果在通讯录路由中提前设置 `activePanel = 'chat'`，通讯录路由自己的 effect 仍可能在卸载前运行，把面板同步回 `contacts`，进而清空刚设置的 `selectedChat`。

第七步检查 `LayoutContext` 的状态覆盖。`loadConversations` 原来直接 `setChats(list)`，会覆盖本地插入的兜底会话。如果服务端列表暂时缺少新私聊，前端刚修好的列表项又会消失。

## 重构目标

这次重构目标分两层：

1. **先修正确性**：保证通讯录点击好友后一定能拿到 roomId、插入或保留会话项、跳转消息页、保持选中。
2. **再降复杂度和渲染成本**：把纯 helper / 类型拆出去，稳定 action 引用，减少 Provider value 因函数引用变化造成的额外渲染。

## 已做修改

### 1. 拆出类型文件

新增：

`src/renderer/src/context/layoutContext.types.ts`

这个文件只放 Context 对外类型：

- `StartChatFriendSnapshot`
- `LayoutContextValue`

这样 `LayoutContext.tsx` 不再混杂大段接口声明，Provider 文件更聚焦于状态和副作用编排。

### 2. 拆出 helper 文件

新增：

`src/renderer/src/context/layoutContext.helpers.ts`

这个文件承载纯映射和兜底逻辑：

- `formatHM`
- `mapConversation`
- `resolveChatAvatar`
- `getPrivateRoomId`
- `mapPrivateRoomFallback`
- `mapServerMessage`
- `mergeConversationList`

好处是这些函数不依赖 React 生命周期，后续可以单独补单元测试，也不会让 Provider 文件继续膨胀。

### 3. 兼容私聊会话识别

`mapConversation` 不再只通过 `room.topic === 'PRIVATE'` 判断私聊。现在优先识别明确 topic，同时兼容 topic 缺失时的两人成员私聊房间。

这样可以减少后端返回字段不规范时，私聊会话被误分到群聊列表的概率。

### 4. 增加私聊 roomId 提取

新增 `getPrivateRoomId(data)`。

它兼容两类返回：

- 房间对象：`data.id` 或 `data.roomId`
- 成员数组：取成员项里的 `roomId`

如果拿不到 roomId，`startChatWithFriend` 会直接提示失败，避免把 `undefined` 写入 `selectedChat`。

### 5. 用联系人快照构造兜底会话

`Contacts` 调用 `onStartChat` 时，现在会把联系人快照一起传入：

- `id`
- `name`
- `username`
- `avatar`

这样即使私聊接口只返回成员数组、没有完整用户信息，`mapPrivateRoomFallback` 也可以用通讯录已有数据创建本地会话项。

### 6. 避免路由竞态清空选中

`startChatWithFriend` 不再在通讯录路由还没卸载时提前设置 `activePanel = 'chat'`。

现在流程是：

1. 创建 / 获取私聊 room。
2. 刷新会话列表。
3. 插入必要的本地兜底会话。
4. 设置 `selectedChat`。
5. `navigate('/messages', { state: { preserveSelectedChatId: roomId } })`。
6. 由 `ChatRoute` 接管面板同步，并根据 `preserveSelectedChatId` 保留选中。

这样避免了通讯录路由 effect 在卸载前把状态同步回 `contacts`。

### 7. 合并会话列表时保留本地兜底

新增 `mergeConversationList(incoming, previous, selectedChatId)`。

`loadConversations` 现在不会无条件用服务端列表覆盖本地 `chats`。如果服务端列表暂时没有当前选中的会话，而本地已有该兜底会话，就保留它。

这对刚创建私聊、服务端列表尚未及时返回新房间的情况很关键。

### 8. 稳定 Context action 引用

以下 action 已改为 `useCallback`：

- `markChatAsRead`
- `clearChatMessages`
- `deleteChat`
- `handleBackToList`

并新增这些 ref 读取最新状态：

- `selectedChatRef`
- `activePanelRef`
- `currentUserIdRef`
- `chatsRef`

这样 action 不需要依赖大量 state，也能读到最新值，减少函数引用变化导致的 Provider value 变化。

### 9. 消息页增加最终渲染兜底

`ChatRoute` 现在会先找到 `selectedChatDetail`。

如果当前面板列表没有这个会话，但总 `chats` 里有，就临时把它补到列表顶部。这样即使会话分类或刷新时序有问题，当前选中的会话也能显示并高亮。

## 当前结果

当前 `LayoutContext.tsx` 已从“类型 + helper + Provider 逻辑全在一个文件”改为：

- `LayoutContext.tsx`：保留 Provider、state、effect、action 编排。
- `layoutContext.types.ts`：Context 对外类型。
- `layoutContext.helpers.ts`：会话映射、消息映射、私聊兜底、列表合并等纯逻辑。

同时修复了通讯录点击好友后无法选中的多层问题：

- 防止 `selectedChat` 被路由同步误清空。
- 防止私聊 room 不在 `friendChats` 时无法高亮。
- 防止私聊接口返回成员数组时无法构造本地会话。
- 防止服务端会话列表覆盖本地兜底项。
- 防止移动端跳转后详情面板不打开。

## 验证结果

已执行：

```bash
npm run typecheck:web
```

结果通过。

建议手动验证：

1. 打开通讯录。
2. 点击好友行。
3. 确认跳转到消息页。
4. 确认左侧目标会话高亮。
5. 确认右侧聊天详情展示该会话。
6. 对已有私聊和第一次创建私聊分别验证。
7. 在窄屏宽度下再验证一次，确认详情面板直接打开。

## 为什么没有一次性拆成多个 Context

确实，所有 state 聚合在一个 `LayoutContext` 中会带来性能问题。理想拆分方向是：

- `NavigationContext`：`activePanel`、移动端面板状态、路由切换。
- `ChatContext`：`chats`、`messages`、`selectedChat`、会话操作。
- `NotificationContext`：通知列表、通知已读、好友申请处理。
- `SocketContext`：Socket 连接和实时事件。
- `FavoritesContext`：收藏列表。

但这次没有直接拆成多个 Provider，原因是风险控制：

- 当前多个页面都通过 `useLayoutContext()` 读取混合状态。
- 直接拆 Context 会影响 `Layout.tsx`、`ChatRoute.tsx`、`ContactsRoute.tsx`、`NotificationsRoute.tsx`、`FavoritesRoute.tsx` 等多个入口。
- 这个 bug 的主路径在“通讯录 -> 私聊 -> 消息页选中”，先拆成多个 Provider 容易把行为变化和性能重构混在一起，增加回归风险。

因此本轮采用低风险重构：

- 先拆纯类型和纯 helper。
- 先稳定 action 引用。
- 先修掉列表覆盖和路由竞态。
- 保持 `useLayoutContext()` 对外 API 不变。

## 后续建议

下一轮如果继续优化性能，可以分两步：

1. 内部先拆多个 Context Provider，但保留 `useLayoutContext()` 作为兼容层。
2. 再逐个页面迁移到更小的 hook，例如 `useNavigationContext()`、`useChatContext()`、`useNotificationContext()`。

这样可以在不一次性改动所有消费者的情况下，逐步降低无关状态更新带来的重渲染。
