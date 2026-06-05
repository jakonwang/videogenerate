'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CloneRunMode, ModelProfileOptions } from '@shared/web-api/types'
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
import { EmptyState, ErrorState, LoadingState } from '@/components/app/page-state'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button } from '@/components/ui/button'
import { RunModeDialog } from '@/components/clone/run-mode-dialog'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'
import { readAppSettings } from '@/lib/app-settings'
import { cn, formatDateTime, toPreviewSrc } from '@/lib/utils'
import { createEmptyModelProfileOptions, getModelProfileOptionGroups, getRecommendedModelProfileOptions } from '@shared/modelProfileOptions'

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

type CloneProjectSummary = {
  id: string
  title: string
  referenceVideoName: string
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

const PRODUCT_TYPE_LABELS: Record<CloneModelIdentitySummary['productType'], string> = {
  earrings: '饰品耳饰',
  phone_case: '手机壳',
  clothes: '服饰穿搭',
  toy: '玩具潮玩',
  general: '通用商业',
}

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
  const cover = toPreviewSrc(String(model.coverImagePath || model.imagePaths?.[0] || '').trim()) || fallbackCover(index)
  const rawSamples = (model.imagePaths?.length ? model.imagePaths : [model.coverImagePath || ''])
    .map((item) => toPreviewSrc(item))
    .filter(Boolean)
  const samples = rawSamples.concat(Array.from({ length: 4 }).map((_, sampleIndex) => fallbackCover(index + sampleIndex))).slice(0, 4)

  return {
    ...model,
    coverImagePath: cover,
    imagePaths: rawSamples.length ? rawSamples : [cover],
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
  return toPreviewSrc(String(model.coverImagePath || model.imagePaths?.[0] || '').trim())
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

export default function ModelsPage() {
  const router = useRouter()
  const auth = useAuthGuard()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<ModelTabKey>('all')
  const [viewMode, setViewMode] = useState<ModelViewMode>('grid')
  const [search, setSearch] = useState('')
  const [genderFilter, setGenderFilter] = useState('全部性别')
  const [styleFilter, setStyleFilter] = useState('全部风格')
  const [ageFilter, setAgeFilter] = useState('全部年龄')
  const [languageFilter, setLanguageFilter] = useState('支持语言')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createProjectId, setCreateProjectId] = useState('')
  const [createProductType, setCreateProductType] = useState<CloneModelIdentitySummary['productType']>('general')
  const [createProductPoints, setCreateProductPoints] = useState('')
  const [createModelProfileOptions, setCreateModelProfileOptions] = useState<ModelProfileOptions>(createEmptyModelProfileOptions())
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [createError, setCreateError] = useState('')
  const [runModeOpen, setRunModeOpen] = useState(false)
  const [selectedRunMode, setSelectedRunMode] = useState<CloneRunMode | null>(null)
  const [pendingProjectModel, setPendingProjectModel] = useState<EnrichedModel | null>(null)

  const modelsQuery = useQuery({
    queryKey: ['clone-models'],
    queryFn: () => apiClient.listCloneModelIdentities(),
  })

  const projectsQuery = useQuery({
    queryKey: ['clone-projects'],
    queryFn: () => apiClient.listCloneProjects(),
  })

  useEffect(() => {
    if (!createProjectId && projectsQuery.data?.[0]?.id) {
      setCreateProjectId(projectsQuery.data[0].id)
    }
  }, [createProjectId, projectsQuery.data])

  useEffect(() => {
    setCreateModelProfileOptions(getRecommendedModelProfileOptions(createProductType))
  }, [createProductType])

  const imageSettings = useMemo(() => {
    const settings = readAppSettings()
    const image = settings.modelConfig.image
    const providerRaw = String(image.provider || '').trim().toLowerCase()
    const provider =
      providerRaw === 'openai'
        ? 'openai'
        : providerRaw === 'kling' || providerRaw === 'atlascloud'
          ? 'kling'
          : providerRaw === 'grs.ai' || providerRaw === 'grsai'
            ? 'grsai'
            : providerRaw === 'vectorengine'
              ? 'apifox_hub'
            : 'apifox_hub'

    return {
      provider,
      host: String(image.host || '').trim(),
      apiKey: String(image.apiKey || '').trim(),
      model: String(image.model || '').trim(),
    } as const
  }, [createOpen])

  const createProjectMutation = useMutation({
    mutationFn: (input: { model: EnrichedModel; runMode: CloneRunMode }) => { const model = input.model; return apiClient.createCloneProject({
        title: `${model.name} 复刻任务`,
        description: input.model.description || '',
        locale: 'zh-CN',
        runMode: input.runMode,
      }) },
    onSuccess: (result, input) => {
      if (result.project?.id) router.push(`/clone/${result.project.id}?prefillModel=${input.model.id}`)
    },
  })

  const requestCreateProject = (model: EnrichedModel) => {
    setPendingProjectModel(model)
    setRunModeOpen(true)
  }

  const confirmCreateProject = () => {
    if (!selectedRunMode || !pendingProjectModel) return
    createProjectMutation.mutate(
      {
        model: pendingProjectModel,
        runMode: selectedRunMode,
      },
      {
        onSettled: () => {
          setRunModeOpen(false)
          setSelectedRunMode(null)
          setPendingProjectModel(null)
        },
      },
    )
  }

  const createModelMutation = useMutation({
    mutationFn: async () => {
      const files = await Promise.all(
        referenceFiles.map(async (file) => {
          const dataUrl = await readFileAsDataUrl(file)
          return {
            fileName: file.name,
            base64Data: dataUrl,
            mimeType: file.type || 'image/png',
          }
        }),
      )

      let uploadedPaths: string[] = []
      if (files.length) {
        const uploadResult = await apiClient.uploadCloneProductImages(createProjectId, { files })
        uploadedPaths = Array.isArray(uploadResult.assets) ? uploadResult.assets.map((item: any) => String(item.filePath || '').trim()).filter(Boolean) : []
      }

      return await apiClient.createCloneModelIdentity({
        cloneProjectId: createProjectId,
        productType: createProductType,
        productPoints: createProductPoints.trim() || undefined,
        modelProfileOptions: createModelProfileOptions,
        productReferenceImagePaths: uploadedPaths,
        imageProviderPrimary: imageSettings.provider,
        openaiApiKey: imageSettings.provider === 'openai' ? imageSettings.apiKey || undefined : undefined,
        openaiImageModel: imageSettings.provider === 'openai' ? imageSettings.model || 'gpt-image-2' : undefined,
        openaiImageQuality: imageSettings.provider === 'openai' ? 'high' : undefined,
        klingApiKey: imageSettings.provider === 'kling' ? imageSettings.apiKey || undefined : undefined,
        klingHost: imageSettings.provider === 'kling' ? imageSettings.host || undefined : undefined,
        klingImageModel: imageSettings.provider === 'kling' ? imageSettings.model || undefined : undefined,
        grsaiApiKey: imageSettings.provider === 'grsai' ? imageSettings.apiKey || undefined : undefined,
        grsaiHost: imageSettings.provider === 'grsai' ? imageSettings.host || undefined : undefined,
        grsaiImageModel: imageSettings.provider === 'grsai' ? imageSettings.model || undefined : undefined,
        apifoxHub:
          imageSettings.provider === 'apifox_hub'
            ? {
                enabled: true,
                baseUrl: imageSettings.host || undefined,
                apiKey: imageSettings.apiKey || undefined,
                imageModel: imageSettings.model || undefined,
              }
            : undefined,
      })
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clone-models'] }),
        queryClient.invalidateQueries({ queryKey: ['clone-projects'] }),
      ])
      setCreateOpen(false)
      setCreateProductPoints('')
      setCreateModelProfileOptions(getRecommendedModelProfileOptions(createProductType))
      setReferenceFiles([])
      setCreateError('')
      if (result.model?.id) {
        setSelectedId(result.model.id)
      }
    },
    onError: (error: Error) => {
      setCreateError(error.message)
    },
  })

  const models = useMemo(() => {
    const source = modelsQuery.data || []
    return source.map((item, index) => enrichModel(item, index))
  }, [modelsQuery.data])

  const projects = useMemo(() => {
    return ((projectsQuery.data || []).map((item) => ({
      id: item.id,
      title: item.title || item.referenceVideoName || item.id,
      referenceVideoName: item.referenceVideoName || '',
      updatedAt: item.updatedAt,
    })) as CloneProjectSummary[]).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  }, [projectsQuery.data])

  const modelProfileGroups = useMemo(() => getModelProfileOptionGroups(), [])

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
      <RunModeDialog
        open={runModeOpen}
        creating={createProjectMutation.isPending}
        selectedMode={selectedRunMode}
        title="选择模特任务运行模式"
        description="从模特库创建复刻任务时必须先选择运行模式。自动运行会自动推进并在最终成片前执行硬门禁。"
        onSelect={setSelectedRunMode}
        onCancel={() => {
          if (createProjectMutation.isPending) return
          setRunModeOpen(false)
          setSelectedRunMode(null)
          setPendingProjectModel(null)
        }}
        onConfirm={confirmCreateProject}
      />
      <div className="page-shell page-shell--fixed models-page-shell">
        <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_344px]">
          <div className="panel grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3.5 px-5 py-4 models-catalog-panel">
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-2">
                <h1 className="page-title text-[28px] leading-none tracking-[-0.04em]">模特库</h1>
                <p className="body-copy max-w-3xl text-[14px]">管理你的 AI 数字模特，支持形象筛选、真实数据查询和直接发起新模特生成。</p>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                  <Upload className="h-4 w-4" />
                  导入商品图
                </Button>
                <Button
                  onClick={() => {
                    setCreateError('')
                    setCreateOpen(true)
                  }}
                >
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
              {modelsQuery.isPending ? <LoadingState compact title="正在同步模特库" description="正在从真实接口读取模特数据。" /> : null}

              {modelsQuery.isError ? (
                <ErrorState
                  compact
                  title="模特数据暂时不可用"
                  description={modelsQuery.error instanceof Error ? modelsQuery.error.message : '当前无法读取在线模特数据。'}
                  onRetry={() => void modelsQuery.refetch()}
                />
              ) : null}

              {!modelsQuery.isPending && !modelsQuery.isError && !filteredModels.length ? (
                <EmptyState
                  compact
                  title="还没有模特"
                  description="当前账号下暂无可用模特。先选择一个复刻项目并上传商品图，再创建第一位模特。"
                  actionLabel="创建模特"
                  onAction={() => setCreateOpen(true)}
                />
              ) : null}

              {!!pagedModels.length ? (
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
                            {model.ageLabel} · {model.height} · {model.weight}
                          </div>

                          <div className="text-[13px] text-[var(--text-secondary)]">支持语言：{model.languages.join('、')}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : null}
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
                        {selectedModel.ageLabel} · {selectedModel.height} · {selectedModel.weight}
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
                    <Button onClick={() => requestCreateProject(selectedModel)} disabled={createProjectMutation.isPending}>
                      {createProjectMutation.isPending ? '创建中...' : '使用模特'}
                    </Button>
                    <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                      继续生成
                    </Button>
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
                      <h3 className="text-base font-semibold text-[var(--text-main)]">基础信息</h3>
                      <DetailRow label="模特 ID" value={selectedModel.id} />
                      <DetailRow label="更新时间" value={formatDateTime(selectedModel.updatedAt)} />
                      <DetailRow label="商品类型" value={PRODUCT_TYPE_LABELS[selectedModel.productType]} />
                      <DetailRow label="支持语言" value={selectedModel.languages.join('、')} />
                      <DetailRow label="适用场景" value={selectedModel.sceneTags.join('、')} />
                      <DetailRow label="授权类型" value="企业授权" />
                      <DetailRow
                        label="使用状态"
                        value={selectedModel.status === 'done' ? '可用' : selectedModel.status === 'generating' ? '生成中' : selectedModel.status === 'failed' ? '失败' : '离线'}
                        highlight={selectedModel.status === 'done'}
                      />
                    </section>

                    <section className="grid gap-3">
                      <h3 className="text-base font-semibold text-[var(--text-main)]">标签</h3>
                      <div className="flex flex-wrap gap-2">
                        {[...selectedModel.styleTags, ...selectedModel.sceneTags].map((tag) => (
                          <span key={tag} className="models-detail-tag">
                            {tag}
                          </span>
                        ))}
                        <span className="models-detail-tag models-detail-tag--ghost">真实数据驱动</span>
                      </div>
                    </section>

                    <section className="grid gap-3">
                      <h3 className="text-base font-semibold text-[var(--text-main)]">简介</h3>
                      <p className="text-sm leading-7 text-[var(--text-secondary)]">{selectedModel.description || '暂无简介'}</p>
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

      {createOpen ? (
        <div className="fixed inset-0 z-50 bg-black/60 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto grid max-h-full w-full max-w-[920px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[28px] border border-white/10 bg-[#09111c] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
              <div className="grid gap-1.5">
                <h2 className="text-[22px] font-semibold text-white">创建模特</h2>
                <p className="text-sm text-slate-400">选择真实复刻项目、上传商品图并填写卖点，直接调用后端模特生成能力。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!createModelMutation.isPending) setCreateOpen(false)
                }}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-slate-400 transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 gap-5 overflow-auto px-6 py-5 lg:grid-cols-[minmax(0,1.1fr)_320px]">
              <div className="grid content-start gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <FieldBlock label="商品类型">
                    <select
                      value={createProductType}
                      onChange={(event) => setCreateProductType(event.target.value as CloneModelIdentitySummary['productType'])}
                      className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none"
                    >
                      {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FieldBlock>
                </div>

                <FieldBlock label="模特设定">
                  <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    {modelProfileGroups.map((group) => (
                      <div key={group.key} className="grid gap-2">
                        <div className="grid gap-1">
                          <div className="text-sm font-medium text-white">{group.label}</div>
                          <div className="text-xs text-slate-500">{group.description}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.options.map((option) => {
                            const active = createModelProfileOptions[group.key] === option.value
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setCreateModelProfileOptions((current) => ({
                                    ...current,
                                    [group.key]: option.value,
                                  }))
                                }
                                className={cn(
                                  'rounded-full border px-3 py-1.5 text-xs transition',
                                  active
                                    ? 'border-cyan-400/60 bg-cyan-400/12 text-cyan-100'
                                    : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white',
                                )}
                              >
                                {option.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </FieldBlock>

                <FieldBlock label="补充描述（可选）">
                  <textarea
                    value={createProductPoints}
                    onChange={(event) => setCreateProductPoints(event.target.value)}
                    rows={5}
                    placeholder="例如：更温柔亲和、适合近景佩戴展示、生活化一点、偏转化型表达。"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </FieldBlock>

                <FieldBlock label="商品参考图" required>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    onChange={(event) => setReferenceFiles(Array.from(event.target.files || []))}
                    className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:text-white"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {referenceFiles.length ? (
                      referenceFiles.map((file) => (
                        <span key={`${file.name}-${file.size}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                          {file.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">至少上传 1 张商品图，用于生成真实模特形象。</span>
                    )}
                  </div>
                </FieldBlock>

                <FieldBlock label="当前图片模型配置">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span>
                        供应商：<span className="font-medium text-white">{imageSettings.provider}</span>
                      </span>
                      <span>
                        模型：<span className="font-medium text-white">{imageSettings.model || '未设置'}</span>
                      </span>
                      <span>
                        API Key：<span className="font-medium text-white">{imageSettings.apiKey ? '已配置' : '未设置'}</span>
                      </span>
                    </div>
                    <div className="mt-2 text-xs leading-6 text-slate-500">该配置直接读取自“设置中心 / 图片模型”。</div>
                  </div>
                </FieldBlock>
              </div>

              <aside className="grid content-start gap-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm leading-6 text-cyan-100">
                  使用当前图片模型配置创建模特；创建完成后会自动出现在模特库中。
                </div>

                {createError ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/8 p-4 text-xs leading-6 text-rose-100">{createError}</div> : null}
              </aside>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/8 px-6 py-4">
              <div className="text-xs text-slate-500">验收要点：能真实创建模特、列表刷新为真实数据、可继续在复刻工作台使用。</div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={createModelMutation.isPending}>
                  取消
                </Button>
                <Button
                  onClick={() => {
                    setCreateError('')
                    if (!createProjectId) {
                      setCreateError('请先创建一个复刻项目。')
                      return
                    }
                    if (!referenceFiles.length) {
                      setCreateError('请至少上传一张商品参考图。')
                      return
                    }
                    if (!imageSettings.apiKey) {
                      setCreateError('请先到设置页完善图片模型的 API Key。')
                      return
                    }
                    createModelMutation.mutate()
                  }}
                  disabled={createModelMutation.isPending}
                >
                  {createModelMutation.isPending ? '生成中...' : '开始创建'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}

function FieldBlock({
  label,
  children,
  required,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-white">
        {label}
        {required ? <span className="ml-1 text-rose-300">*</span> : null}
      </span>
      {children}
    </label>
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
