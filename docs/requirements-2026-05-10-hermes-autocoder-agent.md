# 2026-05-10 Hermes 独立自动编程代理接入

## 背景

当前项目需要一个独立于业务代码之外的本机自动编程代理，用于围绕当前仓库执行任务闭环，而不是把 Agent 逻辑直接耦合进 Web 前端、Electron 或现有业务 API。

本轮将 Hermes 定位为独立运行的自动编程代理，并按以下边界落地：

- 高自动化执行
- 接单式任务触发
- 整机可读
- 仅当前仓库可写
- 先只做本机开发启动
- 完成标准以检查命令通过为准

## 实现范围

本轮新增：

- `scripts/hermes-agent-runner.mjs`
- `automation/hermes-agent/config.example.json`
- `automation/hermes-agent/task.example.json`
- `automation/hermes-agent/README.md`
- `package.json` 中的 Hermes 运行脚本

本轮不新增：

- 业务 API 协议
- Web 页面
- Electron 内嵌 Agent 模块
- Linux 正式部署脚本

## 设计说明

### 独立运行原则

Hermes 不接入以下目录中的业务实现：

- `apps/web-next`
- `services/api`
- `src/main`

而是通过独立控制器完成以下工作：

1. 校验配置
2. 校验任务
3. 检查必读文档
4. 检查仓库写入白名单
5. 通过 WSL2 启动 Hermes Gateway
6. 拉起本地开发服务
7. 执行健康检查
8. 执行验收命令
9. 输出报告

### 跨平台约束

- Windows 为开发环境，控制器直接运行在 Windows PowerShell
- Linux 发布环境本轮不直接纳入自动部署
- Hermes 在 Windows 下按官方建议走 WSL2，而不是假设原生 Windows 无差异运行
- 所有路径校验使用绝对路径和 `path.resolve`

### 安全边界

默认只允许写入：

- `D:\phpstudy_pro\WWW\videogenerate`

默认阻止写入：

- `.git`
- `release`
- `video`
- 当前仓库外目录

默认只允许执行以下命令白名单中的命令：

- `npm run typecheck:api`
- `npm run typecheck:web-next`
- `npm run build:web-next`
- `npm run typecheck`
- `npm run build`
- `npm run dev:api`
- `npm run dev:web-next`

## 使用说明

### 1. 环境检查

执行：

```powershell
npm run hermes:doctor
```

用于检查：

- 当前仓库路径
- 必读文档是否存在
- `wsl.exe` 是否可用
- 指定 WSL 发行版是否存在
- Hermes Gateway 健康检查是否可达

### 2. 执行任务

复制并调整配置后执行：

```powershell
node scripts/hermes-agent-runner.mjs run --config automation/hermes-agent/config.local.json --task automation/hermes-agent/task.example.json --start-hermes
```

说明：

- `--start-hermes` 会尝试通过 `wsl.exe` 启动 Gateway
- `startCommands` 会后台拉起本地 API 和 Web 服务
- `checks` 会按顺序执行并写入报告

### 3. 输出结果

报告输出到：

- `tmp/hermes-agent-runs/<task-id>-<timestamp>.json`

报告包含：

- 任务 ID
- 读取的文档
- 启动的服务
- 验收命令结果
- 健康检查结果
- 失败原因

## 验收标准

满足以下条件才算当前任务闭环完成：

- 必读文档存在
- 仓库与白名单校验通过
- 启动命令与检查命令均在白名单内
- 健康检查通过
- 所有验收命令退出码为 0

## 后续扩展建议

后续如需让 Hermes 直接参与代码修复，可在当前控制器外层再补一层任务编排器，但仍应保持以下原则：

- 不把 Agent 控制逻辑写进现有业务 API
- 不允许默认跨仓库写入
- 不允许默认直连生产环境
