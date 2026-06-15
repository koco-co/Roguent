# X 与 GitHub 订阅申请/配置步骤

本文记录 Roguent 接入 X 与 GitHub 订阅所需的账号申请、凭证创建、回调配置和本地验证步骤。

当前目标:

- X: `@SugerQvQ`
- GitHub: `koco-co/Roguent`

官方页面最后核对日期: 2026-06-15。

## Roguent 需要绑定的内容

优先在 Roguent `CONFIG` -> `IM / 订阅` 中填写并保存。敏感字段会由 Engine 写入 SecretStore,SQLite 里只保留 `secretRef`。

| 设置项 | 用途 | 推荐来源 |
| --- | --- | --- |
| `Webhook base URL` | 公开 HTTPS 回调根地址。Roguent 会自动拼出 `/webhooks/github` 和 `/webhooks/x`。 | Cloudflare Tunnel、ngrok、localhost.run 或生产 relay |
| `GitHub repo` | 要订阅的仓库。 | `koco-co/Roguent` |
| `GitHub token` | 调 GitHub API 创建/更新仓库 webhook。 | GitHub fine-grained PAT,只给目标仓库 `Webhooks: Read and write` |
| `GitHub webhookSecret` | GitHub webhook HMAC secret。 | `openssl rand -hex 32` |
| `X handle` | 要订阅的 X 账号。 | `@SugerQvQ` |
| `X bearerToken` | 调 X API 注册 webhook、创建 filtered stream rule。 | X Developer Console App Bearer Token |
| `X consumerKey` | X App Consumer Key / API Key。当前 filtered-stream webhook 注册不直接使用,但保存它用于绑定同一个 X App 和后续 OAuth/Account Activity 扩展。 | 你 `.zshrc` 里的 `Consumer_Key` |
| `X secretKey` | X CRC challenge 和 POST 签名校验使用的 App Secret Key。 | 你 `.zshrc` 里的 `Secret_Key` |

你已经拿到的 X 三个值按下面映射填进设置页:

- `.zshrc` `Bearer_Token` -> Roguent `X bearerToken`
- `.zshrc` `Consumer_Key` -> Roguent `X consumerKey`
- `.zshrc` `Secret_Key` -> Roguent `X secretKey`

`Webhook base URL` 必须是外网能访问的 HTTPS 根地址,不要带 `/webhooks/...` 路径。X 回调通常不能使用带显式端口的公网 URL,优先使用 443 HTTPS 域名。

环境变量 `ROGUENT_PUBLIC_WEBHOOK_BASE_URL`、`ROGUENT_GITHUB_TOKEN`、`ROGUENT_GITHUB_WEBHOOK_SECRET`、`ROGUENT_X_BEARER_TOKEN`、`ROGUENT_X_WEBHOOK_SECRET` 仍可作为开发兼容 fallback,但正常使用应走设置页。

## GitHub 申请步骤

GitHub 不需要传统 API key。Roguent 推荐使用 fine-grained personal access token,只授予目标仓库的 webhook 权限。

1. 登录 GitHub,确认当前账号对 `koco-co/Roguent` 有管理员权限。没有仓库 Admin 权限时,无法创建仓库 webhook。
2. 打开 GitHub `Settings` -> `Developer settings` -> `Personal access tokens` -> `Fine-grained tokens`。
3. 点击 `Generate new token`。
4. 填写 token 名称,例如 `Roguent webhook registration`。
5. `Resource owner` 选择 `koco-co`。
6. `Repository access` 选择 `Only select repositories`,只勾选 `Roguent`。
7. 在 `Repository permissions` 中设置 `Webhooks: Read and write`。`Metadata: Read-only` 是 GitHub 默认要求。
8. 设置过期时间。开发验证可选短周期,长期使用建议定期轮换。
9. 点击生成后复制 token。GitHub 只会完整显示一次。
10. 在 Roguent 设置页填入 `GitHub token`。

Roguent 自动注册 webhook 时会创建或更新:

- Payload URL: `https://<public-host>/webhooks/github`
- Content type: `application/json`
- Secret: Roguent 设置页 `GitHub webhookSecret` 对应的值
- Events: `push`, `pull_request`, `check_suite`, `check_run`, `workflow_run`
- Active: enabled

如果不想给 Roguent token,也可以手动创建 webhook:

1. 打开 `https://github.com/koco-co/Roguent/settings/hooks`。
2. 点击 `Add webhook`。
3. `Payload URL` 填 `https://<public-host>/webhooks/github`。
4. `Content type` 选择 `application/json`。
5. `Secret` 填同一个 `GitHub webhookSecret`。
6. 保持 SSL verification 开启。
7. 选择 `Let me select individual events`,勾选 `Pushes`, `Pull requests`, `Check suites`, `Check runs`, `Workflow runs`。
8. 保持 `Active` 开启并保存。GitHub 保存后会发送一次 ping delivery。

## X 申请步骤

X 需要 Developer Console 中的 Project/App、App Bearer Token,以及 App 的 API Secret Key。当前实现走 X API v2 filtered stream webhook 路径,订阅规则是:

```text
from:SugerQvQ
```

申请和配置步骤:

1. 用 `@SugerQvQ` 登录 X。
2. 打开 X Developer Portal / Developer Console。
3. 如果账号尚未开通 developer access,按页面要求提交开发者资料、用途说明和可能的计费/额度配置。用途建议如实写:第一方开发工具,把本人账号 `@SugerQvQ` 的公开动态接入本地 Roguent 活动可视化面板;不自动发帖、不转售数据、不做批量抓取。
4. 创建一个 Project,例如 `Roguent`。
5. 在 Project 下创建 App,例如 `Roguent Local Subscription`。
6. 在 App 的 `Keys and tokens` 页面找到 Bearer Token。复制后填入 Roguent `X bearerToken`。
7. 在同一页面找到 API Key / API Secret Key。API Key 填入 Roguent `X consumerKey`;API Secret Key 填入 Roguent `X secretKey`,用于 X 的 CRC challenge response 和 webhook POST 签名校验。
8. 先启动 Roguent ingress,并确保公网 HTTPS 地址可访问:

   ```sh
   export ROGUENT_INGRESS_PORT=8787
   bun run dev:engine
   ```

9. 验证 X CRC endpoint 能返回 `response_token`:

   ```sh
   curl "https://<public-host>/webhooks/x?crc_token=roguent-test"
   ```

10. 在 Roguent 设置中启用 X 订阅,handle 填 `@SugerQvQ`,bearer token、consumer key、secret key 填同一组 App 凭证。
11. Roguent 保存设置或启动时会尝试:

    - `GET /2/webhooks` 查找已有 webhook
    - `POST /2/webhooks` 创建 `https://<public-host>/webhooks/x`
    - `GET /2/tweets/search/stream/rules` 查找已有 `from:SugerQvQ` 规则
    - `POST /2/tweets/search/stream/rules` 创建缺失规则
    - `POST /2/tweets/search/webhooks/:webhook_id` 把 filtered stream 连接到 webhook

如果 X 返回 `401`,优先检查 Bearer Token 是否来自当前 App、是否复制完整。若返回 `403`,通常是当前 X API plan/entitlement 不允许对应 webhook 或 filtered stream 操作;Roguent 会把连接状态标成 blocked,不要把本地 CRC 通过误写成真实 X 订阅已通过。

## Roguent 设置面板对应项

在 `CONFIG` -> `IM / 订阅` 中填写:

- `GitHub 订阅`: 开启
- `GitHub repo`: `koco-co/Roguent`
- `GitHub token`: GitHub fine-grained PAT
- `GitHub webhookSecret`: GitHub webhook HMAC secret
- `X 订阅`: 开启
- `X handle`: `@SugerQvQ`
- `X consumerKey`: X App Consumer Key / API Key
- `X secretKey`: X App API Secret Key
- `X bearerToken`: X App Bearer Token

公开回调根地址优先通过设置页 `Webhook base URL` 提供。

## 验证步骤

最小本地验证:

```sh
bun test src/engine/integrations/subscriptions.test.ts src/engine/ingress/server.test.ts
bunx tsc --noEmit
```

真实 GitHub webhook 验证:

```sh
SMOKE_INGRESS_PORT=8789 \
ROGUENT_PUBLIC_WEBHOOK_BASE_URL="https://<public-host>" \
ROGUENT_GITHUB_TOKEN="<github-fine-grained-pat>" \
bun scripts/smoke-live-subscriptions.ts
```

上面的 smoke 脚本命令仍用环境变量注入临时验证值,是为了让脚本独立于本地 UI 设置运行;正常应用配置不需要把这些值写进 `.zshrc`。

验收口径:

- GitHub 只有收到真实 webhook delivery 并完成 cleanup,才算真实 GitHub 订阅通过。
- X 只有 X API 注册成功且收到真实 X webhook event,才算真实 X 订阅通过。
- 如果 X 因 entitlement、plan、auth 或 phone verification 阻塞,记录 blocker;本地 CRC/signature 测试通过不能等价成真实 X 通过。

## 官方参考

- GitHub webhooks: `https://docs.github.com/en/webhooks`
- GitHub repository webhook REST API: `https://docs.github.com/en/rest/repos/webhooks`
- GitHub webhook signature validation: `https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries`
- GitHub fine-grained personal access token: `https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens`
- X API getting access: `https://docs.x.com/x-api/getting-started/getting-access-to-the-x-api`
- X Developer Portal: `https://developer.x.com/en/portal/dashboard`
- X webhooks: `https://docs.x.com/x-api/webhooks`
- X filtered stream: `https://docs.x.com/x-api/posts/filtered-stream/introduction`
