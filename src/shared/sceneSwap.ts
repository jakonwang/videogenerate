/** AI 修图（换场景 / 生成模特图 / 换模特）：云端、网页、软件、手机共用的数据形状和上限 */

export const SCENE_SWAP_MAX_IMAGES = 100
export const SCENE_SWAP_MAX_SCENES = 5
export const SCENE_SWAP_TRIAL_IMAGES = 2
export const SCENE_CATEGORIES = ['街拍', '室内', '户外', '棚拍'] as const

/** scene = 换场景；tryon = 产品图生成模特图；model = 换模特；product = 换商品 */
export const SCENE_SWAP_TASKS = ['tryon', 'model', 'scene', 'product'] as const
export type SceneSwapTask = (typeof SCENE_SWAP_TASKS)[number]

/** 生成模特图：一款最多参考几张产品图 */
export const TRYON_MAX_PRODUCT_IMAGES = 4
/** 换商品：最多几张商品参考图 */
export const SWAP_MAX_PRODUCT_IMAGES = 4
export const TRYON_SHOTS = ['front', 'side', 'half', 'detail', 'back', 'seated'] as const
export type TryonShot = (typeof TRYON_SHOTS)[number]
export const TRYON_DEFAULT_SHOTS: TryonShot[] = ['front', 'side', 'half', 'detail']
export const TRYON_SHOT_LABEL: Record<TryonShot, string> = { front: '正面', side: '侧面', half: '半身', detail: '细节', back: '背面', seated: '坐姿' }
export const PRODUCT_VIEWS = ['front', 'back', 'detail'] as const
export type ProductView = (typeof PRODUCT_VIEWS)[number]

export const MODEL_GENDERS = ['女', '男', '中性'] as const
export const MODEL_SKINS = ['浅', '中', '深'] as const
export const MODEL_BODIES = ['标准', '高挑', '大码'] as const

/** keep = 保真（保留原图人物和衣服，只换背景）；blend = 融合（整张重画）。只有换场景可选，另外两种都是重画 */
export type SceneSwapMode = 'keep' | 'blend'
export type SceneSwapSize = 'original' | '3:4' | '1:1' | '9:16'
/** waiting：等用户看完试图再跑；review：质检不确定，等用户决定（这时点数只是冻结） */
export type SceneSwapItemStatus = 'waiting' | 'queued' | 'running' | 'passed' | 'review' | 'failed' | 'rejected'
export type SceneSwapBatchStatus = 'trial' | 'trial_ready' | 'running' | 'paused' | 'done'

export type SceneSwapCheck = { key: 'color' | 'pattern' | 'face' | 'edge' | 'light' | 'frame' | 'shape' | 'model' | 'pose' | 'limbs' | 'product' | 'scene'; level: 'ok' | 'warn' | 'unknown' }
export const SCENE_REDO_REASONS = ['边缘不干净', '衣服变了', '脸变了', '光线假', '比例不对'] as const
export const MODEL_REDO_REASONS = ['衣服变了', '不像所选模特', '手脚不对', '姿势变了', '光线假', '比例不对'] as const
export const TRYON_REDO_REASONS = ['衣服变了', '版型不对', '不像所选模特', '手脚不对', '光线假', '比例不对'] as const
export const PRODUCT_REDO_REASONS = ['商品不对', '其他地方变了', '没换干净', '光线假', '比例不对'] as const
export const redoReasonsOf = (task: SceneSwapTask): readonly string[] => (task === 'product' ? PRODUCT_REDO_REASONS : task === 'tryon' ? TRYON_REDO_REASONS : task === 'model' ? MODEL_REDO_REASONS : SCENE_REDO_REASONS)

