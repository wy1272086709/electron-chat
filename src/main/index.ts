import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, globalShortcut } from 'electron'
import { join, parse, resolve, sep } from 'path'
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'fs'
import { pipeline } from 'stream/promises'
import axios, { type AxiosRequestConfig } from 'axios'
import ElectronStore, { type Options as ElectronStoreOptions } from 'electron-store'

axios.interceptors.response.use(
  (response) => {
    if (response.status === 200) {
      return response.data
    } else {
      return response.data.message || '请求失败'
    }
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Fix for icon import issue
let iconPath: string | undefined
try {
  iconPath = require.resolve('../../resources/icon.png')
} catch {
  console.log('Icon not found, using default')
}

// API 配置
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

interface ApiResponse<T = unknown> {
  result: boolean
  data: T
  message?: string
  code?: number
}

interface IpcApiResponse<T = unknown> {
  result: boolean
  data: T | null
  message?: string
  code: number
  headers?: Record<string, string>
}

interface StoredSecureValue {
  value: string
  encrypted: boolean
}

interface AppStoreSchema extends Record<string, unknown> {
  secureStorage?: Record<string, StoredSecureValue>
}

type ElectronStoreConstructor = new <T extends Record<string, unknown>>(
  options?: ElectronStoreOptions<T>
) => ElectronStore<T>

const StoreConstructor =
  (ElectronStore as unknown as { default?: ElectronStoreConstructor }).default ??
  (ElectronStore as unknown as ElectronStoreConstructor)

const store = new StoreConstructor<AppStoreSchema>({ name: 'app-storage' })
const apiClient = axios.create()
const transferClient = axios.create()

const IPC_BACKPRESSURE = {
  maxConcurrent: getPositiveInteger(process.env.ELECTRON_IPC_MAX_CONCURRENT, 8),
  maxQueueSize: getPositiveInteger(process.env.ELECTRON_IPC_MAX_QUEUE_SIZE, 80)
}

let activeIpcRequests = 0
const ipcRequestQueue: IpcQueueTask[] = []

class IpcBackpressureError extends Error {
  constructor() {
    super('请求过于频繁，请稍后重试')
    this.name = 'IpcBackpressureError'
  }
}

interface IpcQueueTask {
  label: string
  run: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

function getPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function runWithIpcBackpressure<T>(label: string, run: () => Promise<T>): Promise<T> {
  if (
    activeIpcRequests >= IPC_BACKPRESSURE.maxConcurrent &&
    ipcRequestQueue.length >= IPC_BACKPRESSURE.maxQueueSize
  ) {
    console.warn('[主进程] IPC 请求队列已满，拒绝请求:', label)
    return Promise.reject(new IpcBackpressureError())
  }

  return new Promise<T>((resolve, reject) => {
    const task: IpcQueueTask = {
      label,
      run: run as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject
    }

    if (activeIpcRequests < IPC_BACKPRESSURE.maxConcurrent) {
      startIpcQueueTask(task)
    } else {
      ipcRequestQueue.push(task)
      console.warn('[主进程] IPC 请求进入队列:', label, 'queue=', ipcRequestQueue.length)
    }
  })
}

function startIpcQueueTask(task: IpcQueueTask): void {
  activeIpcRequests += 1

  task
    .run()
    .then(task.resolve)
    .catch(task.reject)
    .finally(() => {
      activeIpcRequests -= 1
      drainIpcQueue()
    })
}

function drainIpcQueue(): void {
  while (activeIpcRequests < IPC_BACKPRESSURE.maxConcurrent && ipcRequestQueue.length > 0) {
    const nextTask = ipcRequestQueue.shift()
    if (nextTask) {
      startIpcQueueTask(nextTask)
    }
  }
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!headers || typeof headers !== 'object') return normalized

  Object.entries(headers as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === 'undefined' || value === null) return
    normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
  })

  return normalized
}

function getChatDownloadsDir(): string {
  return resolve(app.getPath('downloads'), 'electron-chat')
}

