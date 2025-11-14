# 在线云盘播放器（Baidu Share -> Cloudflare Pages）

一个可部署到 Cloudflare Pages Functions 的站点：输入百度网盘分享链接与提取码，自动识别分享中的视频文件并在线播放（通过 Worker 代理直链，支持 Range）。

## 功能
- 输入分享链接与提取码，列出可播放视频
- 点击即播，支持断点续播/拖动进度
- 同源后端 API：/api/list 与 /api/stream

## 重要说明
- 仅列目录不需要登录；获取直链播放通常需要设置 BDUSS（建议 SVIP 账号以提升稳定性和速度）。
- 在 Cloudflare 中将 BDUSS 配置为 Pages Functions 的环境变量（Secret）。
- 如遇密码校验或限速，以实际账号权限为准。

## 本地开发
1. 安装 Wrangler（可选）
   npm i -g wrangler
2. 本地调试
   wrangler pages dev .
3. 打开 http://127.0.0.1:8788

## 部署到 Cloudflare Pages
1. 新建 Pages 项目，选择此目录作为源码
2. Build command: 无
3. Build output directory: public（静态资源）+ functions（API 自动生效）
4. 环境变量：新增 Secret BDUSS = 你的百度账号 BDUSS
5. 部署完成后直接访问站点

## 使用
- 在首页粘贴百度网盘分享链接（或 surl）与提取码，点击解析
- 列表中选择视频播放

## 故障排查
- 列表为空：确认分享内是否有视频、提取码是否正确
- 播放报错：确认已在 Cloudflare 设置 BDUSS；部分资源可能需要更高权限；稍后重试
- 若直链获取失败 errno：属于百度返回码变化，可提 Issue 以更新适配
