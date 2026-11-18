# 达人管理模块规划（草案，待确认）

> 状态：规划稿，已按用户答复更新（2026-11-15）。用户确认开工前不写实现代码。
> 调研时间：2026-11-15。调研对象：越南店 LUMÉE JEWELRY（shop_id 7495886406403393880）的 TikTok Shop 联盟中心，全程只读浏览。

## ✅ 已确认的决策

| 问题 | 结论 |
|---|---|
| 店铺登录方式 | **导入 Cookie 登录**：用户在自己的浏览器里用 Cookie-Editor 扩展导出 tiktok.com 的 cookie（JSON），粘贴或导入到软件。软件把 cookie 写入该店铺独立的 `persist:` 分区，再用这个分区打开后台窗口 |
| 履约的定义 | 达人**发布了关联内容（视频或直播）就算履约**，不要求出单 |
| 主看维度 | **每个达人的履约率**（达人维度是主表，商品 / 店铺维度是辅助） |
| 履约期 N | **30 天** |
| 主数据通道 | **用 Cookie 登录的窗口读取页面数据**（B 方案）；导出文件导入作为兜底 |
| 写操作 | 第一期**只展示样品数据**，不在软件里审批、拒绝或发货 |
| 样品成本 | **在寄样模块里单独录入**（按商品 / SKU 设默认成本，单条样品可以覆盖），不依赖 GMV Max |

---

## 0. 调研结论（先看这几条）

1. **联盟中心正在迁移。** 页面顶部公告：联盟中心（affiliate.tiktok.com）的达人合作功能已全部迁到卖家中心（seller-vn.tiktok.com），**2027 年春季联盟中心停用**。新模块的页面地址和采集目标都要能切换到卖家中心，不能写死 `affiliate.tiktok.com`（现在 `regions.ts` 的 `buildAffiliateUrl` 就写死了）。
2. **一个登录账号只对应一个店铺。** 右上角"选择管理对象"里只有 Banano VN → 越南（LUMÉE JEWELRY）一项。所以"多店铺切换"实际上是**多个登录会话之间切换**：每个店铺一个独立的浏览器分区，登录状态各自保存。
3. **页面内部接口带签名。** 页面调用 `affiliate.tiktok.com/api/v1/affiliate/sample/group/list` 之类的接口，请求带 `msToken / X-Bogus / X-Gnarly` 签名，**自己伪造请求不现实**，只能在已登录的窗口里，由页面自己发请求，我们读取返回的数据。
4. **主要列表都有"Xuất（导出）"按钮**：效果分析、视频、订单都能导出，可以作为最稳的兜底数据来源。
5. **官方 API 还没真正打通。** 本地配置里已填好 App Key，但现有的 VN 本土店授权状态是 `not_connected`（只读查看，没有改动）。VN 本土店能否走 Partner API 授权，需要先验证。

### 联盟中心菜单结构

| 菜单 | 子页 | 路径 |
|---|---|---|
| Trang chủ 首页 | 销售概览 + 待办 | `/affiliate/platform/homepage` |
| Cộng tác 合作 | 公开合作 / 定向合作 | — |
| Khám phá nhà sáng tạo 达人广场 | 搜索、邀约 | — |
| Quản lý nhà sáng tạo 达人管理 | 我的达人 / 达人视频 | `/affiliate/assets/creator-management`, `/affiliate/assets/video-analysis` |
| Làm việc với đối tác 机构合作 | 合作伙伴概览 | — |
| Hàng mẫu 样品 | 样品申请 / 样品设置 | `/affiliate/sample/sample-request` |
| Khuyến mãi LIVE 直播推广 | — | — |
| Phân tích 数据分析 | 效果 / 样品 / 达人建联 / 商品 / 达人 / 全部视频 | `/insights/transaction-analysis`, `/insights/sample-analysis`, `/insights/creator-outreach`, `/insights/video-analysis` |
| Đơn hàng liên kết 联盟订单 | 达人订单 / 机构订单 | `/product/order` |

### 各页面字段（实际看到的）

**首页 / 效果分析（近 7 天，GMT+7，可与上一周期对比）**
- 达人带来的 GMV 38,103,283₫、退款 835,314₫、达人带来的销量 894、预估佣金 2,420,437₫、日均出单商品数 31
- 视频数 422、直播场次 40、发布内容的达人数 100、有出单的达人数 105
- 待办：样品申请 76、达人消息 0、不提供样品 412、已完成的样品申请待审核 149、低库存商品 20
- 明细表分"达人 / 商品 / 视频 / 直播"四个 Tab，可按合作类型、内容类型、类目筛选，可导出
  - 达人维度：GMV、退款、预估佣金、订单数、销量、退款件数、视频数、直播数、出单商品数、**已发货样品数**、CTOR、**带样品的内容总数**、视频播放量

