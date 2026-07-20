# Electron Chat 打包指南

本文说明 `electron-chat` 项目的 macOS 和 Windows 打包流程，重点记录在没有 Windows 电脑时，如何使用 GitHub Actions 的真实 Windows Runner 生成 Windows 安装包。

## 1. 项目打包结构

项目使用以下工具：

- `electron-vite`：编译 Electron 主进程、preload 和 React 渲染进程。
- `electron-builder`：把编译结果封装为各操作系统的应用和安装包。
- `NSIS`：生成 Windows `.exe` 安装程序。
- GitHub Actions：提供临时 Windows 虚拟机并保存打包产物。

相关配置文件：

- `package.json`：定义构建和打包命令。
- `electron.vite.config.ts`：定义 Electron Vite 构建配置。
- `electron-builder.yml`：定义应用名称、安装包名称、目标平台和包含文件。
- `.github/workflows/build-windows.yml`：定义云端 Windows 打包步骤。

## 2. package.json 中的打包命令

项目当前包含以下脚本：

```json
{
  "build": "npm run typecheck && electron-vite build",
  "build:unpack": "npm run build && electron-builder --dir",
  "build:win": "npm run build && electron-builder --win",
  "build:mac": "electron-vite build && electron-builder --mac",
  "build:linux": "electron-vite build && electron-builder --linux"
}
```

各命令的作用：

| 命令 | 用途 | 主要产物 |
| --- | --- | --- |
| `npm run build` | 类型检查并编译应用 | `out/` |
| `npm run build:unpack` | 生成未封装安装器的应用目录 | `dist/` 下的平台目录 |
| `npm run build:mac` | 生成 macOS 应用和安装包 | `.app`、`.dmg`、`.zip` |
| `npm run build:win` | 生成 Windows NSIS 安装程序 | `.exe` |
| `npm run build:linux` | 生成 Linux 安装包 | AppImage、Snap、Deb |

`build:win` 会先执行 `npm run build`，所以它已经包含 TypeScript 类型检查。

## 3. 打包过程的两个阶段

### 3.1 electron-vite 编译

执行：

```bash
electron-vite build
```

该阶段分别编译：

1. Electron 主进程，输出到 `out/main/`。
2. Electron preload 脚本，输出到 `out/preload/`。
3. React 渲染进程，输出到 `out/renderer/`。

`package.json` 的 `main` 字段指向：

```text
out/main/index.js
```

因此 `out/` 是编译结果，不是最终提供给用户的安装包。

### 3.2 electron-builder 封装

Windows 打包执行：

```bash
electron-builder --win
```

`electron-builder` 读取 `electron-builder.yml`，将 `out/`、运行时依赖和资源文件封装为 Electron 应用，再通过 NSIS 生成安装程序。

当前 Windows 安装程序命名规则为：

```yaml
nsis:
  artifactName: ${name}-${version}-setup.${ext}
```

结合 `package.json` 当前配置：

```json
{
  "name": "electron-chat",
  "version": "1.0.0"
}
```

最终文件名为：

```text
electron-chat-1.0.0-setup.exe
```

## 4. 在 macOS 本地打 macOS 包

首次使用或依赖变化后执行：

```bash
cd /Users/mac/chat/electron-chat
npm install
```

建议先做类型检查，因为当前 `build:mac` 脚本没有包含类型检查：

```bash
npm run typecheck
npm run build:mac
```

当前 Intel Mac 默认生成 x64 产物：

```text
dist/electron-chat-1.0.0.dmg
dist/electron-chat-1.0.0-mac.zip
dist/mac/electron-chat.app
```

其中：

- `.dmg` 适合用户打开后拖动安装。
- `.zip` 适合传输或自动更新。
- `.app` 是未压缩的 macOS 应用。

## 5. 使用 GitHub Actions 打 Windows 包

没有 Windows 电脑时，推荐使用 GitHub Actions 的 `windows-latest` Runner。该 Runner 是 GitHub 提供的真实 Windows 虚拟机，比在 macOS 上使用 Wine 交叉编译更接近用户的运行环境。

工作流文件位于：

```text
.github/workflows/build-windows.yml
```

### 5.1 工作流执行步骤

工作流依次执行：

1. `actions/checkout@v4` 拉取仓库代码。
2. `actions/setup-node@v4` 安装 Node.js 22，并启用 npm 缓存。
3. `npm ci` 根据 `package-lock.json` 精确安装依赖。
4. `npm run typecheck` 执行主进程和渲染进程类型检查。
5. `npm run build:win` 编译应用并生成 Windows 安装程序。
6. `actions/upload-artifact@v4` 上传 `.exe`、`.blockmap` 和 `latest.yml`。

