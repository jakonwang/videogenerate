# VideoGenerate（Electron + Vue3 + Node.js）

用于**批量生成短视频**的桌面应用（Windows 测试，Linux 可部署）。  
前后端分离：渲染进程（Vue3 + Tailwind）负责 UI；主进程（Node.js）负责业务模块、任务队列、FFmpeg 渲染。

## 快速开始（Windows PowerShell）

```bash
npm install
npm run setup:fonts   # 首次/CI：从 Google Fonts 拉取 Noto 多语言 woff2 到 resources/fonts（字幕必须）
npm run dev
```

打包前同样建议执行 `npm run setup:fonts`，`npm run build` 会将字体复制到 `out/main/resources/fonts`。

## 文档

- `docs/requirements.md`：需求与模块说明、使用说明（持续更新）