**样品申请（`/affiliate/sample/sample-request`）**
- 类型：免费样品 / 可退款样品；还有"自动化"和"查看发票"
- 状态 Tab：全部 / 待审核(76) / 待发货 / 已发货 / 进行中(76) / 已完成 / 已取消
- 筛选：达人名、标签（之前合作过、需要决策）
- 待审核行：达人、粉丝数（含性别占比、年龄段）、**履约率（平台给的，例如 95.97%）**、视频平均播放、销售额、销量、申请次数
- 已完成行：达人、粉丝数、商品名 + SKU 编码、佣金方案（默认 10%）、审批方式（手动审批）、**发布要求（视频或直播）**、状态、"查看内容"
- 规则：被拒绝 30 天后，达人可以重新申请

**样品分析（`/insights/sample-analysis`）**
- 指标卡：已发货样品 42、内容 GMV 1,563,020₫、预估成本（COGS）、预估运费、带样品的内容总数 61、45 天 ROI
- 漏斗：可申请样品的商品 → 已设置免费样品 → 样品已审批 → 已发布内容 → 已出单
- 明细（按达人 / 商品）：已申请样品、已发货样品、带样品的视频、带样品的直播、**发布率**、内容 GMV、45 天 ROI、90 天 ROI

**达人建联分析（`/insights/creator-outreach`，按周，UTC）**
- 已建联达人 4,743、已邀约 4,730、已私信 14、已加购（添加商品）58、已申请样品 39、已收到样品 26
- 明细：邀约总数、已接受邀约数、消息状态、已申请样品、已收到样品、待审核样品、视频、直播

**全部视频 / 达人视频（`/insights/video-analysis`）**
- 视频信息（标题、视频 ID）、发布时间、达人、商品、视频带来的 GMV、视频 GPM、客单 GMV、视频带来的销量、退款、退款件数、**完播率**、播放量、视频订单数、AOV
- 直播 Tab：直播 GMV、直播销量、退款、展示 GPM、时长……

**我的达人（`/affiliate/assets/creator-management`）**
- 字段：达人名、标签、橱窗商品、样品、视频、直播、GMV、退款、销量、退款件数、预估佣金、来源
- 支持批量上传、批量打标签、批量邀约、批量私信、批量删除
- 筛选：不在联盟计划内、90 天内未邀约

**联盟订单（`/product/order`）**
- 分达人订单 / 机构订单，按下单日期筛选，可导出
- 字段：订单 ID、商品（含 SKU ID）、达人、内容类型（视频 / 直播）、是否直播竞拍、订单状态、标准佣金率、店铺广告佣金率、预估 / 实际计佣基数、预估 / 实际标准佣金、预估 / 实际店铺广告佣金、单价和数量、是否全额退货退款、归因类型、佣金结算时间

---

## 1. 模块划分

建议新增一个插件 **「达人管理 / Creator Hub」**（`tiktok-creator-hub`），用 Tab 组织以下模块。现有的"达人建联"插件保留，两个插件共用店铺中心和达人库。

| # | 模块 | 一句话说明 | 优先级 |
|---|---|---|---|
| M0 | 店铺中心 / 多店铺切换 | 统一管理店铺、登录会话和数据同步，所有页面顶部都能切换店铺，也能看"全部店铺" | MVP |
| M1 | 寄样管理 | 镜像平台的样品申请和状态，补上成本、跟进、审批建议 | MVP |
| M2 | 履约率分析 | 达人 / 商品 / 店铺三个维度的履约、超期和样品 ROI | MVP |
| M3 | 视频分析 | 达人视频和直播效果、生命周期曲线、爆款识别，可推给 GMV Max 和创意工作室 | 第二期 |
| M4 | 达人库 CRM | 合并建联达人库和"我的达人"，给达人打分、分层、打标签、拉黑 | 第二期 |
| M5 | 联盟订单与佣金 | 订单明细、佣金对账、退款率 | 第三期 |
| M6 | 总览看板 | 首页 KPI、待办、建联漏斗、多店铺汇总 | 第一期简版，第三期完善 |

