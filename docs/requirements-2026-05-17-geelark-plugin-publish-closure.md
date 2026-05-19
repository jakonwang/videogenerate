# 2026-05-17 Geelark 云手机发布插件接入

## 目标

在现有桌面端插件体系和复刻系统基础上，新增 `Geelark 发布插件`，形成以下最小闭环：

1. 用户在插件市场安装 Geelark 插件
2. 在“我的插件”进入 Geelark 工作台配置凭证
3. 创建本地发布账号并绑定云手机
4. 在复刻成片页点击“发布到 Geelark”
5. 选择账号并提交 TikTok 视频发布任务
6. 在插件工作台查看任务状态、失败原因和发布记录

## 本轮最小改动范围

- 新增预置插件定义：
  - `geelark-publisher`
  - 工作台路由：`/plugins/geelark-publisher`
- 新增 Geelark 后端能力：
  - 配置存储
  - 云手机列表查询
  - 本地发布账号管理
  - 视频上传到 Geelark 临时文件接口
  - TikTok 视频发布任务创建
  - 任务详情同步
- 新增桌面端页面：
  - Geelark 插件工作台
  - 其他旧插件工作台占位页
- 新增复刻成片页发布入口：
  - “发布到 Geelark”按钮
  - 发布弹层

## 使用说明

### 1. 安装与启用插件

- 进入桌面端 `插件市场`
- 安装 `Geelark 发布插件`
- 安装后在“我的插件”中启用

### 2. 配置 Geelark

进入 `/plugins/geelark-publisher` 工作台后，先填写以下配置：

- `Base URL`
- `App ID`
- `App Secret`
- `Access Token（可选）`
- `请求超时`

说明：

- 若填写 `Access Token`，优先走 Bearer Token 鉴权
- 未填写 Token 时，使用 `App ID + App Secret` 签名鉴权

### 3. 创建发布账号

在插件工作台中创建本地发布账号：

- `账号名称`
- `Geelark 账号 ID（可选）`
- `绑定云手机`
- `备注`
- `状态`

本地发布账号是产品内的业务对象，不直接依赖 Geelark Analytics 账号接口才能工作。

### 4. 从复刻成片页发起发布

在复刻项目存在成片输出后：

- 点击“发布到 Geelark”
- 选择已绑定账号
- 填写发布文案
- 可选填写 `商品 ID / 商品标题`
- 选择发布时间
- 提交后创建 TikTok 视频发布任务

### 5. 查看记录

发布成功后，可在 Geelark 工作台的“发布记录”区查看：

- 任务状态
- 失败原因
- 成片来源路径
- 云手机名称
- 手动刷新状态

## Windows 开发 / Linux 部署兼容说明

- Windows 本地开发下，直接读取本地 `finalOutputPath` 文件并上传到 Geelark 临时文件接口
- Linux 部署时继续使用标准文件读取与 HTTP PUT 上传，不依赖 Windows 路径格式
- 路径拼接全部通过 Node `path` 模块处理
- Geelark API 仅在主进程后端请求，前端只调用本地 Web API

## 当前明确不做

- 不做 TikTok 图集发布
- 不做多平台发布
- 不做批量账号投递
- 不做后台常驻轮询服务
- 不做 Geelark 账号自动发现和自动绑定
- 不做真实养号、登录、账号编辑任务入口

## 相关接口

- `GET /plugins/geelark-publisher/config`
- `POST /plugins/geelark-publisher/config`
- `GET /plugins/geelark-publisher/cloud-phones`
- `GET /plugins/geelark-publisher/accounts`
- `POST /plugins/geelark-publisher/accounts`
- `POST /plugins/geelark-publisher/accounts/:id`
- `DELETE /plugins/geelark-publisher/accounts/:id`
- `POST /plugins/geelark-publisher/publish`
- `GET /plugins/geelark-publisher/tasks`
- `GET /plugins/geelark-publisher/tasks/:id`
- `POST /plugins/geelark-publisher/tasks/:id/sync`
