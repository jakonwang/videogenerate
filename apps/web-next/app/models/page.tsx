'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Heart,
  ImageIcon,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

import { AppShell } from '@/components/app/app-shell'
import { ErrorState, LoadingState } from '@/components/app/page-state'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button } from '@/components/ui/button'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'
import { cn, formatDateTime } from '@/lib/utils'

type CloneModelIdentitySummary = {
  id: string
  name: string
  status: 'idle' | 'generating' | 'done' | 'failed'
  productType: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
  coverImagePath?: string
  imagePaths: string[]
  description: string
  updatedAt: number
}

type ModelViewMode = 'grid' | 'list'
type ModelTabKey = 'all' | 'mine' | 'team' | 'favorites'

type EnrichedModel = CloneModelIdentitySummary & {
  market: string
  gender: string
  age: number
  ageLabel: string
  height: string
  weight: string
  styleTags: string[]
  languages: string[]
  sceneTags: string[]
  favorite: boolean
  badge?: string
  samples: string[]
}

const TAB_LABELS: Array<{ key: ModelTabKey; label: string }> = [
  { key: 'all', label: '全部模特' },
  { key: 'mine', label: '我的模特' },
  { key: 'team', label: '团队模特' },
  { key: 'favorites', label: '收藏夹' },
]

const PAGE_SIZE = 8

const STATUS_META = {
  done: { label: '在线', tone: 'is-online', dot: 'bg-emerald-400' },
  generating: { label: '生成中', tone: 'is-generating', dot: 'bg-cyan-400' },
  failed: { label: '异常', tone: 'is-failed', dot: 'bg-rose-400' },
  idle: { label: '离线', tone: 'is-idle', dot: 'bg-slate-400' },
} satisfies Record<CloneModelIdentitySummary['status'], { label: string; tone: string; dot: string }>

const LANGUAGE_POOL = [
  ['中文', '英文'],
  ['中文', '粤语', '英文'],
  ['中文', '英文', '日文'],
  ['中文', '英文'],
]

const STYLE_POOL = [
  ['甜美', '清新', '自然'],
  ['都市', '成熟', '知性'],
  ['活力', '阳光', '运动'],
  ['温柔', '治愈', '邻家'],
  ['复古', '港风', '优雅'],
  ['专业', '知性', '气质'],
]

const SCENE_POOL = [
  ['穿搭', '美妆', '生活'],
  ['电商展示', '导购口播', '产品演示'],
  ['街拍', '运动', '活力展示'],
  ['知识分享', '教学', '讲解'],
]

const EMPTY_MODELS: CloneModelIdentitySummary[] = [
  {
    id: 'model_001',
    name: '清甜小夏',
    status: 'done',
    productType: 'general',
    coverImagePath: '',
    imagePaths: [],
    description: '清新自然的邻家女孩形象，笑容甜美，气质温柔，适合穿搭、美妆、生活分享与产品展示内容。',
    updatedAt: Date.now() - 1000 * 60 * 18,
  },
  {
    id: 'model_002',
    name: '都市丽人-林薇',
    status: 'done',
    productType: 'general',
    coverImagePath: '',
    imagePaths: [],
    description: '适合高级感都市风、职场风和品牌展示内容，镜头表现稳定，适配成熟消费品类。',
    updatedAt: Date.now() - 1000 * 60 * 43,
  },
  {
    id: 'model_003',
    name: '气质御姐-思恩',
    status: 'idle',
    productType: 'general',
    coverImagePath: '',
    imagePaths: [],
    description: '适用于成熟质感表达、轻奢商品展示与电商短视频场景，风格利落克制。',
    updatedAt: Date.now() - 1000 * 60 * 95,
  },
  {
    id: 'model_004',
    name: '阳光活力-小雨',
    status: 'done',
    productType: 'general',
    coverImagePath: '',
    imagePaths: [],
    description: '适合运动、活力街拍和年轻消费品的内容表达，情绪明快，适合户外光感场景。',
    updatedAt: Date.now() - 1000 * 60 * 132,
  },
  {
    id: 'model_005',
    name: '温柔治愈-安安',
    status: 'idle',
    productType: 'general',
    coverImagePath: '',
    imagePaths: [],
    description: '适合生活方式、治愈感口播和轻家居内容，画面氛围柔和自然。',
    updatedAt: Date.now() - 1000 * 60 * 205,
  },
  {
    id: 'model_006',
    name: '复古港风-曼妮',
    status: 'done',
    productType: 'general',
    coverImagePath: '',
    imagePaths: [],
    description: '适合复古服饰、美妆和高级感商品展示，人物辨识度较高。',
    updatedAt: Date.now() - 1000 * 60 * 268,
  },
  {
    id: 'model_007',
    name: '甜酷女孩-小K',
    status: 'idle',
    productType: 'general',
    coverImagePath: '',
    imagePaths: [],
    description: '适合个性潮流、街头穿搭与年轻品牌表达，镜头冲击力较强。',
    updatedAt: Date.now() - 1000 * 60 * 320,
  },
  {
    id: 'model_008',
    name: '知性老师-林老师',
    status: 'done',
    productType: 'general',
    coverImagePath: '',
    imagePaths: [],
    description: '适合知识讲解、专业口播、教育内容和成熟产品说明。',
    updatedAt: Date.now() - 1000 * 60 * 362,
  },
]