### M0 店铺中心（多店铺切换）
- 店铺列表：店铺名、地区、shop_id、店铺类型（本土 / 跨境）、登录状态、API 授权状态、最近同步时间、对应的 GMV Max 店铺
- 每个店铺一个 `persist:` 分区（沿用建联插件的做法），"打开后台"时打开该店铺的独立窗口，登录状态互不影响
- **Cookie 导入登录**：
  - 支持 Cookie-Editor 的 JSON 格式（数组，字段 name / value / domain / path / expirationDate / secure / httpOnly / sameSite），只接受 `tiktok.com`、`tiktokshop.com` 及其子域的 cookie，其余丢弃
  - 通过 `session.fromPartition(...).cookies.set()` 写入对应店铺的分区；原始 JSON 用 `safeStorage` 加密保存，方便过期后重新导入，日志和界面里都不显示 cookie 值
  - 导入后自动打开后台首页校验：识别出店铺名和 shop_id 就标记"已登录"，并检查是否和店铺记录一致（防止把 A 店的 cookie 导进 B 店）
  - 被重定向到登录页时标记"登录已失效"，提示用户重新导出
  - 界面上附一段简短教程：安装 Cookie-Editor → 打开 seller-vn.tiktok.com → Export → JSON → 粘贴
- 后台地址可配置：联盟中心或卖家中心，为 2027 年迁移做准备
- 顶部全局店铺切换器，存在 Pinia 里；"全部店铺"模式下只读汇总

### M1 寄样管理
- **列表**：申请 ID、达人、粉丝 / 性别 / 年龄、平台履约率、商品 / SKU、样品类型（免费 / 可退款）、审批方式、发布要求（视频 / 直播）、佣金率、状态、申请 / 审批 / 发货 / 签收 / 完成 / 取消时间、关联内容
- **本地补充字段**：样品成本（COGS）、运费、负责人、备注、跟进记录、是否拉黑
- **审批建议（只出建议，不自动执行）**：按规则打分，参考粉丝数、平均播放、历史 GMV、平台履约率、我方历史履约、类目是否匹配、是否合作过、同一商品已发样数量。给出"建议通过 / 待定 / 建议拒绝"和理由
- **跟进**：已签收超过 N 天还没发内容的进入"超期待跟进"列表，可以复用建联插件的私信模板生成跟进话术。发送仍需人工确认
- 审批 / 拒绝 / 发货这类写操作，MVP 阶段**不在软件里执行**，只提供"在后台打开这一条"的跳转

### M2 履约率分析（计算口径）

| 指标 | 定义 |
|---|---|
| **达人履约率（主指标）** | 按达人统计。分母：该达人截止日已到期的样品单（签收时间 + 30 天 ≤ 今天，没有签收时间的用发货时间 + 物流缓冲 M 天，M 默认 7 天），不含已取消的。分子：其中在截止日前**发布了关联该商品的视频或直播**的单数（不要求出单）。N=30 天、M 都可以在设置里改 |
| 按时履约率 | 在截止日前发布 / 到期样品单（同上） |
| 最终履约率 | 任何时间发布 / 到期样品单（包括超期才发的） |
| 平均履约天数 | 签收（或发货）→ 首条关联内容的天数，取中位数和平均数 |
| 出单转化率 | 已履约的样品单中，关联内容至少出 1 单的占比 |
| 样品 ROI（45 / 90 天） | 样品带来的内容 GMV ÷（样品成本 + 运费），与平台"ROI trong 45/90 ngày"口径对齐 |
| 平台履约率 | 直接展示平台给的达人"Thực hiện đơn hàng（履约率）"和样品分析里的"发布率"，标注"平台口径"，与我方口径并列，不混用 |

- 维度：达人、商品 / SKU、店铺、样品类型、审批方式、时间段（按申请月份分组看）
- 输出：达人履约排行（红黑榜）、商品发样效率、超期列表、按月趋势
- "关联内容"的判定：同一达人 + 同一商品，在审批之后发布的视频或直播（数据来自 M3）

### M3 视频分析
- 字段沿用"全部视频"页：视频 ID、标题、发布时间、达人、商品、GMV、GPM、客单 GMV、销量、订单、AOV、退款、退款件数、完播率、播放量；直播另有时长、展示 GPM 等
- 每天存一份快照，才能画出单条视频的**生命周期曲线**（GMV 和播放随时间的累计），用来识别长尾爆款和衰退视频
- 派生指标：千次播放 GMV、播放→订单转化、是否来自样品（关联 M1）
- 联动：爆款视频可以一键加入 GMV Max 创意库（`gmv_creative_assets` 里 source = affiliate），也可以送到创意工作室或 video-parser 做拆解

