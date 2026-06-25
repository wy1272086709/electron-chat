# 请求服务使用指南

## 🔒 安全存储重要提示

**本项目已升级为使用 Electron safeStorage API 进行加密存储，确保 token 和用户信息安全。**

- ⚡ **所有认证数据必须使用 `secureStorageService`**
- ❌ **禁止使用 `localStorage` 存储敏感信息**
- 🔐 **系统级加密**：macOS Keychain、Windows Credential Manager

## 📖 概述

本项目封装了统一的请求服务，支持两种请求模式：

1. **IPC 请求（ipcRequest）**：通过主进程代理，用于后端 API，绕过 CORS 限制
2. **直接请求（directRequest）**：直接在渲染进程请求，用于第三方 API（需服务端支持 CORS）

## 🚀 快速开始

### 安装依赖

项目已安装 `axios`，无需额外安装。

### 配置 API 地址

在 `src/renderer/src/config/api.config.ts` 中配置你的后端 API 地址：

```typescript
export const API_CONFIG = {
  baseURL: 'https://your-backend.com/api', // 修改为你的后端地址
  timeout: 10000,
}
```

或者在 `.env` 文件中配置：

```env
VITE_API_BASE_URL=https://your-backend.com/api
```

## 📝 使用示例

### 1. 认证服务（登录/注册）

```typescript
import { authService, secureStorageService } from '../services'
import { message } from 'antd'

const LoginPage = () => {
  const handleLogin = async () => {
    try {
      const response = await authService.login({
        account: 'user@example.com',
        password: 'password123',
      })

      if (response.result) {
        const { user, token } = response.data

        // 使用安全存储服务保存敏感信息
        await secureStorageService.setLoggedIn(true)
        await secureStorageService.setAccessToken(token.accessToken)
        await secureStorageService.setUserInfo(user)

        // 如果有刷新令牌，也保存
        if (token.refreshToken) {
          await secureStorageService.setRefreshToken(token.refreshToken)
        }

        message.success('登录成功')
        navigate('/')
      }
    } catch (error) {
      message.error('登录失败，请检查用户名和密码')
    }
  }

  return <button onClick={handleLogin}>登录</button>
}

### 2. 聊天服务（发送消息）

```typescript
import { chatService } from '../services'
import { useState } from 'react'

const ChatDetail = ({ chatId }: { chatId: string }) => {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')

  const handleSendMessage = async () => {
    if (!inputText.trim()) return

    try {
      const response = await chatService.sendMessage({
        chatId,
        content: inputText,
        type: 'text',
      })

      if (response.success) {
        setMessages([...messages, response.data])
        setInputText('')
      }
    } catch (error) {
      console.error('发送消息失败:', error)
    }
  }

  return (
    <div>
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id}>{msg.content}</div>
        ))}
      </div>
      <input
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
      />
    </div>
  )
}
```

### 3. 获取聊天列表

```typescript
import { chatService } from '../services'
import { useEffect, useState } from 'react'

const ChatList = () => {
  const [chats, setChats] = useState([])

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const response = await chatService.getChatList()
        if (response.success) {
          setChats(response.data)
        }
      } catch (error) {
        console.error('获取聊天列表失败:', error)
      }
    }

    fetchChats()
  }, [])

  return (
    <div>
      {chats.map((chat) => (
        <div key={chat.id}>{chat.name}</div>
      ))}
    </div>
  )
}
```

### 4. 第三方 API 调用

```typescript
import { userService } from '../services'

// 调用 AI 服务
const handleAIRequest = async () => {
  try {
    const response = await userService.askAI('Hello, how are you?')
    console.log('AI Response:', response)
  } catch (error) {
    console.error('AI 请求失败:', error)
  }
}

// 调用 GitHub API
const fetchGithubUser = async (username: string) => {
  try {
    const response = await userService.getGithubUser(username)
    console.log('GitHub User:', response)
  } catch (error) {
    console.error('获取 GitHub 用户失败:', error)
  }
}
```

### 5. 上传文件

```typescript
import { chatService } from '../services'

