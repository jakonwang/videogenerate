# Hermes 独立自动编程代理

本目录用于把 Hermes Agent 作为独立运行的本机自动编程代理接入当前仓库，而不是嵌入现有业务代码。

## 目录说明

- `config.example.json`：Hermes Gateway、仓库白名单、允许命令和报告输出目录
- `task.example.json`：单次任务模板
- `README.md`：本地运行说明

## 运行拓扑

Windows 本机负责：

- 发起任务
- 校验仓库边界
- 启动本地开发服务
- 运行验证命令
- 生成执行报告

WSL2 内的 Hermes 负责：

- 启动 `hermes gateway`
- 提供 OpenAI 兼容接口

## 前置要求

1. Windows 已安装并可使用 `wsl.exe`
2. WSL2 中已安装 Hermes Agent
3. `hermes gateway` 可以在 WSL2 内启动
4. 当前仓库已执行 `npm install`

## 首次安装 WSL2 与 Hermes

如果当前 Windows 还没有完成 WSL2 初始化，先执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-hermes-wsl.ps1
```

说明：

- 脚本会启用 `Microsoft-Windows-Subsystem-Linux`
- 如果系统要求重启，脚本会明确提示，此时必须先重启 Windows
- 重启后再次运行同一脚本，它会继续安装 `Ubuntu`、校验 `WSL2`，并在发行版内安装 `uv` 与 `hermes-agent`
- 成功后会生成适合当前仓库的 `config.local.json` 使用提示

## 推荐流程

1. 复制 `config.example.json` 为 `config.local.json`
2. 按本机实际 WSL 发行版和 Hermes 命令调整配置
3. 执行 `npm run hermes:doctor`
4. 根据任务复制 `task.example.json` 并修改任务目标与验收命令
5. 执行：

```powershell
node scripts/hermes-agent-runner.mjs run --config automation/hermes-agent/config.local.json --task automation/hermes-agent/task.example.json --start-hermes
```

## 当前实现边界

当前控制器已实现：

- WSL2 与 Hermes Gateway 可用性检查
- 仓库写入白名单校验
- 必读文档校验
- 允许命令白名单校验
- 本地开发服务拉起
- 健康检查与验收命令执行
- JSON 报告输出

当前控制器不直接实现：

- 替 Hermes 修改代码
- 生产环境部署
- 当前仓库外写入

这符合当前项目约束：先做本机自动修复与本机服务启动，不直接碰 Linux 正式部署。
