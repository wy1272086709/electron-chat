# LayoutContext 拆分设计说明

## 背景

`src/renderer/src/context/LayoutContext.tsx` 原本是一个很大的全局 Context。它同时管理：

- 导航面板状态。
- 当前选中的会话。
- 好友会话、群聊会话、消息列表。
- 通知列表和好友申请。
- 收藏列表。
- WebSocket 连接和实时事件。
- 通讯录点击好友后进入消息页的流程。
- 移动端列表 / 详情面板切换。

这种集中式写法前期开发很快，但状态越来越多以后，会出现两个问题：

1. **职责太宽**：改一个聊天相关逻辑时，容易影响导航、通知、收藏等不相关能力。
2. **渲染边界太粗**：只要 Provider 的 `value` 变化，所有使用 `useLayoutContext()` 的组件都有机会重新渲染，即使组件只需要其中一个字段。

所以这次拆分的核心目的不是为了“文件看起来更碎”，而是为了让状态边界和业务职责更清楚。

## 拆分思路

拆分时没有直接把所有逻辑大幅搬走，而是先按“消费场景”拆 Context：

- 页面导航只关心当前面板和移动端面板状态。
- 聊天页面只关心会话、消息、选中态和会话操作。
- 通知页面只关心通知和好友申请处理。
- 收藏页面只关心收藏数据。

因此拆成四个更小的 Context：

- `NavigationContext`
- `ChatContext`
- `NotificationsContext`
- `FavoritesContext`

同时保留原来的 `LayoutContext` 和 `useLayoutContext()`，作为兼容层。

这样做的原因是：

- 主要页面可以先迁移到更窄的 hook，立即减少无关订阅。
- 旧代码如果还使用 `useLayoutContext()`，不会因为本次重构直接断掉。
- 后续可以按页面继续渐进迁移，不需要一次性大改所有组件。

## 具体拆分

### NavigationContext

负责导航和布局状态：

- `activePanel`
- `mobileChatOpen`
- `mobileDetailOpen`
- `navigatePanel`
- `setActivePanelState`
- `handleBackToList`

这个 Context 的消费者主要是页面外壳和路由层，比如 `Layout.tsx`、`ChatRoute.tsx`、`ContactsRoute.tsx`。

### ChatContext

负责聊天主流程：

- `currentUserId`
- `selectedChat`
- `socket`
- `chats`
- `friendChats`
- `groupChats`
- `messages`
- `clearedChat`
- `unreadCount`
- `handleChatSelect`
- `deleteChat`
- `markChatAsRead`
- `clearChatMessages`
- `handleRefreshConversations`
- `handleOptimisticSend`
- `startChatWithFriend`

它承接了通讯录点击好友进入消息页的关键链路，也包含会话列表和消息详情的状态。

### NotificationsContext

负责通知业务：

- `notifications`
- `pendingNotificationCount`
- `markNotificationAsRead`
- `handleFriendRequest`
- `handleGroupInvitation`

这样通知页不再需要订阅聊天消息、选中会话、收藏列表等状态。

### FavoritesContext

负责收藏业务：

- `favorites`

目前收藏数据较简单，但单独拆出来后，后续接入接口、分页或操作收藏时，不会继续扩大聊天 Context。

## 拆分后的效果

### 1. 订阅更精准

原来页面使用 `useLayoutContext()`，等于订阅整个大对象。

现在：

- `Layout.tsx` 使用 `useNavigationContext()` 和 `useChatContext()`，只取导航状态和未读数。
- `ChatRoute.tsx` 使用 `useNavigationContext()` 和 `useChatContext()`。
- `ContactsRoute.tsx` 使用 `useNavigationContext()` 和 `useChatContext()`。
- `NotificationsRoute.tsx` 使用 `useNavigationContext()` 和 `useNotificationsContext()`。
- `FavoritesRoute.tsx` 使用 `useNavigationContext()` 和 `useFavoritesContext()`。

这样通知变化不会牵动收藏页，收藏变化也不会牵动聊天页。

### 2. 职责更清楚

类型文件 `layoutContext.types.ts` 现在按 Context 拆分出：

- `NavigationContextValue`
- `ChatContextValue`
- `NotificationsContextValue`
- `FavoritesContextValue`
- `LayoutContextValue`

看类型就能知道每个 Context 的职责，不需要打开 Provider 从几百行代码里猜。

### 3. 保留兼容层，降低迁移风险

旧的 `useLayoutContext()` 仍然存在，并且内部还是组合后的完整 value。

这意味着本次拆分不是破坏式改造：

- 新页面和已迁移页面可以用更小的 hook。
- 未迁移组件仍然可以继续工作。
- 后续可以逐个组件替换，不需要一次性完成。

## 如何保证不出错

### 1. 不改变核心状态来源

这次没有把状态本身搬到多个 Provider 文件里，也没有改变状态更新流程。

`activePanel`、`selectedChat`、`chats`、`messages`、`notifications` 等 state 仍然在 `LayoutProvider` 里维护。

拆分的重点是 Provider 暴露出去的订阅边界，而不是重写业务状态机。这样可以避免一次性改动过大。

### 2. 先拆类型，再拆 value

先在 `layoutContext.types.ts` 中定义每个 Context 的 value 类型，再让 `LayoutContext.tsx` 按这些类型创建 memo value。

TypeScript 会约束：

- Context 暴露字段不能漏。
- 页面使用 hook 时字段必须存在。
- 迁移路由时不能从错误的 Context 取字段。

### 3. 每个 value 单独 useMemo

Provider 内部现在分别生成：

- `navigationValue`
- `chatValue`
- `notificationsValue`
- `favoritesValue`

每个 value 只依赖自己需要的 state 和 action。这样既清楚，也减少无关字段变化造成的 value 引用变化。

### 4. 保留 useLayoutContext 兼容旧调用

组合后的 `value` 仍然提供给 `LayoutContext.Provider`。

如果后续还有组件没有迁移，它不会因为拆分 Context 而报错。

### 5. 只迁移主要路由，不盲目大面积替换

这次优先迁移了当前最主要的几个路由页面：

- `Layout.tsx`
- `ChatRoute.tsx`
- `ContactsRoute.tsx`
- `NotificationsRoute.tsx`
- `FavoritesRoute.tsx`

这样可以先覆盖核心页面，又避免一次性触碰太多业务组件。

### 6. 类型检查和 diff 检查

已执行：

```bash
npm run typecheck:web
git diff --check
```

结果都通过。

其中：

- `npm run typecheck:web` 用来确认拆分后的 hook、类型和页面调用没有 TypeScript 错误。
- `git diff --check` 用来确认 diff 中没有空白符等基础问题。

## 当前结论

这次拆分的价值主要是：

- 降低 `LayoutContext` 的订阅粒度。
- 让聊天、通知、收藏、导航的边界更明确。
- 保留旧 API，降低迁移风险。
- 为后续继续拆 Socket、会话逻辑、通知逻辑打基础。

后续如果继续优化，可以再做两步：

1. 继续搜索并迁移剩余 `useLayoutContext()` 调用。
2. 将 Socket 连接和实时事件拆到独立 Provider 或 chat hook 中。

这样 `LayoutProvider` 会进一步变薄，页面重渲染边界也会更可控。
