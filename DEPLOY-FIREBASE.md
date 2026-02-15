# 使用 Firebase 实时界面（按暗号）

本项目的「实时得分」支持用 **Firebase Realtime Database** 按暗号房间同步：同一暗号下的多人在线时，会在游戏中看到彼此分数实时更新。

## 1. 在 Firebase 创建项目与 Realtime Database

1. 打开 [Firebase 控制台](https://console.firebase.google.com/)，创建或选择一个项目。
2. 在左侧 **Build** → **Realtime Database** 中点击 **Create Database**。
3. 选择地区（如 `asia-southeast1`），先选 **测试模式** 以便快速联调（上线前再改规则，见下文）。
4. 创建完成后，在 **Project settings**（齿轮）→ **Your apps** 里添加 **Web 应用**（</>），记下配置中的：
   - `apiKey`
   - `authDomain`（可选）
   - `databaseURL`（Realtime Database 的 URL，形如 `https://xxx-default-rtdb.asia-southeast1.firebasedatabase.app`）
   - `projectId`
   - `appId`

## 2. 配置环境变量

在项目根目录创建 `.env.local`（不要提交到 Git），填入：

```env
# Firebase 实时得分（按暗号房间）。配置后优先于 Ably。
VITE_FIREBASE_API_KEY=你的apiKey
VITE_FIREBASE_AUTH_DOMAIN=你的项目.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://你的项目-default-rtdb.区域.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=你的projectId
VITE_FIREBASE_APP_ID=你的appId
```

**必填**：`VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_DATABASE_URL`。  
**可选**：`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_APP_ID`（建议都填，与控制台一致）。

- 配置了上述 Firebase 变量后，实时得分会走 **Firebase**，不再使用 Ably。
- 若未配置 Firebase，则仍可使用 `VITE_ABLY_API_KEY` 走 Ably（参见 [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md)）。

## 3. 数据与规则说明

- **路径**：
  - `rooms/{暗号}/players/{clientId}`：实时在线玩家分数，`{ name, score, lastUpdate }`
  - `rooms/{暗号}/rankings`：历史排行榜，每局结束后追加 `{ name, score, time }`
- **安全规则**（上线前建议在 Realtime Database → **规则** 中改为类似下面，仅允许读写 `rooms` 下数据）：

```json
{
  "rules": {
    "rooms": {
      "$passcode": {
        "players": {
          ".read": true,
          ".write": true
        },
        "rankings": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

如需更严格，可限制为仅认证用户或按 passcode 校验（需配合后端或 Auth）。

## 4. 本地运行

1. 安装依赖：`npm install`
2. 确保 `.env.local` 已配置上述变量。
3. 启动：`npm run dev`
4. 用两个浏览器（或一个正常 + 一个隐身）用**同一暗号**进入游戏，即可看到「实时得分」里彼此分数实时更新。

## 5. 部署到 Cloudflare Pages（或其它静态托管）

1. 构建时需把 Firebase 配置注入为环境变量。在 **Cloudflare Pages** → 项目 → **Settings** → **Environment variables** 中添加与 `.env.local` 同名的变量（如 `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_DATABASE_URL` 等），并勾选 **Production** / **Preview**。
2. 保存后重新部署（**Deployments** → 最新部署 → **Retry deployment**），以便构建时注入 `VITE_*`。
3. 部署完成后，同一暗号下的多人访问该站点即可使用 Firebase 实时界面。

## 6. 小结

- **按暗号**：数据按 `rooms/{暗号}/players` 存储，只有使用同一暗号的玩家会看到同一房间的实时得分。
- **优先级**：配置了 Firebase 环境变量后使用 Firebase；未配置则使用 Ably（若配置了 `VITE_ABLY_API_KEY`）；都未配置则「实时得分」为空，游戏仍可玩，仅无多人在线显示。
