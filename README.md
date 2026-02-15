<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 宝宝有时差 - 糖果世界（连连看）

## 多人线上竞技

本项目支持**多人在线同时竞技**：同一暗号下的玩家会实时看到彼此分数，排行榜云端同步。

- **配置 Firebase** 后即可启用：详见 [DEPLOY-FIREBASE.md](DEPLOY-FIREBASE.md)
- 未配置时自动回退到本地模式，游戏照常可玩

## 本地运行

**环境要求：** Node.js

1. 安装依赖：`npm install`
2. 复制 `.env.example` 为 `.env.local`，按需配置 Firebase
3. 启动开发服务器：`npm run dev`
4. 浏览器打开终端提示的地址（如 http://localhost:3000）

> 本地仅跑前端时，Gemini 接口会 404，欢迎语和对手名会使用兜底文案。要完整测试 AI，请用 [Cloudflare 部署说明](DEPLOY-CLOUDFLARE.md) 里的 Wrangler 本地调试，或直接部署到 Cloudflare Pages。

## 部署到 Cloudflare Pages（推荐）

- **API Key 安全**：Gemini 请求通过站点自带的 `/api/gemini` 代理，API Key 只保存在 Cloudflare 环境变量中，不会暴露到前端。
- 详细步骤见 **[DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md)**（含构建命令、输出目录、`GEMINI_API_KEY` 配置）。
- **多人竞技**：在 Cloudflare 环境变量中配置 `VITE_FIREBASE_*` 后，同一暗号下的玩家即可实时竞技。
