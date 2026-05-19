# 2026-05-15 Clone 商业化闭环第三轮：项目元数据正式存储收口

## 背景

- 第二轮已经完成 `web-platform` 的 SQLite 优先存储替换。
- 但 `/clone` 商业主链路仍依赖 `clone-projects.json` 保存项目归属、任务元数据和模特库索引。
- 本轮继续遵循最小范围原则：
  - 不迁移视频、图片、中间产物目录
  - 不重构 `cloneService`
  - 不改现有前端协议

## 本轮改动

### 1. `cloneRepo` 改为 SQLite 优先

- 新增：
  - `src/main/modules/clone/sqlite.ts`
- 默认数据库文件：
  - `db/clone-projects.sqlite`
- 当前落库对象：
  - `CloneProject` 全量项目 payload
  - `ModelIdentityLibraryItem` 全局模特库 payload

### 2. 保持现有 repo / service 调用不变

- `src/main/modules/clone/repo.ts` 对外方法保持不变：
  - `listProjects`
  - `getProject`
  - `createProject`
  - `upsertProject`
  - `listModelIdentityLibrary`
  - `upsertModelIdentity`
- `cloneService` 不需要跟着改接口。

### 3. 保留现有恢复能力

- 当前 `cloneRepo.readDb()` 里已有的恢复逻辑继续保留：
  - 从项目里的旧 `modelIdentityPacks` / `selectedModelIdentitySnapshot` 回灌全局模特库
  - 当数据库记录丢失时，从 `viral-clone/<projectId>/model-identity` 扫描恢复模特图
- 本轮只把最终存储介质从 JSON 切换到 SQLite，不移除恢复逻辑。

### 4. 旧 JSON 自动导入

- 启动时 `cloneRepo.ensureSeed()` 会执行：
  - 若 SQLite 为空且存在旧 `db/clone-projects.json`
  - 自动导入旧项目元数据和模特库索引
- 导入完成后：
  - SQLite 成为正式真源
  - JSON 仅作为兼容迁移源或运行时兜底

### 5. 文件资产仍留在文件系统

- 本轮没有迁移这些内容：
  - 参考视频原文件
  - 商品图
  - 模特图 PNG 文件
  - 分镜图 / 分镜视频
  - 最终合成产物
- 这些数据仍使用：
  - `${VIDEOGENERATE_DATA_DIR}/viral-clone`

## 使用说明

### Windows 本地开发

- 启动 API / 桌面端后，会在：
  - `.videogenerate/db/clone-projects.sqlite`
  - `.videogenerate/db/web-platform.sqlite`
  生成 SQLite 文件

### Linux 部署

- 建议统一配置：

```bash
VIDEOGENERATE_DATA_DIR=/srv/videogen/data
VG_APP_ENV=production
VG_ALLOW_MOCK_GENERATION=false
```

- 若迁移前已有：
  - `/srv/videogen/data/db/clone-projects.json`
- 首次启动会自动导入到：
  - `/srv/videogen/data/db/clone-projects.sqlite`

## 验收重点

- 服务重启后，`/clone` 项目归属和任务元数据不丢失
- 全局模特库索引不再默认依赖 `clone-projects.json`
- 模特图、视频、分镜图等大文件路径仍可继续正常引用
- Windows 开发和 Linux 部署均可使用相同的存储逻辑
