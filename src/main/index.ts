import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, globalShortcut } from 'electron'
import { join } from 'path'
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
} catch (e) {
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
