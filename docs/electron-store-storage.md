# Electron Store 存储说明

## 背景

渲染进程不再使用 `localStorage` 保存登录态、用户信息、token 等认证数据。

当前认证数据统一通过 preload 暴露的 `window.secureStorage` 调用主进程 IPC，由主进程写入 `electron-store`。主进程会优先使用 Electron `safeStorage` 加密字符串，再保存到 `electron-store`；如果当前系统不支持加密，则仍写入 `electron-store`，但不会退回 `localStorage`。

## 调用链路

1. 渲染进程调用 `secureStorageService`。
2. `secureStorageService` 调用 `window.secureStorage.setString/getString/removeItem/clear`。
3. preload 通过 `ipcRenderer.invoke` 调用主进程。
4. 主进程使用 `electron-store` 持久化数据。

preload 只暴露 `setString/getString/removeItem/clear/isEncryptionAvailable`，不暴露 `safeStorage.encryptString/decryptString`。加密细节只留在主进程内部。

## 存储键

- `secure_access_token`
- `secure_refresh_token`
- `secure_user_info`
- `secure_is_logged_in`
- `secure_user_email`

## 注意事项

- 认证数据禁止直接写入 `localStorage`。
- 渲染进程只能通过 `secureStorageService` 读写认证数据。
- `safeStorage` 只负责加密/解密，持久化由 `electron-store` 负责。
- preload/IPC 不可用时，前端只使用内存临时兜底，不做本地明文持久化。
