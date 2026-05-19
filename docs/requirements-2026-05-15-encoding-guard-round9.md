# 2026-05-15 编码治理门禁第九轮

## 目标

本轮不继续扩展业务功能，只补最小编码治理设施，避免仓库继续引入历史 mojibake 文本。

## 本轮改动

### 1. 统一编辑器编码约束

- 新增：`.editorconfig`
- 统一要求：
  - `charset = utf-8`
  - `end_of_line = lf`
  - 文本文件默认保留最终换行

### 2. 统一 Git 文本编码约束

- 新增：`.gitattributes`
- 对常见源码/文档文件声明：
  - `working-tree-encoding=UTF-8`
  - `eol=lf`

### 3. 新增最小乱码扫描门禁

- 新增：`scripts/encoding-guard.mjs`
- 新增命令：

```bash
npm run guard:encoding
```

- 当前扫描范围：
  - `src`
  - `services`
  - `apps`
- 当前排除：
  - `node_modules`
  - `out`
  - `release`
  - `.next`
  - `.git`

### 4. 当前门禁策略

脚本会拦截当前仓库中已知高频 mojibake 片段，例如：

- `楠岃`
- `鎵嬫`
- `鐧诲`
- `璇锋`
- `鏃犳潈`
- `涓嶅瓨`
- `鍙戦€`

## 使用说明

开发时建议顺序：

```bash
npm run guard:encoding
npm run typecheck:api
npm run smoke:auth-send-code
```

## 当前意义

- 本轮不是一次性修完全仓乱码。
- 本轮的价值是先把“继续新增乱码”这条路径卡住。
- 后续清理可以按模块进行，而不是继续无门禁地滚雪球。

## 当前结果

- `npm run guard:encoding` 当前已通过。
- 本轮已清理当前门禁扫出的源码遗留点：
  - `src/main/modules/clone/atlasRetry.ts`
  - `src/main/modules/clone/service.ts`
- 当前可以认为：
  - 认证链路 smoke 已通过
  - API typecheck 已通过
  - 源码级乱码门禁已建立并通过
