# 2026-05-28 分镜图片参考图职责映射补强

## 需求

- 修复分镜图片生成时，虽然提交了多张参考图，但 prompt 没有明确告诉模型每一张图分别负责什么，导致模型可能混用：
  - 商品图被拿去影响人物
  - 模特图被拿去影响商品
  - 分镜截图被拿去重定义商品本体

## 本轮最小改动

- 仅调整 `src/main/modules/clone/gptImage.ts` 的分镜图片 prompt 组装逻辑。
- 不改图片上传顺序，不改 provider API，不改前端交互。

## 生效规则

- 分镜图片 prompt 必须明确声明参考图职责：
  - 第 1 张图：商品标准图 / Product Canonical Source，只负责商品 identity 与结构锁定
  - 第 2 张图：模特身份图，只负责人物 identity，不再通过额外文字描述模特外观
  - 第 3 张图：
    - 首帧时为脚本分镜截图，只负责角度、构图、镜头裁切、场景布局
    - 尾帧时为起始帧连续性参考，只负责连续性、角度延续、构图延续
- prompt 必须明确禁止跨职责污染：
  - 不允许用第 3 张图重定义商品
  - 不允许用第 1 张图替换人物 identity
  - 不允许用第 2 张图重定义商品
- 分镜图片 prompt 中不再输出 `Selected model: ...` 这类模特文字画像，模特身份只由上传的模特参考图承担。

## Windows / Linux 兼容说明

- 本轮仅调整 TypeScript prompt 文本拼装，不依赖平台专属能力。

## 验证

- `npm run test:storyboard-model-lock`
- `npm run typecheck`