function isPathInside(targetPath: string, rootPath: string): boolean {
  const target = resolve(targetPath)
  const root = resolve(rootPath)
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`
  return target === root || target.startsWith(rootPrefix)
}

function getAvailableDownloadPath(fileName: string): string {
  const downloadsDir = getChatDownloadsDir()
  mkdirSync(downloadsDir, { recursive: true })

  const safeName = fileName.split(/[\\/]/).filter(Boolean).pop() || `download-${Date.now()}`
  const parsed = parse(safeName)
  let candidate = join(downloadsDir, safeName)
  let index = 1

  while (existsSync(candidate)) {
    candidate = join(downloadsDir, `${parsed.name} (${index})${parsed.ext}`)
    index += 1
  }

  return candidate
}

function secureStorePath(key: string): `secureStorage.${string}` {
  return `secureStorage.${key}`
}

function setSecureStoreString(key: string, value: string): void {
  const canEncrypt = safeStorage.isEncryptionAvailable()
  const stored: StoredSecureValue = canEncrypt
    ? {
        value: safeStorage.encryptString(value).toString('base64'),
        encrypted: true
      }
    : {
        value,
        encrypted: false
      }

  store.set(secureStorePath(key), stored)
}

function getSecureStoreString(key: string): string | null {
  const stored = store.get(secureStorePath(key)) as StoredSecureValue | undefined
  if (!stored?.value) return null

  if (!stored.encrypted) {
    return stored.value
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[安全存储] 当前系统不可解密已加密数据:', key)
    return null
  }

  try {
    return safeStorage.decryptString(Buffer.from(stored.value, 'base64'))
  } catch (error) {
    console.error('[安全存储] 解密失败:', key, error)
    return null
  }
}

async function proxyApiRequest(config: AxiosRequestConfig): Promise<IpcApiResponse> {
  console.log('[主进程] 收到请求:', config.method?.toUpperCase(), config.url)

  const requestConfig = {
    ...config,
    baseURL: config.baseURL || API_BASE_URL,
    timeout: config.timeout || 10000
  }

  const response = await apiClient.request<ApiResponse>(requestConfig)

  console.log('[主进程] 响应成功:', response.data)

  return {
    result: response.data.result,
    data: response.data.data,
    message: response.data.message || '请求成功',
    code: response.data.code ?? (response.data.result ? 0 : 1),
    headers: normalizeHeaders(response.headers)
  }
}

function createApiErrorResponse(error: unknown): IpcApiResponse {
  console.error('[主进程] 请求错误:', error)

  if (error instanceof IpcBackpressureError) {
    return {
      result: false,
      data: null,
      message: error.message,
      code: 429
    }
  }

  let message = error instanceof Error ? error.message : '请求配置错误'
  let code = 1

  if (axios.isAxiosError<{ message?: string }>(error)) {
    const { response, request } = error
    message = response
      ? response.data?.message || response.statusText || '请求失败'
      : request
        ? '网络错误，请检查连接'
        : message
    code = response?.status || code
  }

  return {
    result: false,
    data: null,
    message,
    code
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 830,
    minHeight: 540,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' && iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 开发环境下按 F12 打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  console.log('process.env.NODE_ENV:', process.env.NODE_ENV)
  console.log('process.env.ELECTRON_RENDERER_URL:', process.env['ELECTRON_RENDERER_URL'])
  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // 开发环境下注册 F12 快捷键打开/关闭开发者工具
  if (process.env.NODE_ENV === 'development') {
    globalShortcut.register('F12', () => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow) {
        focusedWindow.webContents.toggleDevTools()
      }
    })
  }

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 安全存储 IPC handlers
  // 检查 safeStorage 是否可用
  ipcMain.handle('secure-storage-is-encryption-available', () => {
    return safeStorage.isEncryptionAvailable()
  })

  ipcMain.handle('secure-storage-set-string', async (_event, key: string, value: string) => {
    setSecureStoreString(key, value || '')
  })

  ipcMain.handle('secure-storage-get-string', async (_event, key: string) => {
    return getSecureStoreString(key)
  })

  ipcMain.handle('secure-storage-remove-item', async (_event, key: string) => {
    store.delete(secureStorePath(key))
  })

  ipcMain.handle('secure-storage-clear', async (_event, keys?: string[]) => {
    if (Array.isArray(keys) && keys.length > 0) {
      keys.forEach((key) => store.delete(secureStorePath(key)))
      return
    }

    store.delete('secureStorage')
  })

  // 文件选择 IPC 处理
  ipcMain.handle('open-file', () => {
    console.log('收到 open-file IPC 请求')
    // 使用同步方式
    const result = dialog.showOpenDialogSync({
      title: '选择文件',
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })

    console.log('dialog.showOpenDialogSync 结果:', result)

    // 如果用户取消了选择，result 可能是 undefined
    const filePaths = result || []
    console.log('返回的文件路径:', filePaths)

    return filePaths
  })

  ipcMain.handle('fetch-data', async (_event, config) => {
    const label = `${config.method?.toUpperCase() || 'GET'} ${config.url || ''}`
    try {
      return await runWithIpcBackpressure(label, () => proxyApiRequest(config))
    } catch (error: unknown) {
      return createApiErrorResponse(error)
    }
  })

  // 文件上传：优先从本地路径创建读取流，避免大文件在渲染器、IPC、主进程各保留一份副本。
  // 后端无 HTTP CORS，渲染器直发 MinIO 会被拦；主进程不受 CORS 限制。
  // 注意：故意不走 runWithIpcBackpressure——该队列 8 并发/80 排队、10s 超时，
  // 专为小 JSON 调校，几个上传会饿死普通 API；上传单独 handler，无超时上限。
  ipcMain.handle(
    'upload-file',
    async (
      _event,
      payload: {
        presignedUrl: string
        filePath?: string
        arrayBuffer?: ArrayBuffer
        contentType: string
        transferId?: string
      }
    ) => {
      try {
        let body: NodeJS.ReadableStream | Buffer
        let contentLength: number

        if (payload.filePath) {
          const fileStat = statSync(payload.filePath)
          if (!fileStat.isFile()) throw new Error('上传目标不是文件')
          body = createReadStream(payload.filePath)
          contentLength = fileStat.size
        } else if (payload.arrayBuffer) {
          body = Buffer.from(payload.arrayBuffer)
          contentLength = payload.arrayBuffer.byteLength
        } else {
          throw new Error('缺少待上传的文件数据')
        }

        await transferClient.put(payload.presignedUrl, body, {
          headers: {
            ...(payload.contentType ? { 'Content-Type': payload.contentType } : {}),
            'Content-Length': contentLength
          },
          timeout: 0,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          onUploadProgress: ({ loaded }) => {
            if (!payload.transferId || _event.sender.isDestroyed()) return
            _event.sender.send('file-transfer-progress', {
              transferId: payload.transferId,
              direction: 'upload',
              loaded,
              total: contentLength,
              progress: contentLength > 0 ? Math.min(loaded / contentLength, 1) : 0
            })
          }
        })
        return { result: true, data: null, code: 0, message: '上传成功' }
      } catch (error) {
        console.error('[主进程] 文件上传失败:', error)
        const code = axios.isAxiosError(error) ? error.response?.status || 1 : 1
        const message = error instanceof Error ? error.message : '上传失败'
        return { result: false, data: null, code, message }
      }
    }
  )

  // 文件下载：主进程流式拉取预签名 GET URL，写入系统下载目录。
  // 跨域 <a download> 不可靠，故走主进程；用 pipeline 流式写入避免大文件占满内存。
  // 文件名做 basename 清洗，防止 path traversal 逃出下载目录。
  ipcMain.handle(
    'download-file',
    async (_event, payload: { previewUrl: string; fileName: string; transferId?: string }) => {
      try {
        const dest = getAvailableDownloadPath(payload.fileName)
        const response = await transferClient.get(payload.previewUrl, {
          responseType: 'stream',
          timeout: 0,
          onDownloadProgress: ({ loaded, total }) => {
            if (!payload.transferId || _event.sender.isDestroyed()) return
            const fileSize = total || 0
            _event.sender.send('file-transfer-progress', {
              transferId: payload.transferId,
              direction: 'download',
              loaded,
              total: fileSize,
              progress: fileSize > 0 ? Math.min(loaded / fileSize, 1) : 0
            })
          }
        })
        await pipeline(response.data, createWriteStream(dest))
        return { result: true, data: { path: dest }, code: 0, message: '下载成功' }
      } catch (error) {
        console.error('[主进程] 文件下载失败:', error)
        const code = axios.isAxiosError(error) ? error.response?.status || 1 : 1
        const message = error instanceof Error ? error.message : '下载失败'
        return { result: false, data: null, code, message }
      }
    }
  )

  ipcMain.handle('open-local-file', async (_event, payload: { path: string }) => {
    try {
      const downloadsDir = getChatDownloadsDir()
      const targetPath = resolve(payload.path)
      if (!isPathInside(targetPath, downloadsDir)) {
        return { result: false, data: null, code: 403, message: '不能打开下载目录之外的文件' }
      }

      const errorMessage = await shell.openPath(targetPath)
      if (errorMessage) {
        return { result: false, data: null, code: 1, message: errorMessage }
      }
      return { result: true, data: { path: targetPath }, code: 0, message: '打开成功' }
    } catch (error) {
      console.error('[主进程] 打开文件失败:', error)
      const message = error instanceof Error ? error.message : '打开文件失败'
      return { result: false, data: null, code: 1, message }
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // 清理快捷键
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在应用退出前清理所有快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
