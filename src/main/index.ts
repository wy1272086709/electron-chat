import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, globalShortcut } from 'electron'
import { join } from 'path'
import axios from 'axios'

axios.interceptors.response.use(
  (response) => {
    console.log('[主进程] 响应response:axios', response)
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

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' && iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
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
  ipcMain.handle('safe-storage-is-available', () => {
    return safeStorage.isEncryptionAvailable()
  })

  // 加密字符串
  ipcMain.handle('safe-storage-encrypt-string', async (_event, plaintext: string) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system')
      }
      const encrypted = safeStorage.encryptString(plaintext)
      // 将 Buffer 转换为 base64 字符串以便存储
      return encrypted.toString('base64')
    } catch (error) {
      console.error('加密失败:', error)
      throw error
    }
  })

  // 解密字符串
  ipcMain.handle('safe-storage-decrypt-string', async (_event, encryptedBase64: string) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption is not available on this system')
      }
      // 将 base64 字符串转换回 Buffer
      const encryptedBuffer = Buffer.from(encryptedBase64, 'base64')
      const decrypted = safeStorage.decryptString(encryptedBuffer)
      return decrypted
    } catch (error) {
      console.error('解密失败:', error)
      throw error
    }
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
    try {
      console.log('[主进程] 收到请求:', config.method?.toUpperCase(), config.url)

      // 添加 base URL
      const requestConfig = {
        ...config,
        baseURL: config.baseURL || API_BASE_URL,
        timeout: config.timeout || 10000
      }

      // 发送请求
      const response = await axios<unknown, ApiResponse>(requestConfig)

      console.log('[主进程] 响应成功:', response)

      return {
        result: response.result,
        data: response.data,
        message: response.message || '请求成功',
        code: response.result ? 0 : 1
      }
    } catch (error: unknown) {
      console.error('[主进程] 请求错误:', error)

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
