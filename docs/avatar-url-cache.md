# 头像预览 URL 缓存说明

## 背景

用户头像在业务数据里通常保存的是对象存储路径，例如 `public/avatar.png`，而不是可直接展示的图片地址。

前端展示头像时通过 `resolveAvatarUrl` 统一处理：

1. 如果头像值已经是 `http`、`https`、`data:`、`blob:` 或 `/` 开头的直接地址，原样返回。
2. 如果头像值是对象存储路径，提取文件名。
3. 调用 `userService.getAvatarUrl(fileName)` 请求 `/minio/previewUrl`。
4. 使用后端返回的预览 URL 渲染图片。

相关实现：

- `src/renderer/src/utils/avatar-url.ts`
- `src/renderer/src/services/user.service.ts`

## 旧实现问题

旧实现使用 `Map<string, Promise<string>>` 缓存请求：

```ts
avatarUrlCache.set(
  fileName,
  userService
    .getAvatarUrl(fileName)
    .then((res) => (res.result && res.data?.url ? res.data.url : ''))
    .catch(() => '')
)
```

这个写法有两个问题：

- 接口失败或返回空字符串时，空结果也会被永久缓存，后续不会再重试。
- 对象存储预览 URL 往往是签名地址，可能过期；永久缓存同一个 Promise 会导致头像使用过期 URL。

## 当前策略

当前实现拆成两层缓存：

- `avatarUrlCache`：只缓存成功拿到的 URL，并带过期时间。
- `avatarUrlRequests`：只缓存正在进行中的请求，用于并发去重。

默认缓存时间：

```ts
const AVATAR_URL_CACHE_TTL = 5 * 60 * 1000
```

行为规则：

- 成功拿到非空 URL：写入缓存，5 分钟内复用。
- 返回空 URL：不缓存，下次继续请求。
- 请求异常：不缓存，下次继续请求。
- 同一个 `fileName` 同时被多个组件解析：只发起一次后端请求，其余复用同一个 pending Promise。
- 缓存过期后：重新请求新的预览 URL。

## 清缓存

`avatar-url.ts` 暴露了：

```ts
clearAvatarUrlCache(avatarUrl?: string | null)
```

使用规则：

- 传入头像路径时，只清理该头像对应的缓存。
- 不传参数时，清空全部头像 URL 缓存和进行中的请求。

头像上传成功、用户更换头像、用户信息刷新后，如果需要立即展示新头像，应主动清理对应缓存。

示例：

```ts
clearAvatarUrlCache(oldAvatarUrl)
clearAvatarUrlCache(newAvatarUrl)
```

## 注意事项

- 不要在组件里直接调用 `/minio/previewUrl`，统一使用 `resolveAvatarUrl`。
- 不要把失败结果写入长期缓存。
- 不要把预览签名 URL 当成永久资源地址保存到用户资料里。
- 用户资料里应保存对象存储路径，例如 `public/avatar.png`。
- 头像展示层拿到空字符串时，应继续使用默认头像兜底。

## 本次改动记录

本次修复集中在 `src/renderer/src/utils/avatar-url.ts`：

- 将 `Map<string, Promise<string>>` 改为成功 URL 缓存 `Map<string, AvatarUrlCacheEntry>`。
- 新增 `avatarUrlRequests`，保留并发请求去重能力。
- 新增 5 分钟 TTL，避免长期使用过期预览 URL。
- 失败和空响应不再固化缓存，允许后续自动重试。
- 新增 `clearAvatarUrlCache`，供头像更新流程主动失效缓存。

验证结果：

- `npx prettier --check src/renderer/src/utils/avatar-url.ts` 通过。
- `npm run typecheck:web` 当前仍有既有错误：`src/renderer/src/components/notifications/Notifications.tsx` 中 `filteredNotifications` 未使用，和本次头像缓存改动无关。
