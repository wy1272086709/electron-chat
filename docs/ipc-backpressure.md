# IPC 背压、限流与降级规范

## 背景

当前项目通过 `ipcRenderer.invoke('fetch-data')` 把后端 HTTP 请求交给 Electron 主进程代理。这个模型天然有请求-响应回执：渲染进程会等待主进程返回 Promise 结果。

风险不在单次 IPC，而在短时间内大量请求同时进入主进程。例如：

- WebSocket 高频推送后，每条事件都触发一次刷新。
- 搜索输入、滚动加载、按钮重复点击同时发起请求。
- 多个页面或组件同时拉取未读数、通知、会话列表。
- 后端慢响应导致主进程积压越来越多未完成任务。

如果没有背压，可能出现主进程内存上涨、请求延迟变长、后端瞬时压力放大、UI 频繁抖动等问题。

## 当前结论

现阶段不需要对普通 HTTP IPC 做分片，也不需要引入持久化消息队列。

当前采用的方案是：

- 主进程对 `fetch-data` 做有界并发队列。
- 队列满时返回 `429`，明确告诉渲染进程需要降速。
- 渲染进程统一提示“操作太频繁，请稍后重试”。
- WebSocket 高频事件在渲染层合并刷新，避免一条事件触发一次拉接口。

这个方案覆盖当前项目的主要风险点，复杂度也比较可控。

## 主进程背压策略

主进程 `fetch-data` IPC 使用有界队列：

- 默认并发数：`8`
- 默认等待队列长度：`80`
- 队列未满：请求进入队列，按先进先出执行。
- 队列已满：立即返回 `429`，不继续堆积。

环境变量：

```bash
ELECTRON_IPC_MAX_CONCURRENT=8
ELECTRON_IPC_MAX_QUEUE_SIZE=80
```

队列满时响应：

```json
{
  "result": false,
  "data": null,
  "message": "请求过于频繁，请稍后重试",
  "code": 429
}
```

相关实现：

- `src/main/index.ts`：`IPC_BACKPRESSURE`、`runWithIpcBackpressure`
- `src/main/index.ts`：`createApiErrorResponse`

## 前端 429 处理

统一请求层需要处理 `code === 429`：

- 展示轻提示：`操作太频繁，请稍后重试`
- 对提示做短时间节流，避免一次拥塞弹出多次提示
- 原始响应继续返回给业务调用方，业务层可按需保留 loading、重试或终止流程

相关实现：

- `src/renderer/src/services/request.ts`：`ipcRequest`
- `src/renderer/src/services/request.ts`：`showRateLimitNotice`

业务层不应该为每个接口重复写 `429` 提示逻辑，除非该操作有特殊恢复方式。

## WebSocket 推送降压

通知、未读数、好友申请、群聊邀请等实时事件应优先走 WebSocket 推送，但推送事件不应直接一条事件拉一次接口。

推荐规则：

- 可直接用推送 payload 更新的，就直接更新本地状态。
- 需要补拉列表时，使用短窗口合并刷新，例如 300ms 到 800ms。
- 同类刷新同一时间只保留一个 pending 请求。
- 如果已经在刷新中，新事件只标记 dirty，等当前请求完成后再决定是否补一次。

示例：

```ts
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRefresh(): void {
  if (refreshTimer) return

  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refreshRooms()
  }, 500)
}
```

## 为什么普通请求不做分片

当前 `fetch-data` 传输的是请求配置和 JSON 响应，属于小对象 IPC。分片主要用于大数据传输，不适合普通 API 请求。

需要分片或流式传输的场景：

- 大文件上传或下载
- 大图片、音视频二进制
- 超大聊天记录导出
- 一次性跨进程传输大量记录

普通接口如果数据量过大，应优先做后端分页，而不是在 IPC 层分片。

## 什么时候需要消息队列

当前主进程队列是内存队列，适合 UI 请求背压，不适合可靠任务。

出现以下场景时，再考虑独立消息队列或任务队列：

- 离线发送消息，需要断网后恢复发送
- 文件上传需要暂停、继续、失败重试
- 后台同步任务需要应用重启后继续执行
- 写操作需要严格顺序、幂等、去重和状态追踪
- 需要将任务状态展示给用户，例如“排队中、上传中、失败、重试中”

这类队列需要持久化状态，不能只靠当前内存队列。

## 什么时候需要回执限流

`ipcRenderer.invoke` 已经是请求-响应回执模型。当前的回执限流流程是：

1. 渲染进程发起 `fetch-data`。
2. 主进程判断是否可执行。
3. 可执行则进入并发队列。
4. 执行完成后返回业务响应。
5. 队列满时返回 `429`。
6. 渲染进程收到 `429` 后提示用户并停止继续放大请求。

如果未来使用 `ipcRenderer.send` 发送无回执事件，需要额外定义 ack：

```ts
type IpcAck = {
  requestId: string
  ok: boolean
  code: number
  message?: string
}
```

无回执事件不允许用于高频、可堆积、需要可靠结果的业务请求。

## UI 层配合规则

为了减少触发背压，UI 层应遵循：

- 按钮提交类请求必须有 loading 或 disabled。
- 搜索输入必须 debounce。
- 滚动加载必须有 `loading` 和 `hasMore` 判断。
- WebSocket 触发的刷新必须合并。
- 同一资源列表避免多个组件各自重复刷新。
- 用户可感知的失败需要有提示，后台静默刷新失败可以只记录日志。

滚动分页建议：

```ts
if (loading || !hasMore) return

const nearBottom = scrollTop + clientHeight >= scrollHeight - 80
if (nearBottom) {
  loadNextPage()
}
```

## 排查指标

如果怀疑出现 IPC 背压问题，优先观察：

- 主进程日志中 `IPC 请求进入队列` 的频率
- 主进程日志中 `IPC 请求队列已满` 的频率
- 前端是否频繁收到 `429`
- WebSocket 事件是否一条推送触发多次 HTTP
- 搜索、滚动、按钮是否缺少 loading/debounce
- 后端接口耗时是否突然变长

## 调参建议

默认配置适合当前聊天客户端的普通请求量。

如果本地开发或测试环境接口较慢，可以临时降低并发数来暴露问题：

```bash
ELECTRON_IPC_MAX_CONCURRENT=2
ELECTRON_IPC_MAX_QUEUE_SIZE=10
```

如果生产环境确实需要更高吞吐，应先确认后端承载能力和前端合并刷新策略，再调整并发上限。

不要通过无限增大队列来解决背压。队列越大，只是把失败变成更慢的失败。

## 后续建议

- 为 `fetch-data` 增加简单统计日志，例如 active、queue、rejected。
- 对消息发送、文件上传等写操作单独设计任务状态，不混用普通 HTTP 队列。
- 对通知、未读数、好友申请、群聊邀请建立统一的实时状态 store。
- 对滚动分页列表统一封装 `loading`、`hasMore`、`page`、`pageSize` 模式。