构建时设置：

```yaml
CSC_IDENTITY_AUTO_DISCOVERY: "false"
```

它表示本次测试包不自动查找代码签名证书，避免无证书环境因签名配置而失败。

### 5.2 手动触发 Windows 打包

1. 打开仓库的 GitHub 页面。
2. 进入 `Actions`。
3. 左侧选择 `Build Windows`。
4. 点击 `Run workflow`。
5. 选择 `main` 分支。
6. 再次点击绿色的 `Run workflow`。

本次成功构建页面：

```text
https://github.com/wy1272086709/electron-chat/actions/runs/29670235774
```

当前工作流还会在下面这个文件被推送到 `main` 时自动执行：

```text
.github/workflows/build-windows.yml
```

普通业务源码提交不会自动打包，需要在 Actions 页面手动执行 `Run workflow`。这样可以避免每次开发提交都生成大型安装包。

### 5.3 下载 Windows 安装包

构建成功后：

1. 打开对应的 Workflow Run 页面。
2. 滚动到页面底部的 `Artifacts` 区域。
3. 下载 `electron-chat-windows-x64`。
4. 解压下载的 ZIP 文件。
5. 获取 `electron-chat-1.0.0-setup.exe`。

Artifact 默认保留 14 天，过期后需要重新运行工作流。

## 6. 修改应用版本

安装包版本来自 `package.json`：

```json
"version": "1.0.0"
```

发布新版本前可以执行：

```bash
npm version patch
```

版本变化示例：

```text
1.0.0 -> 1.0.1
```

也可以使用：

```bash
npm version minor
npm version major
```

注意：`npm version` 默认会修改文件、创建 Git Commit 并创建 Tag，执行前应确认工作区状态。

## 7. 安装包签名说明

当前 macOS 和 Windows 产物都没有正式代码签名。

未签名 Windows 安装程序可以用于内部测试，但用户安装时可能看到 Windows SmartScreen 的“未知发布者”提示。公开发布时应配置 Windows 代码签名证书。

未签名、未公证的 macOS 应用也可能被 Gatekeeper 阻止。公开发布时应配置 Apple Developer ID Application 证书并执行 notarization。

签名不会改变应用功能，但会直接影响用户安装体验和系统信任提示。

## 8. 常见问题

### 8.1 `out/` 和 `dist/` 有什么区别？

- `out/`：JavaScript、HTML、CSS 等编译结果。
- `dist/`：最终应用目录、安装程序、压缩包和更新元数据。

### 8.2 为什么推荐 `npm ci` 而不是 `npm install`？

CI 环境需要可重复构建。`npm ci` 严格按照 `package-lock.json` 安装依赖，且不会自动改写锁文件。

本项目同时存在 `package-lock.json` 和 `pnpm-lock.yaml`，当前 Windows 工作流明确使用 npm，因此应保证 `package-lock.json` 与 `package.json` 同步。

### 8.3 Actions 中找不到 Artifact

依次检查：

1. Workflow Run 是否为绿色成功状态。
2. `Upload Windows installer` 步骤是否成功。
3. 是否登录了有仓库访问权限的 GitHub 账号。
4. Artifact 是否已经超过 14 天保留期。

### 8.4 打包成功但应用无法访问后端

打包只负责生成桌面应用，不会把远程后端服务一起封装进去。需要确认：

- 生产环境 API 地址不是 `localhost`。
- WebSocket 地址可以从用户网络访问。
- HTTPS、证书、CORS 和鉴权配置正确。
- `.env` 不会被 `electron-builder` 打进安装包，生产配置必须通过项目允许的方式注入。

### 8.5 Ant Design 的 `use client` 警告是否影响打包？

Vite 可能提示依赖中的模块级 `use client` 指令被忽略。这类提示来自面向多种 React 环境发布的依赖包；本次构建能够成功完成并生成安装包，因此它不是阻塞错误。仍应以实际页面测试作为最终验证。

## 9. 推荐发布检查清单

正式发布前至少完成：

- 更新 `package.json` 版本号。
- 执行类型检查和测试。
- 在目标平台构建安装包。
- 在干净的 Windows 环境实际安装和卸载。
- 验证登录、消息、文件上传、WebSocket 和自动更新。
- 确认生产 API 与 WebSocket 地址。
- 配置代码签名证书。
- 保存构建日志和安装包校验值。

