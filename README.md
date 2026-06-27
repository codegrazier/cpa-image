# CPA Image

CPA Image 是一个本地优先的 OpenAI 兼容图像生成与编辑控制台。

界面使用 React、TypeScript、Vite、Tailwind CSS 和 shadcn/ui 构建。应用本身不提供后端服务，所有请求都从浏览器发往用户配置的 OpenAI 兼容 API 地址。

## 功能

- 生成与编辑：支持文字生成图片、选择本地图片编辑、复用历史结果作为编辑输入。
- 多接口调试：支持 `/v1/images/generations`、`/v1/images/edits`、`/v1/responses`、`/v1/chat/completions`。
- 队列控制：支持批量请求、并发数量、请求间隔、取消运行中请求、清理失败或已完成请求。
- 本地工作流：支持 Prompt 历史、置顶、复用、图片下载、批量导出 ZIP、响应 JSON 查看。
- 国际化：支持中文和英文界面，并在地址路径中保留语言状态。

## 开发

建议使用 Node.js `20.19.0` 或更高版本；如果使用 nvm，可以直接运行 `nvm use` 读取 `.nvmrc` 中的推荐版本。

项目源码以 MIT 许可证开源，但不作为 npm 包发布；`package.json` 中的 `private: true` 用于避免误发布。

```bash
npm install
npm start
```

默认开发地址是 `http://127.0.0.1:5174`。

## 配置

页面默认 API URL 是 `http://localhost:8317/v1`。如果你的代理或兼容服务部署在其他地址，可以直接填写根地址，例如 `https://proxy.example.com`，应用会按功能自动拼接接口路径：

- 图片生成：`/v1/images/generations`
- 图片编辑：`/v1/images/edits`
- Responses：`/v1/responses`
- Chat Completions：`/v1/chat/completions`
- 连接测试：`/v1/models`

## 本地数据

CPA Image 会把设置、Prompt 历史、请求摘要和请求详情保存在当前浏览器本地，用于刷新后恢复工作区。API Key 只有在勾选“在本浏览器记住 API Key”后才会持久化保存。

项目不会主动把本地缓存上传到第三方服务。导出 ZIP、下载图片和查看响应 JSON 都在浏览器端完成。

## 跨域代理

如果目标 API 没有正确配置 CORS，浏览器会阻止请求。页面提供“启用跨域请求代理”选项作为兜底方案：启用后，请求会先经过代理服务转发。

跨域代理可能接触到 API URL、请求头、Prompt、图片和响应内容。只在你信任该代理服务时启用；更推荐在自己的 API 网关上正确配置 CORS。

## 验证

```bash
npm test
npm run build
git diff --check
```

`npm run build` 会先执行 TypeScript 类型检查，再构建静态资源并运行预渲染脚本。

## 许可证

本项目采用 MIT 许可证，详见 `LICENSE`。
