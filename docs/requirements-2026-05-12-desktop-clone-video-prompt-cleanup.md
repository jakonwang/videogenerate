# 2026-05-12 桌面端 `/clone` 分镜视频提示词清洗

## 目标

- 修复桌面端 `/clone` 分镜视频阶段提交给真实视频模型的 prompt 过乱问题。
- 统一输出为英文提示词。
- 去掉错误日志、调试标签、中文分析信息和重复堆叠字段。

## 本轮范围

- 仅调整 Electron 桌面端主进程分镜视频 prompt 提交出口。
- 不修改 Web-Next。
- 不改动其它阶段的业务协议。

## 实现说明

- 修复文件：
  - `src/main/modules/clone/providers.ts`
- 处理策略：
  - 视频模型提交前，优先使用已清洗的 `shot.aiPrompt`
  - 若 `shot.aiPrompt` 为空，再回退到镜头描述字段重新生成英文方向提示
  - 对最终提交 prompt 再做一次统一清洗与长度收敛
- 清洗内容包括：
  - 中文内容
  - `Shot script lock:`
  - `Script role:`
  - `Generation prompt:`
  - `Analysis notes:`
  - `Reference lock mode:`
  - `Must preserve:`
  - 超时、trace、HTTP 错误等脏字段

## 使用说明

- Windows 本地验证：
  - `npm run typecheck`
  - 使用项目内验证脚本检查最终 prompt 是否仍包含标签字段或中文
- Linux 部署兼容：
  - 本轮仅修改 TypeScript 文本处理逻辑，无 Windows 专属路径依赖

## 验收标准

- 分镜视频最终提交 prompt 为英文。
- 不再包含分析失败日志、调试标签、中文混杂内容。
- 提示词结构更接近自然导演式描述，不再把同一语义重复堆叠多次。
