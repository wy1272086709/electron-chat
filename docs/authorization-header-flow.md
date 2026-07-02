# Authorization 响应头刷新说明

## 背景

后端会在响应头中返回新的 `Authorization` 字段。前端不再依赖登录接口响应体里的 `access_token` 作为最终 token 来源。

## 前端处理流程

1. 渲染进程发起 API 请求。
2. 主进程代理请求后，把后端响应体和响应头一起返回给渲染进程。
3. `request.ts` 从响应头读取 `authorization` 或 `Authorization`。
4. 前端去掉可选的 `Bearer ` 前缀，只保存纯 token。
5. 下一次请求时，前端重新拼接 `Authorization: Bearer <token>`。

## 后端响应头规范

后端可以返回以下任一格式：

```http
Authorization: Bearer <token>
```

或：

```http
Authorization: <token>
```

推荐使用第一种格式。

## 登录接口约定

登录成功后，前端仍会保存：

- 登录状态
- 用户邮箱
- 用户信息

token 必须来自响应头 `Authorization`。即使登录响应体仍返回 `access_token`，前端也不会主动使用它覆盖本地 token。
