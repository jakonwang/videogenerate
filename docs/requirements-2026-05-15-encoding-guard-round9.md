# 2026-05-15 编码治理门禁第 9 轮

## 目标

本轮不扩展业务功能，只补最小编码治理设施，避免仓库继续引入新的 mojibake 文本。

## 本轮改动

### 1. 统一编辑器编码约束

- 新增：`.editorconfig`
- 统一要求：
  - `charset = utf-8`
  - `end_of_line = lf`
  - 文本文件默认保留结尾换行

### 2. 统一 Git 文本编码约束

- 新增：`.gitattributes`
- 对常见源码、文档文件声明：
  - `working-tree-encoding=UTF-8`
  - `eol=lf`

### 3. 新增最小乱码扫描门禁

- 新增：`scripts/encoding-guard.mjs`
- 命令：

```bash
npm run guard:encoding
```

- 当时扫描范围：
  - `src`
  - `services`
  - `apps`
- 当时排除范围：
  - `node_modules`
  - `out`
  - `release`
  - `.next`
  - `.git`

### 4. 当时门禁策略

脚本会拦截仓库中已知高频 mojibake 片段，例如：

- `妤犲矁`
- `閹靛`
- `閻ц`
- `鐠囬攱`
- `閺冪姵娼`
- `娑撳秴鐡`
- `閸欐垿鈧`

## 使用说明

建议顺序：

```bash
npm run guard:encoding
npm run typecheck:api
npm run smoke:auth-send-code
```

## 当前意义

- 这一轮不是一次性修完全部历史乱码。
- 这一轮的价值是先把“继续新增乱码”这条路径卡住。
- 后续清理可以按模块逐步处理，而不是继续滚雪球。

## 当时结果

- `npm run guard:encoding` 当时通过。
- 当时已清理门禁命中的源码残留点：
  - `src/main/modules/clone/atlasRetry.ts`
  - `src/main/modules/clone/service.ts`