### M4 达人库 CRM
- 合并建联插件的 `library` 和平台"我的达人"：标签、来源、橱窗商品、累计样品、视频、直播、GMV、退款、佣金、我方履约率
- 达人评分卡：履约 40%、产出（GMV / 千次播放）30%、合作稳定性 20%、退款率 10%（权重可调），分 A/B/C/D 四级
- 拉黑名单联动寄样审批建议和建联任务

### M5 联盟订单与佣金
- 订单字段见上文；按达人 / 内容 / 商品汇总 GMV、佣金、退款率
- 预估佣金和实际佣金对账，退款订单剔除

### M6 总览看板
- 各店铺 KPI 卡片（GMV、退款、销量、视频、直播、发布达人数、出单达人数、预估佣金）和环比
- 待办：待审核样品、超期未履约、低库存的寄样商品
- 建联漏斗：已建联 → 已邀约 → 已加购 → 已申请样品 → 已收样 → 已发布 → 已出单

---

## 2. 数据来源与可行性

| 来源 | 能拿到什么 | 可行性 | 风险 |
|---|---|---|---|
| **A. 官方 Partner API**（建联插件已有签名和 OAuth） | 达人搜索、定向合作、私信、达人表现、合作推广明细 | 中。VN 本土店当前未授权，需要先验证能否授权。样品、联盟订单、视频这几类在 Partner API 里有没有开放接口，要查文档确认 | 申请权限要审核；接口版本会变；有些市场不开放 |
| **B. 已登录窗口内拦截页面数据**（Electron `webContents.debugger` + CDP `Network.getResponseBody`，只读页面自己发出请求的返回） | 页面上能看到的全部：样品申请、样品分析、视频、达人、订单、首页 KPI | 高（技术上可行），**推荐作为 MVP 主通道** | 内部接口随时改字段；2027 年迁到卖家中心后路径会变；频繁翻页可能触发风控，需要限速、只在用户在线时运行；属于平台未公开的用法，账号有一定风险 |
| **C. 手动导入导出文件**（xlsx / csv） | 效果分析、视频、订单这些带"导出"按钮的页面 | 很高，最稳 | 要人工操作；字段名是越南语，需要做列名映射（三语都要支持） |
| D. 本地录入 | 样品成本、运费、跟进记录、标签 | — | — |

**建议**：MVP 用 B 做主通道，C 做兜底（B 失效时用户也能导入）；A 打通后，凡是有官方接口的数据都优先走 A。采集层用 adapter 统一输出到同一套表，界面不关心数据来自哪里，每行记录 `source` 字段。

---

## 3. 与现有模块的关系

| 现有代码 | 复用方式 |
|---|---|
| `tiktok-creator-outreach/apiClient.ts` | 把签名、OAuth、token 加密存储、自动刷新抽到共享的 `lib/tiktokShopApi`，两个插件共用；新增的 API（如果开放）只往 ENDPOINTS 里加 |
| `tiktok-creator-outreach/browserClient.ts` | 每店铺一个 partition 的窗口直接复用；在它上面加一个 CDP 响应拦截器（新文件），只读 |
| `tiktok-creator-outreach/regions.ts` | 扩展成支持联盟中心和卖家中心两套地址 |
| 建联插件的 `library` / `templates` / IM | 达人库迁到新的 SQLite 表（旧 JSON 只读迁移一次）；跟进私信复用模板和发送流程（保留确认和审计） |
| `CreatorOutreachAccount` | 升级为共享的"店铺"实体（M0），建联插件改为读店铺中心 |
| `tiktok-gmv-max` | `storeId` = shop_id 用来关联；`gmv_product_costs` 提供样品成本；`gmv_creative_assets`(affiliate) 和视频分析按视频 ID 对接 |
| SQLite 模式（`tiktok-gmv-max/sqlite.ts`） | 沿用"索引列 + payload JSON"建表，加上 schema_migrations 表 |
| 插件注册 | `web-platform/plugins.ts` + `router/index.ts` + `PluginsView.vue` 各加一条；IPC 仿照 `registerTiktokCreatorOutreachIpc.ts`，在 `preload/index.ts` 里暴露 |
| UI | 用 vg- UI kit 和 `--theme-*` token，参照选品页；**按 Tab 拆成多个组件**，避免再出现 3500 行的单文件视图 |

