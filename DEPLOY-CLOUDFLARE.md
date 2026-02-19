# 部署到 Cloudflare Pages（并隐藏 Gemini API Key）

## 1. 准备

- 将项目推送到 GitHub（或 GitLab 等 Cloudflare 支持的 Git 仓库）。
- 在 [Google AI Studio](https://aistudio.google.com/apikey) 获取 Gemini API Key。

## 2. 在 Cloudflare 创建 Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 选择你的仓库，继续。
3. 配置构建设置：
   - **Framework preset**: 选 **None** 或 **Vite**（若识别到）。
   - **Build command**: `npm run build` 或 `npx vite build`
   - **Build output directory**: `dist`
   - **Root directory**: 留空（项目根目录）
4. 点击 **Save and Deploy** 先完成第一次部署。

### 若卡在 “Initializing build environment”

- 项目根目录已包含 **`.nvmrc`**（内容为 `20`），Cloudflare Pages 会据此使用 Node 20，多数情况下可避免卡住。
- 若仍卡住，可在 **Settings → Environment variables** 中增加构建变量：
  - **Name**: `NODE_VERSION`
  - **Value**: `20`
  - 勾选 **Production** 和 **Preview**。
- 再在 **Deployments** 里对卡住的部署点 **Cancel**，然后 **Retry deployment**，或清空 **Build cache** 后重新部署。
- 若使用 **Build system v2**，可尝试在 Dashboard 里切换到更新的构建系统（若有 “Upgrade” 或 v3 选项）。

## 3. 设置环境变量（重要）

进入该 Pages 项目 → **Settings** → **Environment variables**，添加以下变量（建议同时勾选 **Production** 和 **Preview**）。

### 3.1 Gemini API Key（AI 对手名等）

- **Variable name**: `GEMINI_API_KEY`
- **Value**: 你的 [Google AI Studio](https://aistudio.google.com/apikey) API Key
- 建议勾选 **Encrypt**（作为 Secret）。

### 3.2 实时得分（多人同屏看彼此分数，可选）

- **Variable name**: `VITE_ABLY_API_KEY`
- **Value**: 你的 [Ably](https://ably.com) API Key（注册后可在 Dashboard → App → API Keys 里复制）
- **说明**：配置后，同一暗号下的多人在线时会在「实时得分」里看到彼此的真实分数；不配置则使用本地假数据，游戏照常可玩。
- 保存后请在 **Deployments** 里对最新部署点 **Retry deployment**（或重新推代码），以便构建时注入该变量。

## 4. 本地开发：实时得分

若要在本地测试「多人在线实时得分」：

1. 在 [Ably](https://ably.com) 注册并创建一个 App，复制 **API Key**（可勾选仅 Presence 权限以限制用途）。
2. 在项目根目录创建 `.env.local`（不要提交到 Git），内容示例：
   ```env
   VITE_ABLY_API_KEY=你的Ably_API_Key
   ```
3. 运行 `npm run dev`，用两个浏览器（或隐身窗口）分别用同一暗号进入游戏，即可看到彼此分数实时更新。

## 5. 项目结构说明

- **前端**：Vite 构建产物在 `dist/`，由 Pages 作为静态资源托管。
- **API 代理**：`functions/api/gemini.ts` 是 Cloudflare Pages Function，会变成线上路径 `/api/gemini`，前端通过 `fetch('/api/gemini')` 调用，**API Key 只存在于 Cloudflare 环境变量中，不会暴露到浏览器**。

## 6. 本地开发时如何测试“代理 + 隐藏 Key”

本地只跑 `npm run dev` 时，没有 Cloudflare Functions，请求 `/api/gemini` 会 404，AI 功能会走代码里的**兜底文案**（例如固定欢迎语、固定对手名）。

若要在本地也走代理（不把 Key 写进前端）：

1. 安装 Wrangler：`npm i -g wrangler`
2. 先构建：`npm run build`
3. 在项目根目录执行：
   ```bash
   wrangler pages dev dist --compatibility-date=2024-01-01
   ```
4. 在弹出提示时配置 `GEMINI_API_KEY`（或提前在 `wrangler.toml` / `.dev.vars` 里配置）。
5. 用终端里给出的本地地址访问，此时 `/api/gemini` 由本地 Function 处理，Key 仍在服务端。

这样即可在 **Cloudflare Pages 上直接运行**，并**隐藏 Gemini API Key**。