function fallbackCover(index: number) {
  const seed = [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80',
  ]
  return seed[index % seed.length]
}

function enrichModel(model: CloneModelIdentitySummary, index: number): EnrichedModel {
  const styleTags = STYLE_POOL[index % STYLE_POOL.length]
  const sceneTags = SCENE_POOL[index % SCENE_POOL.length]
  const languages = LANGUAGE_POOL[index % LANGUAGE_POOL.length]
  const age = 20 + (index % 7) * 2
  const height = 158 + (index % 7) * 2
  const weight = 42 + (index % 5) * 3
  const cover = String(model.coverImagePath || model.imagePaths?.[0] || '').trim() || fallbackCover(index)
  const samples = (model.imagePaths?.length ? model.imagePaths : [cover])
    .concat(Array.from({ length: 4 }).map((_, sampleIndex) => fallbackCover(index + sampleIndex)))
    .slice(0, 4)

  return {
    ...model,
    coverImagePath: cover,
    imagePaths: model.imagePaths?.length ? model.imagePaths : [cover],
    market: index % 2 === 0 ? '162cm' : '168cm',
    gender: '女',
    age,
    ageLabel: `${age}岁`,
    height: `${height}cm`,
    weight: `${weight}kg`,
    styleTags,
    languages,
    sceneTags,
    favorite: index % 3 === 0,
    badge: index === 0 ? '推荐' : index === 1 ? '热门' : undefined,
    samples,
  }
}

function modelCover(model: CloneModelIdentitySummary | EnrichedModel) {
  return String(model.coverImagePath || model.imagePaths?.[0] || '').trim()
}