const handleFileUpload = async (file: File) => {
  try {
    const response = await chatService.uploadFile(file, 'image')
    if (response.success) {
      console.log('文件上传成功:', response.data.url)
      // 使用上传后的 URL 发送消息
      await chatService.sendMessage({
        chatId: 'xxx',
        content: response.data.url,
        type: 'image',
      })
    }
  } catch (error) {
    console.error('文件上传失败:', error)
  }
}
```

## 🔧 API 参考

### secureStorageService（安全存储服务）🔒

> **重要**：所有认证相关数据必须使用此服务存储

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `setAccessToken(token)` | 存储访问令牌 | `Promise<void>` |
| `getAccessToken()` | 获取访问令牌 | `Promise<string \| null>` |
| `setRefreshToken(token)` | 存储刷新令牌 | `Promise<void>` |
| `getRefreshToken()` | 获取刷新令牌 | `Promise<string \| null>` |
| `setUserInfo(user)` | 存储用户信息 | `Promise<void>` |
| `getUserInfo()` | 获取用户信息 | `Promise<UserInfo \| null>` |
| `setLoggedIn(status)` | 存储登录状态 | `Promise<void>` |
| `getLoggedIn()` | 获取登录状态 | `Promise<boolean>` |
| `clearAuthData()` | 清除所有认证数据 | `void` |
| `setUserEmail(email)` | 存储用户邮箱 | `Promise<void>` |
| `getUserEmail()` | 获取用户邮箱 | `Promise<string \| null>` |

### authService（认证服务）

| 方法 | 说明 | 参数 |
|------|------|------|
| `login(params)` | 用户登录 | `{ email, password }` |
| `register(params)` | 用户注册 | `{ username, nickname, email, password, ... }` |
| `logout()` | 登出 | - |
| `sendVerificationCode(email)` | 发送验证码 | 邮箱地址 |
| `getCurrentUser()` | 获取当前用户 | - |

### chatService（聊天服务）

| 方法 | 说明 | 参数 |
|------|------|------|
| `getChatList()` | 获取聊天列表 | - |
| `getChatDetail(chatId)` | 获取聊天详情 | 聊天 ID |
| `getMessages(params)` | 获取消息历史 | `{ chatId, page, pageSize }` |
| `sendMessage(params)` | 发送消息 | `{ chatId, content, type }` |
| `uploadFile(file, type)` | 上传文件 | 文件对象, 类型 |
| `markMessageAsRead(chatId, messageId)` | 标记已读 | 聊天 ID, 消息 ID |

### userService（用户服务）

| 方法 | 说明 | 参数 |
|------|------|------|
| `getUserInfo(userId)` | 获取用户信息 | 用户 ID |
| `updateUserInfo(data)` | 更新用户信息 | `{ nickname, avatar, bio }` |
| `searchUsers(keyword)` | 搜索用户 | 关键词 |
| `getSettings()` | 获取用户设置 | - |
| `askAI(prompt)` | 调用 AI 服务 | 提示词 |

## ⚠️ 注意事项

### 0. 🔒 安全存储（重要）

**本项目使用安全存储系统保护敏感信息，禁止使用 localStorage 存储以下数据：**
- ✅ **推荐**：使用 `secureStorageService` 存储所有认证相关数据
- ❌ **禁止**：使用 `localStorage` 存储 token、用户信息、登录状态

**为什么需要安全存储？**
- localStorage 是明文存储，任何人都可以通过开发者工具查看
- Electron 应用中，渲染进程代码可被用户检查
- 违反项目安全规范（CLAUDE.md 明确规定）

### 1. CORS 问题

**后端 API**：使用 IPC 请求，自动绕过 CORS 限制 ✅

**第三方 API**：使用直接请求，需要服务端支持 CORS
- 如果遇到 CORS 问题，可以：
  - 配置服务器支持 CORS
  - 使用代理服务（开发环境）
  - 在主进程添加代理（生产环境）

### 2. Token 管理（安全存储）⚡️

本项目使用 **Electron safeStorage API** 进行加密存储，确保敏感信息安全：

#### 🔒 安全存储特性
- **系统级加密**：使用操作系统密钥链/凭据管理器（macOS Keychain、Windows Credential Manager）
- **防止明文存储**：token 和用户信息都被加密存储
- **自动降级**：当加密不可用时自动使用 localStorage 作为备选方案

#### 📝 使用示例

```typescript
import { secureStorageService } from '../services'

// 存储认证信息
await secureStorageService.setAccessToken('your-access-token')
await secureStorageService.setRefreshToken('your-refresh-token')
await secureStorageService.setUserInfo(userInfo)
await secureStorageService.setLoggedIn(true)

// 获取认证信息
const token = await secureStorageService.getAccessToken()
const user = await secureStorageService.getUserInfo()
const isLoggedIn = await secureStorageService.getLoggedIn()

// 清除认证数据（登出时使用）
secureStorageService.clearAuthData()
```

#### ⚠️ 重要说明
- 所有安全存储方法都是**异步**的，必须使用 `await`
- Token 会自动从安全存储中读取并添加到请求头
- 不要再使用 `localStorage` 存储敏感信息

### 3. 错误处理

所有服务方法都会抛出异常，建议使用 try-catch 处理：

```typescript
try {
  const response = await someService.someMethod()
  // 处理成功响应
} catch (error) {
  // 处理错误
  console.error(error)
}
```

### 4. 类型安全

所有服务都有完整的 TypeScript 类型定义，可以获得完整的类型提示：

```typescript
import type { LoginParams, LoginResponse } from '../services'

const params: LoginParams = {
  email: 'user@example.com',
  password: 'password123',
}
```

## 📂 目录结构

```
src/renderer/src/
├── config/
│   └── api.config.ts       # API 配置
├── types/
│   ├── api.types.ts        # API 类型定义
│   └── chat.types.ts       # 聊天类型定义
└── services/
    ├── request.ts          # 统一请求类 ⭐
    ├── secure-storage.service.ts  # 安全存储服务 🔒
    ├── auth.service.ts     # 认证服务
    ├── chat.service.ts     # 聊天服务
    ├── user.service.ts     # 用户服务
    ├── index.ts            # 统一导出
    └── README.md           # 本文档
```

## 🧪 测试

### 在浏览器控制台测试

开发环境下，可以在控制台直接测试：

```javascript
// 测试 IPC 通信
import('electron-vite').then(() => {
  window.api.request({
    method: 'GET',
    url: 'https://api.example.com/test',
  }).then(console.log)
})

// 测试服务
import('./services').then(({ authService }) => {
  authService.login({ email: 'test@test.com', password: '123' })
    .then(console.log)
    .catch(console.error)
})
```

## 🔄 后续优化

- [ ] 添加请求缓存机制
- [ ] 实现请求重试功能
- [ ] 添加请求取消功能
- [ ] 实现 Mock 模式切换
- [ ] 添加请求性能监控

---

如有问题，请参考源码或联系开发团队。
