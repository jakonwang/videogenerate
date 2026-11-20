# 工厂版宣传物料

| 文件 | 说明 |
|---|---|
| `Vidloom-工厂宣传片.mp4` | 1920×1080 · 约 3 分 13 秒，男声配音 + 字幕 + 背景音乐 |
| `Vidloom-工厂版产品介绍.pptx` | 24 页，每页带讲解备注（演讲者视图可见） |
| `narration.json` | 旁白文案（改文案就改这里） |
| `video/src/` | Remotion 画面：`Promo.tsx` 场景与文案，`mocks.tsx` 软件界面示意 |
| `deck/build-deck.cjs` | PPT 生成脚本，配图来自 `deck/img/`（由视频工程导出） |

界面画面是按真实功能做的示意图，里面的商品、达人、投放数字都是示例数据。

## 重新生成

```bash
# 1. 改了 narration.json 后：重新配音 + 生成时间轴（用 edge-tts，需要联网）
node scripts/factory-promo/voice.mjs
# 2. 导出 PPT 配图 / 渲染视频（预览帧：render.mjs qa <帧号...>）
node scripts/factory-promo/render.mjs stills
node scripts/factory-promo/render.mjs video
# 3. 生成 PPT（需要 pptxgenjs：npm i pptxgenjs 到任意目录后用 NODE_PATH 指过去）
NODE_PATH=<pptxgenjs 所在 node_modules> APPLY_THEME=<pptx skill>/scripts/apply_theme.js node promo-factory/deck/build-deck.cjs
```

声音：`narration.json` 里的 `voice`（默认 `zh-CN-YunyangNeural`，专业播报风格）和 `rate`（`+20%`，偏快更紧凑）可调。