export default function ModelsPage() {
  const router = useRouter()
  const auth = useAuthGuard()

  const [activeTab, setActiveTab] = useState<ModelTabKey>('all')
  const [viewMode, setViewMode] = useState<ModelViewMode>('grid')
  const [search, setSearch] = useState('')
  const [genderFilter, setGenderFilter] = useState('全部性别')
  const [styleFilter, setStyleFilter] = useState('全部风格')
  const [ageFilter, setAgeFilter] = useState('全部年龄')
  const [languageFilter, setLanguageFilter] = useState('支持语言')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState('')

  const modelsQuery = useQuery({
    queryKey: ['clone-models'],
    queryFn: () => apiClient.listCloneModelIdentities(),
  })

  const createMutation = useMutation({
    mutationFn: (model: EnrichedModel) =>
      apiClient.createCloneProject({
        title: `${model.name} 复刻任务`,
        description: model.description || '',
        locale: 'zh-CN',
      }),
    onSuccess: (result, model) => {
      if (result.project?.id) router.push(`/clone/${result.project.id}?prefillModel=${model.id}`)
    },
  })

  const models = useMemo(() => {
    const source = modelsQuery.data?.length ? modelsQuery.data : EMPTY_MODELS
    return source.map((item, index) => enrichModel(item, index))
  }, [modelsQuery.data])

  const tabCounts = useMemo(
    () => ({
      all: models.length,
      mine: Math.max(0, Math.ceil(models.length * 0.66)),
      team: Math.max(0, Math.ceil(models.length * 0.34)),
      favorites: models.filter((item) => item.favorite).length,
    }),
    [models],
  )

  const filteredModels = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return models.filter((item, index) => {
      if (activeTab === 'mine' && index % 3 === 2) return false
      if (activeTab === 'team' && index % 2 === 1) return false
      if (activeTab === 'favorites' && !item.favorite) return false
      if (genderFilter !== '全部性别' && item.gender !== genderFilter.replace('模特', '')) return false
      if (styleFilter !== '全部风格' && !item.styleTags.includes(styleFilter)) return false
      if (ageFilter !== '全部年龄') {
        if (ageFilter === '18-24岁' && (item.age < 18 || item.age > 24)) return false
        if (ageFilter === '25-30岁' && (item.age < 25 || item.age > 30)) return false
        if (ageFilter === '30岁以上' && item.age < 30) return false
      }
      if (languageFilter !== '支持语言' && !item.languages.includes(languageFilter)) return false
      if (!keyword) return true
      const haystack = [item.name, item.description, item.productType, ...item.styleTags, ...item.languages, ...item.sceneTags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [activeTab, ageFilter, genderFilter, languageFilter, models, search, styleFilter])

  const totalPages = Math.max(1, Math.ceil(filteredModels.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedModels = filteredModels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const selectedModel = filteredModels.find((item) => item.id === selectedId) || pagedModels[0] || filteredModels[0] || models[0] || null

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复模特库',
    restoringDescription: '系统正在同步模特身份、封面和可复用场景配置。',
  })

  if (gate) return gate

  const activeFilterCount = [genderFilter, styleFilter, ageFilter, languageFilter].filter((item, index) => {
    const defaults = ['全部性别', '全部风格', '全部年龄', '支持语言']
    return item !== defaults[index]
  }).length

  const resetFilters = () => {
    setGenderFilter('全部性别')
    setStyleFilter('全部风格')
    setAgeFilter('全部年龄')
    setLanguageFilter('支持语言')
    setPage(1)
  }

  return (
    <AppShell sidebarContent={null}>
      <div className="page-shell page-shell--fixed models-page-shell">
        <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_344px]">
          <div className="panel grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3.5 px-5 py-4 models-catalog-panel">
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-2">
                <h1 className="page-title text-[28px] leading-none tracking-[-0.04em]">模特库</h1>
                <p className="body-copy max-w-3xl text-[14px]">
                  管理你的 AI 数字模特，支持形象筛选、声音克隆和场景适配。
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="secondary">
                  <Upload className="h-4 w-4" />
                  导入模特
                </Button>
                <Button>
                  <Plus className="h-4 w-4" />
                  创建模特
                </Button>
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(9,16,28,0.94),rgba(6,12,23,0.98))] px-4 py-3.5">
              <div className="models-tab-row">
                {TAB_LABELS.map((item) => {
                  const active = activeTab === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.key)
                        setPage(1)
                      }}
                      className={cn('models-tab', active && 'is-active')}
                    >
                      <span>{item.label}</span>
                      <span className="models-tab__count">{tabCounts[item.key]}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(220px,1.15fr)_auto]">
                <FilterButton label={genderFilter} options={['全部性别', '女模特']} onChange={setGenderFilter} />
                <FilterButton label={styleFilter} options={['全部风格', '甜美', '都市', '活力', '温柔', '复古', '专业']} onChange={setStyleFilter} />
                <FilterButton label={ageFilter} options={['全部年龄', '18-24岁', '25-30岁', '30岁以上']} onChange={setAgeFilter} />
                <FilterButton label={languageFilter} options={['支持语言', '中文', '英文', '粤语', '日文']} onChange={setLanguageFilter} />

                <label className="models-search-box">
                  <Search className="h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setPage(1)
                    }}
                    placeholder="搜索模特名称 / 标签"
                    className="w-full border-0 bg-transparent text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                </label>

                <div className="flex items-center justify-end gap-2">
                  <ViewSwitch active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
                    <Grid2X2 className="h-4 w-4" />
                  </ViewSwitch>
                  <ViewSwitch active={viewMode === 'list'} onClick={() => setViewMode('list')}>
                    <List className="h-4 w-4" />
                  </ViewSwitch>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <div className="text-[13px] text-slate-400">
                <span className="text-white">共 {filteredModels.length} 个模特</span>
                <span className="mx-2 text-slate-600">|</span>
                <span>{activeFilterCount ? `已启用 ${activeFilterCount} 个筛选条件` : '当前展示全部可用模特'}</span>
              </div>

              {activeFilterCount ? (
                <button type="button" className="text-[13px] text-violet-200 transition hover:text-white" onClick={resetFilters}>
                  清空筛选
                </button>
              ) : null}
            </div>

            <div className="min-h-0 overflow-auto pr-1 rail-scroll">
              {modelsQuery.isPending ? (
                <LoadingState compact title="正在同步模特库" description="先展示本地预览数据，接口返回后会自动刷新模特列表。" />
              ) : null}

              {modelsQuery.isError ? (
                <ErrorState
                  compact
                  title="模特数据暂时不可用"
                  description={modelsQuery.error instanceof Error ? `${modelsQuery.error.message}，当前已回退到本地预览数据。` : '当前无法读取在线模特数据，已回退到本地预览数据。'}
                  onRetry={() => void modelsQuery.refetch()}
                />
              ) : null}

              <div className={cn('models-grid', viewMode === 'grid' ? 'is-grid' : 'is-list')}>
                {pagedModels.map((model) => {
                  const selected = selectedModel?.id === model.id
                  const statusMeta = STATUS_META[model.status]
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedId(model.id)}
                      className={cn('models-card', selected && 'is-selected', viewMode === 'list' && 'is-list')}
                    >
                      <div className="models-card__media">
                        {modelCover(model) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={modelCover(model)} alt={model.name} className="models-card__image" />
                        ) : (
                          <div className="models-card__image models-card__image--empty">
                            <ImageIcon className="h-7 w-7" />
                          </div>
                        )}

                        <div className="models-card__overlay-top">
                          {model.badge ? <span className="models-card__badge">{model.badge}</span> : <span />}
                          <span className="models-card__fav">
                            <Heart className={cn('h-4 w-4', model.favorite && 'fill-current')} />
                          </span>
                        </div>

                        <div className="models-card__overlay-bottom">
                          <span className={cn('models-card__status', statusMeta.tone)}>{statusMeta.label}</span>
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/36 text-white">
                            <MoreHorizontal className="h-4 w-4" />
                          </span>
                        </div>
                      </div>

                      <div className="models-card__body">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <strong className="truncate text-[17px] font-semibold text-[var(--text-main)]">{model.name}</strong>
                            <span className="models-card__pro">Pro</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {model.styleTags.map((tag) => (
                            <span key={tag} className="models-card__chip">
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="text-[13px] text-[var(--text-secondary)]">
                          {model.ageLabel} ｜ {model.height} ｜ {model.weight}
                        </div>

                        <div className="text-[13px] text-[var(--text-secondary)]">支持语言：{model.languages.join('、')}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="models-pager-row">
              <div className="flex items-center gap-2">
                <PagerButton disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </PagerButton>
                {Array.from({ length: totalPages }).slice(0, 4).map((_, index) => {
                  const pageNumber = index + 1
                  return (
                    <PagerButton key={pageNumber} active={pageNumber === currentPage} onClick={() => setPage(pageNumber)}>
                      {pageNumber}
                    </PagerButton>
                  )
                })}
                <PagerButton disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </PagerButton>
              </div>

              <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                <span>共 {filteredModels.length} 条</span>
                <span className="models-page-size">8 条 / 页</span>
              </div>
            </div>
          </div>

          <aside className="panel grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3.5 px-5 py-4 models-detail-panel">
            {selectedModel ? (
              <>
                <div className="grid gap-3.5 rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,17,30,0.98),rgba(7,13,24,0.98))] p-4">
                  <div className="grid grid-cols-[104px_minmax(0,1fr)_16px] gap-3.5">
                    <div className="overflow-hidden rounded-[14px] border border-white/8 bg-black/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={modelCover(selectedModel)} alt={selectedModel.name} className="aspect-[0.92] w-full object-cover" />
                    </div>

                    <div className="grid gap-2.5">
                      <div className="flex items-center gap-2">
                        <strong className="text-[16px] font-semibold text-white">{selectedModel.name}</strong>
                        <span className="models-card__pro">Pro</span>
                      </div>

                      <div className="flex items-center gap-2 text-[13px] text-slate-300">
                        <span className={cn('inline-flex h-2 w-2 rounded-full', STATUS_META[selectedModel.status].dot)} />
                        <span>{STATUS_META[selectedModel.status].label}</span>
                      </div>

                      <div className="text-[13px] text-slate-400">
                        {selectedModel.ageLabel} ｜ {selectedModel.height} ｜ {selectedModel.weight}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedModel.styleTags.map((tag) => (
                          <span key={tag} className="models-card__chip">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button type="button" className="text-slate-500 transition hover:text-white">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <Button onClick={() => createMutation.mutate(selectedModel)} disabled={createMutation.isPending}>
                      {createMutation.isPending ? '创建中...' : '使用模特'}
                    </Button>
                    <Button variant="secondary">编辑信息</Button>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="models-detail-tabs">
                      {['模特信息', '声音克隆', '形象管理', '使用记录'].map((item, index) => (
                        <span key={item} className={cn('models-detail-tabs__item', index === 0 && 'is-active')}>
                          {item}
                        </span>
                      ))}
                    </div>

                    <button type="button" className="grid h-8 w-8 place-items-center rounded-[10px] border border-white/8 bg-white/[0.03] text-slate-300">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 overflow-auto pr-1 rail-scroll">
                  <div className="grid gap-6">
                    <section className="grid gap-3">
                      <h3 className="text-base font-semibold text-[var(--text-main)]">基本信息</h3>
                      <DetailRow label="模特 ID" value={selectedModel.id} />
                      <DetailRow label="创建时间" value={formatDateTime(selectedModel.updatedAt)} />
                      <DetailRow label="更新时间" value={formatDateTime(selectedModel.updatedAt)} />
                      <DetailRow label="支持语言" value={selectedModel.languages.join('、')} />
                      <DetailRow label="适用场景" value={selectedModel.sceneTags.join('、')} />
                      <DetailRow label="授权类型" value="企业授权" />
                      <DetailRow label="使用状态" value={selectedModel.status === 'done' ? '可用' : selectedModel.status === 'generating' ? '生成中' : '离线'} highlight={selectedModel.status === 'done'} />
                    </section>

                    <section className="grid gap-3">
                      <h3 className="text-base font-semibold text-[var(--text-main)]">标签</h3>
                      <div className="flex flex-wrap gap-2">
                        {[...selectedModel.styleTags, ...selectedModel.sceneTags].map((tag) => (
                          <span key={tag} className="models-detail-tag">
                            {tag}
                          </span>
                        ))}
                        <span className="models-detail-tag models-detail-tag--ghost">添加标签</span>
                      </div>
                    </section>

                    <section className="grid gap-3">
                      <h3 className="text-base font-semibold text-[var(--text-main)]">简介</h3>
                      <p className="text-sm leading-7 text-[var(--text-secondary)]">{selectedModel.description}</p>
                    </section>

                    <section className="grid gap-3">
                      <h3 className="text-base font-semibold text-[var(--text-main)]">作品预览</h3>
                      <div className="grid grid-cols-4 gap-2">
                        {selectedModel.samples.slice(0, 4).map((item, index) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={`${item}-${index}`} src={item} alt={`${selectedModel.name}-${index}`} className="aspect-square w-full rounded-[12px] object-cover" />
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid place-items-center text-center text-sm text-[var(--text-muted)]">请选择一个模特查看详情。</div>
            )}
          </aside>
        </section>
      </div>
    </AppShell>
  )
}

function FilterButton({
  label,
  options,
  onChange,
}: {
  label: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="models-filter-select-wrap">
      <select value={label} onChange={(event) => onChange(event.target.value)} className="models-filter-select">
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  )
}

function ViewSwitch({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className={cn('models-view-switch', active && 'is-active')}>
      {children}
    </button>
  )
}

function PagerButton({
  active,
  disabled,
  children,
  onClick,
}: {
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn('models-pager-button', active && 'is-active', disabled && 'is-disabled')}>
      {children}
    </button>
  )
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn('text-right text-[var(--text-secondary)]', highlight && 'font-medium text-emerald-400')}>{value}</span>
    </div>
  )
}
