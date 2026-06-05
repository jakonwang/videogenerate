# VideoGenerate（Electron + Vue3 + Node.js）

用于批量生成短视频的桌面工作台，开发环境为 Windows，部署环境可运行在 Linux。
当前仓库遵循前后端分离：

- 渲染层：Vue3 / React 页面与交互
- 主进程：Node.js 业务模块、任务队列、FFmpeg 调度

## 快速开始（Windows PowerShell）

```bash
npm install
npm run setup:fonts   # 首次或 CI 拉取 Noto woff2 到 resources/fonts
npm run dev
```

打包前同样建议执行 `npm run setup:fonts`。`npm run build` 会将字体复制到 `out/main/resources/fonts`。

## 文档

- `docs/requirements.md`：需求与模块说明、使用说明
- `docs/requirements-2026-05-19-encoding-governance-round10.md`：本轮编码治理记录
