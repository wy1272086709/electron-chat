# 聊天图片 / 文件发送设计文档

> 大文件流式传输、真实进度、IPC 契约和分片决策详见 [大文件传输与进度展示设计](./large-file-transfer-progress-design.md)。

## 目标

让聊天支持接近微信的图片与文件体验：

- 图片可从按钮选择、粘贴截图、拖拽发送。
- 图片发送前有大图预览，可填写备注。
- 图片消息在气泡内直接展示，点击可放大查看。
- 文件可从按钮选择或拖拽发送。
- 文件消息以文件卡片展示，点击进入“文件预览”，再点“接收文件”下载。
- 上传 / 发送失败时保留本地消息，可点击重试。

## 当前实现

### 入口层

文件：`src/renderer/src/components/chat/ChatDetail.tsx`

- 图片按钮触发隐藏的 `input[type=file][accept=image/*]`。
- 文件按钮触发隐藏的 `input[type=file][multiple]`。
- 粘贴事件识别 `clipboardData.items` 中的图片，进入图片预览。
- 拖拽事件：
  - 单张图片进入图片预览。
  - 多文件或非图片文件直接发送。
- 图片预览组件：`MediaPreviewModal`。
- 文件展示组件：`MessageMedia`。

### 上传层

文件：`src/renderer/src/services/upload.service.ts`

流程：

1. 根据 MIME 判断 `IMAGE` / `FILE`。
2. 生成对象存储 key：`chat-<yyyymmdd>-<timestamp>-<random>.<ext>`。
3. 图片读取原始宽高，写入 `mediaWidth/mediaHeight`。
4. 调用 `/minio/presignedUrl` 获取预签名 PUT URL。
5. 优先将文件本地路径交给主进程 `upload-file` IPC，由主进程创建读取流并执行 PUT；没有本地路径的粘贴图片使用字节兜底。
6. 返回 `objectName/fileName/fileSize/fileType/messageType`。

消息发送时只把 `objectName` 作为后端 `fileUrl` 保存，不保存预签名 URL。

### 主进程 IPC

文件：`src/main/index.ts`

- `upload-file`：主进程用文件读取流 PUT 预签名 URL，绕过浏览器 CORS 并避免整文件内存复制。
- `download-file`：主进程流式下载预签名 GET URL 到本地聊天下载目录。
- `file-transfer-progress`：按 `transferId` 向渲染进程推送上传和下载的真实字节进度。

### 消息状态

文件：`src/renderer/src/context/LayoutContext.tsx`

状态流：

1. `uploading`：先乐观上屏；图片用 `blob:` 本地预览。
2. 上传成功后回填 `objectName`，切换为 `sending`。
3. 通过 socket 发送：
   - 群聊：`message:sendRoom`
   - 私聊：`message:sendPrivate`
4. ack 成功切 `sent`，并回收本地 `blob:` URL。
5. 上传失败或 ack 失败切 `failed`。

UI 约定：

- `uploading`：显示由扇形逐步填满整圆的真实上传进度。
- `sending`：显示等待服务端确认的转圈状态。
- `failed`：显示红色感叹号，可点击重试。
- `sent` 或服务端真实消息：不显示红点。

重试策略：

- 如果已有 `objectName`，只重发 socket，不重复上传，避免对象存储孤儿文件。
- 如果还没有 `objectName`，从 `pendingFilesRef` 取原始 `File` 重新上传。
- 如果原始文件丢失，保持失败状态。

### 展示层

文件：`src/renderer/src/components/chat/MessageMedia.tsx`

- 图片：
  - 上传中展示本地 `blob:`。
  - 已发送 / 已接收后通过 `resolveMediaUrl(objectName)` 获取预签名 GET URL。
  - 点击放大。
- 文件：
  - 气泡里展示文件卡片。
  - 点击进入文件预览页。
  - 文件预览页点击“接收文件”后下载。

文件：`src/renderer/src/utils/media-url.ts`

- 以完整对象 key 请求 `/minio/previewUrl`。
- 成功 URL 缓存 5 分钟。
- 同一个 key 的并发请求会复用同一个 pending Promise。

## 后端契约

Socket 发送媒体消息时使用后端 `MessageType`：

- 图片：`messageType=IMAGE`，必填 `fileUrl`。
- 文件：`messageType=FILE`，必填 `fileUrl`。

可选字段：

- `fileName`
- `fileSize`
- `fileType`
- `thumbnailUrl`
- `mediaWidth`
- `mediaHeight`

历史消息和实时消息都通过 `mapServerMessage` 映射为 `LayoutMessage.attachment`。

兼容策略：

- 标准媒体消息按 `messageType + fileUrl/fileName` 识别为图片 / 文件。
- 如果历史数据曾以纯文本 `[文件: xxx]` 或 `[图片: xxx]` 入库，前端会尽量按媒体卡片展示。
- 如果后端/浏览器给的 MIME 不准确，前端会用扩展名兜底；`.png/.jpg/.webp` 等按图片展示。
- 这种历史兼容数据没有真实 `fileUrl` 时，只能展示外观，不能下载或预览真实文件。

## 遇到的问题与处理

### 1. MinIO / 对象存储 CORS

问题：渲染进程直接 PUT 预签名 URL 容易被 CORS 拦截。

处理：上传统一走主进程 `upload-file` IPC，主进程不受浏览器 CORS 限制。

### 2. 预签名 URL 会过期

问题：预签名 GET / PUT URL 不能持久保存到消息表。

处理：消息里只保存对象 key，也就是 `fileUrl=objectName`。展示或下载时再请求 `/minio/previewUrl` 获取短期 URL。

### 3. 对象 key 兼容性

问题：聊天媒体最初计划使用 `chat/20260710/a.png` 这类带 `/` 的对象 key，但部分预签名接口或历史预览接口对 `/` 编码兼容不稳定。

处理：新上传改为平铺唯一 key：`chat-20260710-<timestamp>-<rand>.png`。`media-url.ts` 仍支持完整 key，避免已存在的旧对象失效。

### 4. 多张空备注图片的乐观消息去重

问题：如果只按 `chatId + content + messageType` 去重，多张空备注图片可能互相误删。

处理：实时 `message:new` 回来后，媒体消息优先按 `attachment.objectName` 精确匹配本地乐观消息。

### 5. React 19 effect 规则

问题：`react-hooks/set-state-in-effect` 不允许在 effect 中同步 setState。

处理：本地 `blob:` 图片预览改为派生值，只有异步解析出的远程预签名 URL 写入 state。

### 6. 历史消息可能是纯文本占位

问题：早期实现会把文件发成纯文本 `[文件: xxx]`，导致消息区看起来像普通文案气泡。

处理：`mapServerMessage` 增加兼容解析，识别 `[文件: xxx]` / `[图片: xxx]` 后转成 `attachment`，由 `MessageMedia` 按文件卡片或图片占位渲染。

### 7. 后端 ack 形态不固定

问题：发送图片/文件后，服务端可能直接 ack 消息对象或空值，而不是 `{ result: true }`。如果前端只认 `result === true`，已发送成功的图片会被误标 `failed`，出现红色感叹号。

处理：

- 文本消息仍按 socket timeout/error 或明确 `{ result: false }` 判失败。
- 媒体消息在 socket 前已经完成对象存储上传；部分后端不会调用 socket callback，导致 timeout。因此媒体消息只在明确 `{ result: false }` 或上传阶段失败时显示红点。
- 本地图片的 `blob:` 预览不会在 ack 成功后立刻释放，避免远程预签名 URL 尚未接管时出现“图片暂不可预览”；等服务端真实消息替换本地乐观消息时再释放。

### 8. PNG 被当成文件卡片

问题：部分文件选择场景下 `File.type` 可能为空或不准确，`.png` 会被当成普通文件。

处理：新增 `isImageFile(fileName, fileType)`，使用 MIME + 扩展名双重判断；发送、上传、历史消息映射都复用这套规则。

### 9. 失败原因不可见

问题：红点只显示 `!`，无法区分预签名失败、PUT 上传失败、socket 被后端拒绝或原始文件丢失。

处理：`LayoutMessage.errorMessage` 记录失败原因；红点 `title` 和点击提示都会展示原因，同时继续执行重试。

## 暂不包含

- 分片上传 / 断点续传：目前使用单次预签名 PUT；Multipart Upload 需要后端提供初始化、分片签名和完成合并接口。
- 取消传输：当前上传和下载任务开始后会执行到成功或失败。
- 客户端缩略图生成：目前图片原图展示，`thumbnailUrl` 预留。
- 视频 / 语音消息：后端支持 `VIDEO/AUDIO`，本次只实现图片与普通文件。
- 文件大小限制：当前以前端不限制为主，依赖后端 / 对象存储限制。

## 传输进度

- 主进程通过 Axios 的字节进度回调计算上传 / 下载比例。
- 每个任务使用独立 `transferId`，通过 preload 安全桥接到渲染进程，多个并发任务不会串进度。
- 上传进度写入本地消息的 `uploadProgress`；聊天下载和收藏下载在组件内维护当前进度。
- UI 使用 `conic-gradient` 从扇形逐步填满整圆，并同步展示整数百分比。
