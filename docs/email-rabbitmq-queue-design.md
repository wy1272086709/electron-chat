# 邮件发送 RabbitMQ 异步化设计

## 背景

当前前端在注册、重置密码等场景调用：

- `POST /users/sendEmail`

前端只关心接口是否成功返回，不需要知道邮件是同步 SMTP 发送，还是异步队列发送。因此后端可以把邮件发送从 HTTP 请求链路中拆出来，改成 RabbitMQ 异步任务。

## 目标

- HTTP 接口快速返回，避免 SMTP 慢请求拖住用户操作。
- 邮件发送失败可以重试，不影响主接口稳定性。
- 验证码仍然可校验，且有过期时间。
- 前端接口尽量不变。

## 推荐流程

### 1. HTTP 接口

`POST /users/sendEmail`

请求体保持不变：

```json
{
  "to": "user@example.com",
  "type": "REGISTER"
}
```

后端处理：

1. 校验邮箱格式、发送频率、业务类型。
2. 生成验证码。
3. 把验证码写入 Redis，设置 TTL，例如 5 分钟。
4. 发送 RabbitMQ 消息。
5. 立即返回成功。

返回语义建议改为“任务已入队”：

```json
{
  "result": true,
  "code": 200,
  "message": "验证码已发送，请查收邮箱",
  "data": null
}
```

> 不建议继续把验证码 `code` 返回给前端。验证码应只进入 Redis 和邮件内容。

### 2. Redis 验证码存储

推荐 key：

```text
email:code:{type}:{email}
```

示例：

```text
email:code:REGISTER:user@example.com -> 123456
TTL: 300s
```

同时建议加发送频率限制：

```text
email:cooldown:{type}:{email} -> 1
TTL: 60s
```

这样可以避免用户频繁点击“发送验证码”。

### 3. RabbitMQ 消息

Exchange：

```text
email.exchange
```

Queue：

```text
email.send.queue
```

Routing key：

```text
email.send
```

消息体建议：

```json
{
  "jobId": "uuid",
  "to": "user@example.com",
  "type": "REGISTER",
  "code": "123456",
  "template": "verification-code",
  "createdAt": "2026-07-12T10:00:00.000Z"
}
```

注意：

- `jobId` 用于日志追踪和幂等。
- 不要把用户密码、token 等敏感信息放进消息。
- 邮件 worker 只负责发送邮件，不负责生成验证码。

### 4. Worker 消费

邮件 worker 消费 `email.send.queue`：

1. 校验消息结构。
2. 根据 `type/template` 渲染邮件内容。
3. 调 SMTP / 邮件服务商发送。
4. 成功后 ack。
5. 失败后按策略重试。

推荐重试策略：

- 临时错误：重试 3 次，间隔递增。
- 永久错误：进入死信队列。

死信队列：

```text
email.send.dlq
```

## 前端影响

前端可以保持现状：

- 注册页继续调用 `authService.sendVerificationCode(email)`
- 重置密码页继续调用 `/users/sendEmail`
- 成功提示仍显示“验证码已发送，请查收邮箱”

需要注意的是：接口返回成功只代表任务入队成功，不代表用户一定已经收到邮件。

## 验证码校验

验证码校验接口应从 Redis 读取：

```text
email:code:{type}:{email}
```

校验成功后建议删除该 key，避免验证码重复使用。

## 为什么不用数据库存在线任务

邮件任务是典型异步任务：

- 写 DB 再轮询也可以做，但延迟和复杂度更高。
- RabbitMQ 更适合削峰、重试、死信和 worker 横向扩展。
- Redis 更适合验证码 TTL 和频率限制。

推荐组合：

- RabbitMQ：邮件发送任务。
- Redis：验证码、冷却时间、临时状态。
- DB：用户信息、账号状态等长期数据。
