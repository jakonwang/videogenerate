# /clone 四步流程修复补丁（2026-05-02）

## 本次修复目标

1. 修复顶部 4 步流程条显示异常（错位、换行、截断混乱）。
2. 修复第 2 步“一致性素材”长时间无响应的问题。
3. 清理主流程的禁用提示文案，统一走 i18n。

## 改动文件

- `src/renderer/src/ui/views/CloneView.vue`
- `src/main/modules/clone/service.ts`

## 具体改动

### 1) 顶部流程条样式修复

- 去掉模板内联固定宽度样式，改为 CSS 控制：
  - 宽屏：4 列等分单行显示。
  - 窄屏：横向滚动，不换行。
- 为步骤项补齐显式网格布局：
  - 序号、标题、状态固定排布。
  - 标题与状态统一单行省略，避免错位。

### 2) 一致性素材卡住修复

- `generateConsistencyAssets` 增加复用判定：
  - 优先复用 `selectedModelIdentityPackId / selectedModelIdentityId / selectedModelIdentitySnapshot.id` 对应的已完成模特包。
- 调整触发新建模特包条件：
  - 只有“存在身份相关上下文且不可复用”时才新建。
  - 仅产品参考图场景不再强制卡在新建模特包。

### 3) 文案统一

- `workflowDisabledReason` 移除硬编码中文，改为：
  - `cloneWorkflow.status.running`
  - `cloneWorkflow.disabledReason`
- 第 3 步前置条件放宽：
  - 有 `consistencyAssets.modelPackId` 或 `consistencyAssets.referenceImages` 任一即可进入下一步。

## 验收点

1. 顶部 4 步流程在 1920 宽度下始终单行，不出现 2 行错位。
2. 第 2 步在仅上传产品参考图时能正常结束，不长时间卡住。
3. 前置禁用提示不再混杂硬编码文本。

## 2026-05-02 补充（模型显式触发）

- 第 2 步新增显式按钮：`调用模型生成一致性素材`。
- 默认主按钮仍为快速路径（仅快照，不调用模型）。
- 点击显式按钮后：
  - 走 `clone:generateConsistencyAssets` 且 `generateModelPack=true`
  - 调用真实图片模型链路生成模特一致性素材
  - 保留真实 provider 错误，不做静默 mock

## 2026-05-02 ���䣺�ڶ���/��������ʵģ����·�޸�

- �ڶ�������ť����Ĭ������ʵͼƬģ��һ�����ز����ɣ�����ֻ���� `consistencyAssets` ���ա�
- `clone:generateConsistencyAssets({ generateModelPack: true })` ����Ҫ����Ŀ�Ѿ�����ģ�����ݰ���û�пɸ������ݰ�ʱ��ֱ�Ӵ����µ� AI ģ�����ݰ���
- AI ģ�����ݰ��� 4 �Ųο�ͼ��չΪ 9 ���������桢��������֮�����������������ֲ������/ʹ��ϸ�ڡ�������Ͳ�Ʒ����������Ź���һ�����زĵ�Ĭ��Ŀ�ꡣ
- �ڶ��������ڼ�ǰ��ÿ 4 ��ˢ����Ŀ״̬�������̨����ͼƬ���ɵ�ҳ�濴����������ģ�����ɳ�ʱ���޵���Ϊ 15 ���ӡ�
- �����������־�ͼ����ͼƬģ����· `generateGptShotFrames` ������β֡�����ٵ��þ���Ƶ��Ӧ����β֡�ӿ� `generateShotFrames`��
- ������ǰ��������Ϊ������ `consistencyAssets.modelPackId`������ֻ�����Ʒͼ��ֱ�ӽ�����Ƶ���ɵ��º���ͼƬģ�ͷ־�ʧ�ܡ�
- Windows ��ִ�� `npm run build` ͨ����·����ʹ����Ŀ���� `getAppPaths()` / `path.join`�������� Linux ������Ӳ����·����
