# 大文件传输与进度展示设计

## 1. 目标

本文描述 Electron 聊天客户端当前的大文件上传、下载和进度展示实现。该能力同时服务于：

- 私聊文件和图片发送。
- 群聊文件和图片发送。
- 聊天消息文件下载。
- 收藏文件下载。

当前目标是稳定支持 100MB 至数百 MB 的文件，并避免渲染进程因为整文件内存复制而卡顿。本文不包含取消传输、断点续传和分片上传。

## 2. 总体架构

职责划分：

| 层       | 职责                                                         |
| -------- | ------------------------------------------------------------ |
| 渲染进程 | 文件选择、乐观消息、业务状态、百分比和进度动画               |
| Preload  | 暴露最小文件 API，转发 IPC 调用和净化后的进度事件            |
| 主进程   | 从磁盘流式读取、向对象存储 PUT、流式下载到磁盘、统计字节进度 |
| 业务后端 | 登录鉴权、生成 MinIO 预签名 URL、保存消息元数据              |
| MinIO    | 保存文件对象，处理实际文件流量                               |

上传路径：

```text
File
  -> 获取预签名 PUT URL
  -> webUtils.getPathForFile
  -> upload-file IPC（只传路径和元数据）
  -> createReadStream
  -> MinIO
  -> Socket 发送消息元数据
```

下载路径：

```text
对象 key
  -> 获取预签名 GET URL
  -> download-file IPC
  -> Axios response stream
  -> pipeline(createWriteStream)
  -> 本地聊天下载目录
```

## 3. 为什么使用预签名 URL

Electron 客户端不能保存 MinIO Access Key 和 Secret Key。安装包可被解包，将长期密钥放入客户端等于向用户暴露对象存储权限。

预签名 URL 具有以下价值：

- MinIO 长期密钥只保存在后端。
- 后端可以先检查登录状态和业务权限。
- URL 只允许在有效期内操作指定对象。
- 上传和下载流量不经过业务后端。
- 消息表只保存长期稳定的对象 key，不保存会过期的 URL。

上传时申请 PUT URL；预览或下载时根据对象 key 重新申请 GET URL。

## 4. 上传实现

### 4.1 渲染进程编排

入口：`src/renderer/src/services/upload.service.ts`

流程：

1. 使用 MIME 和扩展名判断 `IMAGE` 或 `FILE`。
2. 生成唯一对象 key。
3. 图片读取原始宽高。
4. 等待上传并发槽。
5. 获取预签名 PUT URL。
6. 生成本次任务的 `transferId`。
7. 订阅该任务的上传进度。
8. 调用主进程 `upload-file`。
9. 成功后返回对象 key 和文件元数据。

上传并发上限为 2。一次选择多个文件时，多余任务排队，避免同时占满磁盘和网络资源。

### 4.2 文件路径与内存兜底

Preload 使用：

```ts
webUtils.getPathForFile(file)
```

普通文件选择和拖拽文件通常具有本地路径。渲染进程只把路径字符串交给主进程，不调用 `file.arrayBuffer()`。

粘贴截图等内存文件可能没有路径。这类文件回退为 `ArrayBuffer` 上传，保证粘贴图片功能可用。该兜底不适合作为普通大文件路径。

### 4.3 主进程流式 PUT

入口：`src/main/index.ts` 的 `upload-file` handler。

主进程执行：

```ts
const body = createReadStream(filePath)

await transferClient.put(presignedUrl, body, {
  headers: {
    'Content-Type': contentType,
    'Content-Length': fileSize
  },
  timeout: 0,
  maxContentLength: Infinity,
  maxBodyLength: Infinity
})
```

旧实现会形成 `File -> ArrayBuffer -> IPC copy -> Buffer`，一个 100MB 文件可能同时存在多份完整内存副本。当前实现只保留 Node 流缓冲区，内存占用不再随文件大小同比增长。

## 5. 下载实现

聊天消息和收藏记录保存的是对象 key。点击接收文件后，渲染进程先通过 `resolveMediaUrl()` 获取有效的预签名 GET URL，再调用 `download-file`。

主进程使用：

```ts
const response = await transferClient.get(previewUrl, {
  responseType: 'stream',
  timeout: 0
})

await pipeline(response.data, createWriteStream(dest))
```

文件名会经过 basename 清洗，并保存到应用管理的聊天下载目录。若同名文件已经存在，会生成可用的新路径，避免静默覆盖。

下载成功后主进程返回本地路径。界面按钮由“接收文件”切换为“打开文件”，后续通过 `open-local-file` 打开。

## 6. 真实进度

### 6.1 事件模型

每次上传或下载生成唯一 `transferId`。主进程使用 Axios 的 `onUploadProgress` 或 `onDownloadProgress` 获取：

```ts
{
  loaded,
  total,
  progress: loaded / total
}
```

然后向发起任务的 WebContents 发送：

```ts
{
  transferId,
  direction: 'upload' | 'download',
  loaded,
  total,
  progress
}
```

Preload 只向渲染进程暴露 `onTransferProgress(callback)`，不暴露原始 Electron event。任务结束后必须调用返回的清理函数移除监听器。

`transferId` 用于隔离并发任务。接收方只处理与当前任务 ID 和方向均匹配的事件。

### 6.2 消息状态

上传状态流：

```text
uploading(0-100%) -> pending -> sending -> sent
                       \-> failed
```

- `uploading`：文件流正在写入对象存储，`uploadProgress` 为 0 到 1。
- `pending`：对象上传完成，消息已进入本地可靠队列。
- `sending`：Socket 消息已经发出，等待服务端确认。
- `sent`：服务端确认成功。
- `failed`：预签名、上传或消息发送失败。

下载进度属于组件本地状态，不写入消息记录。聊天下载和收藏下载分别维护当前任务的 `downloadProgress`。

### 6.3 扇形动画

组件：`src/renderer/src/components/common/TransferProgress.tsx`

进度通过 `conic-gradient` 映射到 0 至 360 度：

```ts
const degrees = progress * 360

background: conic-gradient(
  #ffffff ${degrees}deg,
  rgba(255, 255, 255, 0.24) ${degrees}deg
)
```

因此进度从小扇形逐渐填满整圆。组件同时提供 `role=progressbar`、百分比 ARIA 值和悬停提示。

展示位置：

- 图片上传：图片中央覆盖进度圆。
- 文件上传：文件卡片右侧显示进度圆，元数据区域显示百分比。
- 聊天文件下载：文件卡片和预览页显示下载进度。
- 收藏文件下载：收藏详情按钮下方显示下载进度。

## 7. IPC 契约

### upload-file

请求：

```ts
{
  presignedUrl: string
  filePath?: string
  arrayBuffer?: ArrayBuffer
  contentType: string
  transferId?: string
}
```

`filePath` 和 `arrayBuffer` 至少提供一个，优先使用 `filePath`。

### download-file

请求：

```ts
{
  previewUrl: string
  fileName: string
  transferId?: string
}
```

成功响应包含本地保存路径。

### file-transfer-progress

```ts
{
  transferId: string
  direction: 'upload' | 'download'
  loaded: number
  total: number
  progress: number
}
```

`progress` 被约束在 0 到 1 之间。

## 8. 当前限制

- 客户端没有设置明确的 MB 上限，最终限制取决于 MinIO、代理配置和磁盘空间。
- 当前使用单次 PUT，不支持分片上传。
- 不支持断点续传。
- 不支持取消传输。
- 应用重启后不会恢复未完成任务。
- 未实现文件 SHA-256 完整性校验。
- 如果下载响应缺少 `Content-Length`，传输仍可完成，但无法计算准确的中间百分比。

## 9. 为什么暂不做分片上传

将 `File.slice()` 切成多块并分别 PUT，不会自动得到一个完整文件，只会产生多个独立对象。正确的 MinIO/S3 Multipart Upload 需要后端提供：

1. 初始化 multipart upload，返回 `uploadId`。
2. 为每个 part 生成上传地址。
3. 客户端上传各 part 并收集 ETag。
4. 后端调用 complete multipart upload 合并分片。
5. 失败时执行 abort multipart upload 清理残留分片。

当前后端只有单次预签名 PUT 接口。在没有上述契约之前，保留流式单 PUT 比前端自行伪分片更正确，也更容易维护。

## 10. 验证清单

- 发送 100MB 文件时界面可以继续操作，内存没有按文件大小产生多份增长。
- 上传百分比单调增加，完成后消息进入发送状态。
- 同时发送 3 个以上文件时，最多只有 2 个实际上传，其余任务等待。
- 私聊和群聊均可发送、接收和打开文件。
- 聊天文件和收藏文件下载均显示进度。
- 下载后的文件大小与原文件一致，并能正常打开。
- 上传失败后可以点击消息失败标记重新上传。
- 多文件并发时，各任务进度互不干扰。

## 11. 相关文件

- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/env.d.ts`
- `src/renderer/src/services/upload.service.ts`
- `src/renderer/src/context/LayoutContext.tsx`
- `src/renderer/src/components/common/TransferProgress.tsx`
- `src/renderer/src/components/chat/MessageMedia.tsx`
- `src/renderer/src/components/favorites/Favorites.tsx`
- `src/renderer/src/assets/main.css`
