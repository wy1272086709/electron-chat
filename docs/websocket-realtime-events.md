# WebSocket 实时事件规范

## 连接

前端连接 Socket.IO `/chat` 命名空间：

```ts
io('http://localhost:3000/chat', {
  auth: {
    token,
    Authorization: `Bearer ${token}`
  }
})
```

token 来自 `secureStorageService.getAccessToken()`。

## 已实现的聊天事件

前端已监听这些后端事件：

| 事件名                               | 用途             | 前端行为                                               |
| ------------------------------------ | ---------------- | ------------------------------------------------------ |
| `chat:connected`                     | 连接鉴权成功     | 保存当前用户 ID 用于判断消息发送方                     |
| `chat:error`                         | 连接或鉴权异常   | 打印错误日志                                           |
| `message:new`                        | 新消息到达       | 更新会话预览、未读数；当前打开房间时追加消息并标记已读 |
| `message:sent`                       | 发送成功回执     | 刷新会话列表                                           |
| `room:created`                       | 新群聊创建       | 刷新会话列表                                           |
| `room:private`                       | 私聊创建或复用   | 刷新会话列表                                           |
| `room:read`                          | 房间已读状态变化 | 刷新会话列表和未读数                                   |
| `room:cleared`                       | 房间清空         | 刷新会话列表                                           |
| `presence:update`                    | 好友在线状态变化 | 更新私聊会话的在线 / 离线状态                          |
| `user:online` / `presence:online`    | 用户上线         | 更新对应私聊会话为在线                                 |
| `user:offline` / `presence:offline`  | 用户离线         | 更新对应私聊会话为离线，并记录最后在线时间             |
| `room:presence` / `room:onlineCount` | 群聊在线人数变化 | 更新对应群聊会话的在线人数                             |

## 在线状态规范

后端推荐用 Redis 承载实时在线状态，用数据库承载最后在线时间：

- Redis：记录 `userId -> socket 连接数 / 设备数 / TTL`，用于判断 `isOnline`。
- 数据库：记录 `lastSeenAt`，用于离线后展示「X 分钟前在线」。
- Socket 连接成功：写 Redis 在线状态。
- Socket 断开：减少连接数；如果该用户没有其他连接，更新 Redis 离线并写数据库 `lastSeenAt`。
- 异常断线：依赖 Redis TTL / heartbeat 兜底，避免用户永久在线。

会话列表 `GET /chat/rooms` 的私聊对方用户资料建议带：

```jsonc
{
  "user": {
    "id": "userB",
    "username": "b",
    "nickname": "小B",
    "avatarUrl": null,
    "isOnline": true,
    "lastSeenAt": "2026-07-12T10:00:00.000Z"
  }
}
```

实时事件 payload 建议：

```jsonc
{ "userId": "userB", "isOnline": false, "lastSeenAt": "2026-07-12T10:00:00.000Z" }
```

前端同时兼容 `online`、`status: "online" | "offline"`、`lastOnlineAt`、`lastActiveAt` 字段。

群聊会话建议带：

```jsonc
{
  "room": {
    "id": "room1",
    "name": "我的群聊1",
    "memberCount": 120,
    "onlineCount": 8
  }
}
```

群聊在线人数实时事件 payload 建议：

```jsonc
{ "roomId": "room1", "onlineCount": 8, "memberCount": 120 }
```

前端同时兼容 `onlineMemberCount` 字段。

## 通知事件规范

后端后续实现通知推送时，请优先使用以下事件名。前端已经监听这些事件，并会刷新通知列表和会话列表。

| 事件名                  | 触发时机             | 推荐 payload                                       |
| ----------------------- | -------------------- | -------------------------------------------------- |
| `notification:new`      | 创建任意通知         | `{ notification }`                                 |
| `notification:updated`  | 通知内容或状态变化   | `{ notification }`                                 |
| `notification:read`     | 单条通知已读         | `{ notificationId, userId }`                       |
| `notification:readAll`  | 当前用户全部通知已读 | `{ userId }`                                       |
| `friend:request`        | 收到好友申请         | `{ notification }`                                 |
| `friend:requestHandled` | 好友申请被同意或拒绝 | `{ notificationId, result, senderId, receiverId }` |
| `group:invite`          | 收到群聊邀请         | `{ notification, roomId }`                         |
| `group:inviteHandled`   | 群聊邀请被同意或拒绝 | `{ notificationId, result, roomId, userId }`       |

## 推送目标

- 好友申请：推给申请接收人。
- 好友申请处理结果：推给申请人和处理人。
- 群聊邀请：推给被邀请人。
- 群聊邀请处理结果：推给被邀请人、邀请人，必要时推给群主或管理员。
- 通知已读：推给执行已读操作的用户即可。

## 前端刷新策略

收到通知类事件后，前端会重新请求：

- `GET /notifications`
- `GET /chat/rooms`

这能同步好友通知、群聊邀请、未读消息数和会话列表状态。

另外，前端保留了关键词兜底：事件名包含 `notification`、`friend`、`invite` 时，也会触发同样的刷新。但正式实现建议使用上表中的固定事件名。

## 背压说明

WebSocket 事件可能在短时间内连续到达，前端不会对每个事件立即发起一次接口请求，而是会合并刷新会话和通知数据。

IPC 请求侧的并发队列、队列上限和 `429` 语义见 [ipc-backpressure.md](./ipc-backpressure.md)。
