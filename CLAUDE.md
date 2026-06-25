# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概述

这是一个使用 React 和 TypeScript 构建的 Electron 聊天应用程序。该应用程序提供具有身份验证、实时聊天功能和文件共享功能的桌面消息界面。

## 常用开发命令

### 开发环境
```bash
# 进入 electron-chat 目录
cd electron-chat

# 安装依赖（如果需要）
npm install

# 启动开发模式
npm run dev

# 构建生产版本
npm run build

# 构建开发版本（解压）
npm run build:unpack

# 构建特定平台版本
npm run build:mac
npm run build:win
npm run build:linux

# 预览生产构建
npm run start
```

### 代码质量
```bash
# 使用 Prettier 格式化代码
npm run format

# 代码检查
npm run lint

# 类型检查
npm run typecheck  # 同时检查 Node.js 和 TypeScript
npm run typecheck:node  # 检查 Node.js TypeScript
npm run typecheck:web  # 检查 React TypeScript
```

## 架构设计

### 项目结构
```
electron-chat/
├── src/
│   ├── main/          # Electron 主进程（Node.js）
│   ├── preload/       # 预加载脚本（连接 renderer ↔ main）
│   └── renderer/      # React 应用（浏览器环境）
│       └── src/
├── build/             # 构建输出
├── dist/              # 其他构建产物
├── out/               # 编译后的主进程
└── resources/         # 应用资源
```

### 核心组件

#### 主进程 (`src/main/index.ts`)
- 创建和管理浏览器窗口
- 处理窗口生命周期（显示、隐藏、关闭）
- IPC 通信桥接
- 文件选择对话框功能
- 开发/生产环境加载逻辑

#### 预加载脚本 (`src/preload/index.ts`)
- 安全地将 Electron API 暴露给渲染器
- 使用 `contextBridge` 实现安全通信
- 提供 `electronAPI.openFile()` 用于文件选择
- 保持上下文隔离安全

#### 渲染器应用 (`src/renderer/src/`)
- 带 TypeScript 的 React 应用
- 使用 React Router 进行路由（基于哈希的 URL）
- Ant Design UI 组件配合 Tailwind CSS
- 主要路由：
  - `/login` - 登录页面
  - `/register` - 注册页面
  - `/change-password` - 修改密码
  - `/` - 主聊天界面（受保护路由）

### 状态管理
- 使用 localStorage 存储身份验证状态（`isLoggedIn`）
- 本地组件状态用于聊天消息和 UI 控制
- 目前没有使用外部状态管理库

### IPC 通信
- 渲染器使用 `window.electronAPI.openFile()` 调用主进程
- 主进程处理 `open-file` IPC 处理器
- 返回文件路径给渲染器

### 样式
- Tailwind CSS 用于实用优先的样式
- Ant Design 组件用于 UI 元素
- 自定义 CSS 用于聊天特定动画和布局
- 深色主题支持，带有在线状态指示器

## 开发说明

### 热模块替换 (HMR)
- 开发服务器在代码更改时自动重新加载
- 主进程使用 electron-vite 的 HMR 支持

### 上下文隔离
- 所有 Electron API 都通过预加载脚本暴露
- 直接 `require` 只允许在主进程中
- 渲染器进程不能直接访问 Node.js 模块

### 文件访问
- 文件选择通过 IPC 处理
- 文件通过 Electron 的 dialog API 打开
- 渲染器进程中没有直接的文件系统访问

### 生产环境考虑
- 使用 electron-builder 构建多平台分发
- 通过 electron-updater 支持自动更新
- 使用 Vite 优化包大小

### 身份验证流程
- 登录状态持久化在 localStorage
- 受保护路由如果未认证重定向到 `/login`
- 简单的基于令牌的身份验证（实现可能有所不同）

## 测试
- 测试文件存在但可能需要配置
- 可能需要 Jest/Vitest 设置进行适当测试
- 组件可以独立测试或使用 React Testing Library

## 禁用规则

### 文件操作禁用
- **禁止直接**在渲染器进程中使用 `fs`、`path` 等 Node.js 模块
- **禁止在渲染器进程中**直接读取或写入本地文件系统
- **禁止使用** `require` 或 `import` Node.js 模块到渲染器进程（除非通过 preload 脚本暴露）

### 通信限制
- **禁止直接**在渲染器进程中调用 Electron IPC 方法
- **必须使用** `window.electronAPI` 或 preload 脚本暴露的 API
- **禁止通过 `eval()`** 执行来自不可信源的代码

### 安全要求
- **必须保持** context isolation 启用
- **禁止在预加载脚本中**使用 `preload` 属性直接暴露 Node.js 模块
- **禁止将敏感信息**存储在 localStorage 或 sessionStorage
- **必须使用 HTTPS** API 请求（生产环境）

### 代码规范
- **必须使用** TypeScript 编写所有代码
- **禁止忽略** ESLint 错误
- **禁止直接使用** 内联样式，优先使用 CSS 类或 Tailwind
- **禁止直接操作 DOM**，使用 React 状态和 ref

### 性能要求
- **禁止使用** 可能导致内存泄漏的未清理事件监听器
- **禁止在渲染循环中**创建不必要的对象
- **注意** 聊天消息列表的性能优化，避免过度渲染