# 2026-05-01 /clone 升级补充（第二轮）

## 新增
- 变体审核持久化：
  - 新增 `clone:updateVariantReview`
  - 支持分镜变体“保留/淘汰”，写回 `baseBlueprint.variants[*].reviewStatus`
- 方案审核持久化：
  - 新增 `clone:updateVideoPlanStatus`
  - 支持视频方案“淘汰”，写回 `baseBlueprint.videoPlans[*].status='rejected'`
- 成本提醒：
  - 新增“生成 Top 3 视频”前确认弹窗
  - 用户确认后才批量触发 Top 3 方案出片

## 使用说明
1. 先执行“生成分镜变体”与“AI评分筛选”。  
2. 在当前分镜变体池中可逐条“保留/淘汰”。  
3. 在视频方案区可对不需要的方案“淘汰方案”。  
4. 点击“生成 Top 3 视频”会先弹出成本提示，确认后开始出片。  
