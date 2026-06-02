# 2026-05-19 编码污染治理第 10 轮

## 目标

- 阻断 Windows 开发环境下继续产生编码污染和伪变更。
- 把“编码乱码”和“构建产物入库”这两个高频污染源分开治理。
- 只做最小治理，不改业务逻辑。

## 本轮最小改动

### 1. 扩大编码门禁覆盖范围

- 更新：`scripts/encoding-guard.mjs`
- 新增扫描类型：
  - `.md`
  - `.yml`
  - `.yaml`
  - `.css`
  - `.scss`
  - `.html`
  - `.txt`
- 新增扫描目录：
  - `scripts`
  - `docs`
  - 仓库根级关键配置文件

### 2. 增加更直接的乱码信号

- 除历史 mojibake 片段外，新增检查以下高风险字符：
  - `锛`
  - `銆`
  - `鈥`
  - `鈩`
  - `锟`
  - `�`

### 3. 把构建产物入库纳入门禁

- `encoding-guard` 新增检查 Git 已跟踪的构建产物：
  - `apps/web-next/.next/**`
  - `apps/web-next/tsconfig.tsbuildinfo`
- 如果这些文件仍被 Git 跟踪，门禁直接失败，避免继续误提交。

### 4. 修正关键配置文本污染

- 修复 `package.json` 描述字段乱码。
- 修复 `.gitignore` 中字体忽略注释乱码。
- 修复 `README.md` 顶部说明乱码。
- 修复 `docs/requirements-2026-05-15-encoding-guard-round9.md` 文档乱码，保留原治理语义。

## 使用说明

### Windows 开发机建议

```bash
git config core.autocrlf false
git config core.safecrlf true
npm run guard:encoding
```

说明：

- 当前仓库实测 `core.autocrlf=true`，这会在 Windows 工作区持续制造换行改写噪音。
- 这条配置建议仅影响当前仓库，便于与 `.editorconfig`、`.gitattributes` 的 LF 约束对齐。

### 清理 `.next` 历史跟踪的推荐顺序

```bash
git rm -r --cached apps/web-next/.next
git rm --cached apps/web-next/tsconfig.tsbuildinfo
npm run guard:encoding
```

说明：

- 本轮没有直接删除已纳管文件，避免扩大范围。
- 但门禁会明确提示这批文件仍在 Git 跟踪，需要单独开一次索引清理提交。

## Windows / Linux 兼容说明

- 本轮只调整文档、Git 忽略规则和 Node 脚本。
- 不依赖 Windows 专属 API。
- Windows 开发与 Linux 部署可共用本轮治理结果。