export type SceneSwapScene = { id: string; name: string; category: string; fileId: string; source: 'system' | 'mine' }
/** library = 「模特库」里已同步到云端的模特 */
export type SwapModel = { id: string; name: string; gender: string; skin: string; body: string; fileId: string; source: 'system' | 'mine' | 'library' }
export type SceneSwapImage = { fileId: string; name: string; group?: string; view?: ProductView }
export type SceneSwapItem = {
  id: string
  sourceFileId: string
  sourceName: string
  group: string
  sceneId: string
  /** 换场景 / 换模特是场景名，生成模特图是镜头名 */
  sceneName: string
  sceneFileId: string
  /** 生成模特图的主图（同款其余的图照着它出） */
  master?: boolean
  shot?: TryonShot
  status: SceneSwapItemStatus
  /** 免费试图 */
  trial: boolean
  outputFileId?: string
  checks: SceneSwapCheck[]
  error?: string
  attempts: number
}
export type SceneSwapBatch = {
  id: string
  title: string
  task: SceneSwapTask
  mode: SceneSwapMode
  size: SceneSwapSize
  matchLight: boolean
  modelId?: string
  modelName?: string
  modelFileId?: string
  shots?: TryonShot[]
  productName?: string
  productFileIds?: string[]
  /** 生成模特图的全部产品图（再做一批时用） */
  images?: SceneSwapImage[]
  status: SceneSwapBatchStatus
  /** 自动暂停的原因（如点数不足） */
  notice?: string
  items: SceneSwapItem[]
  createdAt: number
  updatedAt: number
}
export type SceneSwapCreateInput = {
  /** 不填 = 换场景（老版本软件） */
  task?: SceneSwapTask
  title?: string
  mode: SceneSwapMode
  size: SceneSwapSize
  matchLight: boolean
  images: SceneSwapImage[]
  /** 换场景必选；换模特不选 = 背景不变；生成模特图最多 1 个，不选 = 纯色影棚 */
  sceneIds: string[]
  modelId?: string
  shots?: TryonShot[]
  /** 换商品：商品参考图 */
  productFileIds?: string[]
  productName?: string
}
export type SceneSwapInfo = { keepAvailable: boolean; trialsLeft: number; pointsPerImage: number; scenes: SceneSwapScene[]; models: SwapModel[] }

const VIEW_WORD = /[\s_\-(（]+(?:正面|背面|侧面|细节|特写|正|背|front|back|side|detail)[)）]?(?=[\s_\-(（]|$)/giu
/** 按文件名里的款号分组：A108-1.jpg、A108_2.jpg、A108-背.jpg → A108；看不出来的归到「未分款」 */
export function styleGroupOf(fileName: string): string {
  const full = String(fileName || '').replace(/\.[^.]+$/, '').trim()
  const base = full.replace(VIEW_WORD, '')
  const match = /^(.+?)[\s_\-(（]+\d{1,3}[)）]?$/u.exec(base)
  const head = (match?.[1] ?? (base === full ? '' : base)).trim()
  if (!head || /^(img|dsc|mmexport|微信图片|wechat|screenshot|image|photo|\d{6,})$/i.test(head)) return '未分款'
  return head.slice(0, 40)
}

/** 产品图是正面、背面还是细节：看文件名，看不出来算正面 */
export function productViewOf(fileName: string): ProductView {
  if (/背|back/i.test(fileName)) return 'back'
  if (/细节|特写|detail/i.test(fileName)) return 'detail'
  return 'front'
}

/** 每款实际参考的产品图：正面在前，最多 4 张，有背面图时一定带上 */
export function tryonProducts<T extends { view?: ProductView }>(images: T[]): T[] {
  const of = (view: ProductView) => images.filter((image) => (image.view ?? 'front') === view)
  const front = of('front')
  const back = of('back')
  const picked = new Set([...front.slice(0, 1), ...back.slice(0, 1), ...of('detail').slice(0, 1), ...front, ...of('detail'), ...back])
  const chosen = [...picked].slice(0, TRYON_MAX_PRODUCT_IMAGES)
  return PRODUCT_VIEWS.flatMap((view) => chosen.filter((image) => (image.view ?? 'front') === view))
}

/** 每款实际能出的镜头：没有背面图不出背面（不编造），只有背面图时只出背面；第一张是主图 */
export function tryonShotsFor(images: Array<{ view?: ProductView }>, shots: readonly TryonShot[]): TryonShot[] {
  const views = new Set(images.map((image) => image.view ?? 'front'))
  return TRYON_SHOTS.filter((shot) => shots.includes(shot) && (shot === 'back' ? views.has('back') : views.has('front') || views.has('detail')))
}
