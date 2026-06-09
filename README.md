# GPT Image 2 Console

一个 React + TypeScript 前端 Web 应用，用于配置 CLIProxyAPI 的 OpenAI 兼容地址和 API Key，并调用 `gpt-image-2`、Responses 或 Chat Completions 生成图片。

界面使用 Vite、Tailwind CSS 和 shadcn/ui 构建，支持请求队列、并发控制、请求间隔、取消请求、本地历史缓存、Prompt 复用、图片下载和响应 JSON 查看。

## 使用

```bash
npm install
npm start
```

然后打开 `http://localhost:5174`。

默认 API URL 是 `http://localhost:8317/v1`。如果你的 CLIProxyAPI 部署在其他地址，也可以直接填根地址，例如 `https://proxy.example.com`，应用会自动拼成 `/v1/images/generations`、`/v1/responses` 或 `/v1/chat/completions`。

## CLIProxyAPI 配置要点

`config.example.yaml` 中默认端口是 `8317`，鉴权来自 `api-keys`。图片生成需要保持 `disable-image-generation: false`，或设置为 `"chat"` 以仅保留图片端点。

## 常见错误

`HTTP 503 auth_unavailable` 通常表示 CLIProxyAPI 没有可用认证。先确认页面里的 API Key 不是 OpenAI Key，而是 `config.yaml` 里 `api-keys` 配置的代理 key；再确认 CLIProxyAPI 的 `auth-dir` 中有可用的上游登录或导入凭据。

## 验证

```bash
npm test
npm run typecheck
npm run build
```