---

## 4. 数据模型草案（`db/tiktok-creator-hub.sqlite`）

```text
ch_shops            id PK, name, region, shop_id, seller_id, store_type, backend(affiliate|seller_center),
                    partition, outreach_account_id, gmv_store_id, login_state(none|valid|expired),
                    cookie_encrypted, cookie_imported_at, cookie_expires_at, last_verified_at,
                    api_state, last_sync_at, payload
ch_product_costs    id PK, shop_id, product_id, sku_id NULL, unit_cost, shipping_cost, currency, updated_at
ch_creators         id PK, shop_id, creator_id, handle, nickname, followers, categories, gender_age,
                    tags[], source, blocked, score, tier, first_seen_at, updated_at, payload
ch_samples          id PK, shop_id, request_id UNIQUE, creator_id, product_id, sku_id, sample_type(free|refundable),
                    approval_method, content_requirement(video|live|either), commission_rate, status,
                    requested_at, approved_at, shipped_at, delivered_at, completed_at, cancelled_at,
                    platform_fulfillment_rate, cogs, shipping_cost, owner, note, source, synced_at, payload
ch_contents         id PK, shop_id, content_type(video|live), content_id UNIQUE, creator_id, product_ids[],
                    posted_at, title, duration, sample_id NULL, source, payload
ch_content_metrics  content_id, stat_date, views, completion_rate, gmv, orders, items_sold, refunds,
                    refunded_items, gpm, aov, synced_at          -- 每日快照，PK(content_id, stat_date)
ch_creator_daily    shop_id, creator_id, stat_date, gmv, refunds, est_commission, orders, items, videos,
                    lives, samples_shipped, ctor, views          -- PK(shop_id, creator_id, stat_date)
ch_shop_daily       shop_id, stat_date, payload(KPI 卡)
ch_affiliate_orders order_id PK, shop_id, creator_id, product_id, sku_id, content_type, content_id NULL,
                    order_status, created_at, std_rate, ads_rate, est_base, act_base, est_commission,
                    act_commission, est_ads_commission, act_ads_commission, price, qty, fully_refunded,
                    attribution, commission_paid_at, payload
ch_followups        id PK, sample_id, due_at, status(open|done|skipped), channel, note, created_at
ch_sync_jobs        id PK, shop_id, source(api|page|import), scope, status, started_at, finished_at, rows, error
ch_settings         key PK, value      -- 履约期 N、物流缓冲 M、评分权重等
ch_schema_migrations
```

---

## 5. 分阶段交付

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0 底座** | 插件骨架和注册、店铺中心 M0（多店铺 partition 登录、店铺切换器、后台地址可配置）、SQLite 建表、同步任务框架、导出文件导入（列名映射） | 能添加 2 个以上店铺并各自登录；导入一份样品或视频导出文件后能入库 |
| **P1 MVP** | M1 寄样管理（只读镜像 + 成本 / 备注 / 跟进）+ M2 履约率分析 + M6 简版（待办和 KPI） | 样品列表和平台条数一致；履约率按上文口径可复算；超期列表可用 |
| P2 | M3 视频分析（每日快照、生命周期曲线、样品关联）+ M4 达人库 CRM 和评分 | 能从视频回溯到样品单；达人分级可用 |
| P3 | M5 联盟订单与佣金、多店铺汇总看板、GMV Max 联动（样品成本、创意库） | 佣金对账差异可解释 |
| P4 | 写操作：在软件内审批 / 拒绝样品、批量跟进私信（逐批确认 + 审计）、自动化规则；完成卖家中心迁移适配 | 需另行确认 |

先做寄样和履约，是因为当前积压最明显（76 个待审核、149 个已完成待审核），而且数据只来自一两个页面，最容易先把采集通道跑通。

---

## 6. 用户确认记录

第 1～5 题已于 2026-11-15 答复，结论见文首"已确认的决策"。Cookie 登录意味着店铺数量不受限制，每导入一份 cookie 就是一个店铺。

### Cookie 登录的注意事项
- Cookie 等同于登录凭证：只加密存在本机，不上传、不写日志、不进导出文件
- 平台可能让 cookie 提前失效（改密码、异地登录、风控），所以要做失效检测和重新导入提示
- 读取数据时限速（翻页间隔、每天同步次数有上限），不在后台无限轮询，降低风控风险
