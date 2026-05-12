'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Clapperboard,
  Cloud,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Info,
  MessageSquareText,
  RefreshCw,
  Save,
  Server,
  Settings2,
} from 'lucide-react'

import { AppShell } from '@/components/app/app-shell'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type CloudStorageConfig,
  type ModelSection,
  readAppSettings,
  saveAppSettings,
} from '@/lib/app-settings'

type SectionKey = 'video' | 'image' | 'chat' | 'cloud'

const sectionMeta: Array<{
  key: SectionKey
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { key: 'video', title: '视频模型', description: '成片、镜头视频与视频生成主链路。', icon: Clapperboard },
  { key: 'image', title: '图片模型', description: '分镜图、商品图与图像编辑能力。', icon: ImageIcon },
  { key: 'chat', title: '对话模型', description: '脚本分析、提示词生成与智能交互。', icon: MessageSquareText },
  { key: 'cloud', title: '通用设置', description: '语言、本地输出与云存储等基础参数。', icon: Settings2 },
]

const providerOptions = ['AtlasCloud', 'GRS.AI', 'ai666', 'OpenAI', '自定义']

export default function SettingsPage() {
  const auth = useAuthGuard()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [savedAt, setSavedAt] = useState('')
  const [activeSection, setActiveSection] = useState<SectionKey>('video')
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setSettings(readAppSettings())
  }, [])

  const save = () => {
    saveAppSettings(settings)
    setSavedAt(new Date().toLocaleString('zh-CN', { hour12: false }))
  }

  const reset = () => {
    setSettings(DEFAULT_APP_SETTINGS)
    setSavedAt('')
  }

  const summaryCards = useMemo(
    () => [
      {
        title: '视频主链路',
        value: settings.modelConfig.video.provider || '未设置',
        meta: settings.modelConfig.video.model || '未填写模型名称',
        icon: Clapperboard,
        tone: 'default' as const,
      },
      {
        title: '图片主链路',
        value: settings.modelConfig.image.provider || '未设置',
        meta: settings.modelConfig.image.model || '未填写模型名称',
        icon: ImageIcon,
        tone: 'default' as const,
      },
      {
        title: '对话主链路',
        value: settings.modelConfig.chat.provider || '未设置',
        meta: settings.modelConfig.chat.model || '未填写模型名称',
        icon: MessageSquareText,
        tone: 'default' as const,
      },
      {
        title: '保存状态',
        value: savedAt ? '已保存' : '待保存',
        meta: savedAt || '当前仅保存到浏览器本地环境',
        icon: Server,
        tone: savedAt ? ('success' as const) : ('pending' as const),
      },
    ],
    [savedAt, settings.modelConfig],
  )

  const section = settings.modelConfig[activeSection]

  const toggleSecret = (key: string) => {
    setVisibleSecrets((current) => ({ ...current, [key]: !current[key] }))
  }

  const updateSection = (key: 'video' | 'image' | 'chat', next: ModelSection) => {
    setSettings((current) => ({
      ...current,
      modelConfig: {
        ...current.modelConfig,
        [key]: next,
      },
    }))
  }

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复设置中心',
    restoringDescription: '系统正在读取本地配置与当前登录状态。',
  })

  if (gate) return gate

  return (
    <AppShell headerSearchPlaceholder="搜索任务、模板、模型配置...">
      <div className="page-shell grid gap-1.5">
        <section className="panel rounded-[14px] border border-white/6 bg-[linear-gradient(180deg,rgba(12,18,31,0.96),rgba(9,14,24,0.98))] px-4 py-3 shadow-[0_12px_30px_rgba(3,8,18,0.2)]">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid gap-1">
                <h1 className="text-[18px] font-semibold tracking-[-0.03em] text-white">设置中心</h1>
                <p className="max-w-[820px] text-[12px] leading-[1.55] text-slate-300">
                  统一管理 Web 工作台与桌面端共用的模型参数。当前仍只保存到浏览器本地，不新增服务端设置协议。
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  className="h-7.5 rounded-[9px] border-white/10 bg-white/[0.03] px-3 text-[11px] text-slate-100"
                  onClick={reset}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  恢复默认
                </Button>
                <Button className="h-7.5 rounded-[9px] bg-[linear-gradient(90deg,#5c47ff,#7158ff)] px-4 text-[11px]" onClick={save}>
                  <Save className="h-3.5 w-3.5" />
                  保存设置
                </Button>
              </div>
            </div>

            <div className="grid gap-1.5 rounded-[12px] border border-white/6 bg-[linear-gradient(180deg,rgba(13,21,36,0.78),rgba(10,16,28,0.74))] px-3.5 py-2 xl:grid-cols-4">
              {summaryCards.map((item) => {
                const Icon = item.icon
                const valueTone = item.tone === 'success' ? 'text-emerald-400' : 'text-slate-100'

                return (
                  <div key={item.title} className="grid gap-1">
                    <div className="flex items-start gap-2">
                      <div className="grid h-7.5 w-7.5 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(103,83,255,0.24),rgba(91,68,255,0.12))] text-violet-300">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="grid gap-0.5">
                        <span className="text-[11px] font-semibold text-white">{item.title}</span>
                        <span className={`text-[14px] font-medium leading-4 ${valueTone}`}>{item.value}</span>
                      </div>
                    </div>
                    <span className="pl-9.5 text-[10px] leading-4 text-slate-400">{item.meta}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="grid min-h-0 gap-1.5 xl:grid-cols-[176px_minmax(0,1fr)_198px]">
          <aside className="grid gap-0 overflow-hidden rounded-[14px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,16,28,0.96),rgba(8,13,23,0.98))]">
            {sectionMeta.map((item) => {
              const Icon = item.icon
              const active = item.key === activeSection

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveSection(item.key)}
                  className={`grid gap-1 border-b border-white/6 px-3 py-2 text-left transition last:border-b-0 ${
                    active
                      ? 'bg-[linear-gradient(90deg,rgba(91,68,255,0.2),rgba(91,68,255,0.06))] shadow-[inset_2px_0_0_0_#6d57ff]'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="grid h-6.5 w-6.5 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(103,83,255,0.22),rgba(91,68,255,0.1))] text-violet-300">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <strong className="text-[12px] font-semibold text-white">{item.title}</strong>
                  </div>
                  <span className="pl-8.5 text-[10px] leading-[1.35] text-slate-400">{item.description}</span>
                </button>
              )
            })}
          </aside>

          <Card className="grid gap-2.5 rounded-[14px] border-white/6 bg-[linear-gradient(180deg,rgba(10,16,28,0.96),rgba(8,13,23,0.98))] p-3 shadow-none">
            <div className="grid gap-0.5">
              <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-white">
                {sectionMeta.find((item) => item.key === activeSection)?.title}
              </h2>
              <p className="text-[12px] leading-[1.45] text-slate-300">
                {activeSection === 'cloud'
                  ? '在这里统一管理语言、API 基地址、默认脚本数、本地输出目录与云存储参数。'
                  : '按工作台主链路显式配置供应商、Host、API Key 与模型名称，不做隐藏回退。'}
              </p>
            </div>

            {activeSection === 'cloud' ? (
              <GeneralSection
                settings={settings}
                setSettings={setSettings}
                cloud={settings.modelConfig.cloud}
                onChangeCloud={(next) =>
                  setSettings((current) => ({
                    ...current,
                    modelConfig: {
                      ...current.modelConfig,
                      cloud: next,
                    },
                  }))
                }
                visibleSecrets={visibleSecrets}
                toggleSecret={toggleSecret}
              />
            ) : (
              <ModelSectionForm
                value={section as ModelSection}
                onChange={(next) => updateSection(activeSection, next)}
                visibleSecrets={visibleSecrets}
                toggleSecret={toggleSecret}
              />
            )}
          </Card>

          <aside className="grid auto-rows-min gap-1.5">
            <Card className="grid gap-2 rounded-[14px] border-white/6 bg-[linear-gradient(180deg,rgba(10,16,28,0.96),rgba(8,13,23,0.98))] p-3 shadow-none">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-white">说明与边界</h2>
                <Info className="h-3.5 w-3.5 text-slate-500" />
              </div>

              <InfoBlock title="模型配置" body="保留视频、图片、对话、云存储四组入口，字段语义与桌面端保持一致。" />
              <InfoBlock title="保存方式" body="当前 Web 端仅写入浏览器本地存储，不额外扩展后端设置接口。" />

              <div className="rounded-[11px] border border-white/6 bg-[rgba(255,255,255,0.02)] p-2.5">
                <div className="grid gap-1">
                  <strong className="text-[12px] font-semibold text-white">配置指引</strong>
                  <p className="text-[11px] leading-[1.45] text-slate-400">如需核对字段用途，可结合设置中心需求文档与桌面端设置页语义一起查看。</p>
                  <Button variant="secondary" className="mt-0.5 h-7 w-fit rounded-[9px] border-white/10 bg-white/[0.03] px-3 text-[11px]">
                    查看配置说明
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="grid gap-1.5 rounded-[14px] border-white/6 bg-[linear-gradient(180deg,rgba(10,16,28,0.96),rgba(8,13,23,0.98))] p-3 shadow-none">
              <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-white">最近状态</h2>
              <div className="rounded-[11px] border border-white/6 bg-[rgba(255,255,255,0.02)] p-2.5">
                <div className="grid gap-1">
                  <strong className="text-[12px] font-semibold text-white">保存结果</strong>
                  <span className="text-[11px] leading-[1.45] text-slate-400">
                    {savedAt ? `最近保存时间：${savedAt}` : '当前仍处于编辑态，保存后会写入浏览器本地存储。'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="rounded-[11px] border border-white/6 bg-[rgba(255,255,255,0.02)] px-3 py-2 text-left transition hover:border-violet-400/30 hover:bg-white/[0.03]"
                onClick={() => setSettings(readAppSettings())}
              >
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新读取本地配置
                </div>
                <span className="mt-1 block text-[11px] leading-5 text-slate-400">如果浏览器本地已有旧值，可在这里重新载入。</span>
              </button>
            </Card>
          </aside>
        </section>
      </div>
    </AppShell>
  )
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid gap-0.5 border-b border-white/6 pb-2 last:border-b-0 last:pb-0">
      <strong className="text-[12px] font-semibold text-white">{title}</strong>
      <p className="text-[11px] leading-[1.45] text-slate-300">{body}</p>
    </div>
  )
}

function FormLabel({ title }: { title: string }) {
  return <span className="text-[11px] font-medium text-white">{title}</span>
}

function BaseInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={`h-9 rounded-[10px] border-white/10 bg-[#101a2c] px-3 text-[12px] text-white placeholder:text-slate-500 ${props.className ?? ''}`}
    />
  )
}

function BaseSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
}) {
  return (
    <select
      className="h-9 rounded-[10px] border border-white/10 bg-[#101a2c] px-3 text-[12px] text-white outline-none"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  )
}

function SecretField({
  value,
  placeholder,
  visible,
  onToggle,
  onChange,
}: {
  value: string
  placeholder: string
  visible: boolean
  onToggle: () => void
  onChange: (next: string) => void
}) {
  return (
    <div className="relative">
      <BaseInput
        type={visible ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 grid -translate-y-1/2 place-items-center text-slate-400 transition hover:text-white"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function ModelSectionForm({
  value,
  onChange,
  visibleSecrets,
  toggleSecret,
}: {
  value: ModelSection
  onChange: (next: ModelSection) => void
  visibleSecrets: Record<string, boolean>
  toggleSecret: (key: string) => void
}) {
  const secretKey = `${value.provider}-${value.model}-api-key`

  return (
    <div className="grid gap-2">
      <div className="grid gap-1.5 md:grid-cols-2">
        <label className="grid gap-1">
          <FormLabel title="供应商" />
          <BaseSelect value={value.provider} onChange={(next) => onChange({ ...value, provider: next })} options={providerOptions} />
        </label>

        <label className="grid gap-1">
          <FormLabel title="模型名称" />
          <BaseInput value={value.model} onChange={(event) => onChange({ ...value, model: event.target.value })} />
        </label>
      </div>

      <label className="grid gap-1">
        <FormLabel title="Host / Base URL" />
        <BaseInput value={value.host} placeholder="例如 https://api.example.com/v1" onChange={(event) => onChange({ ...value, host: event.target.value })} />
      </label>

      <label className="grid gap-1">
        <FormLabel title="API Key" />
        <SecretField
          value={value.apiKey}
          visible={Boolean(visibleSecrets[secretKey])}
          onToggle={() => toggleSecret(secretKey)}
          onChange={(next) => onChange({ ...value, apiKey: next })}
          placeholder="填入当前链路使用的 API Key"
        />
      </label>

      <div className="flex items-center gap-1.5 text-[11px] leading-[1.45] text-slate-400">
        <Server className="h-3.5 w-3.5" />
        API Key 仅保存在当前浏览器本地存储中，不会直接上传到任何服务端。
      </div>
    </div>
  )
}

function GeneralSection({
  settings,
  setSettings,
  cloud,
  onChangeCloud,
  visibleSecrets,
  toggleSecret,
}: {
  settings: AppSettings
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>
  cloud: CloudStorageConfig
  onChangeCloud: (next: CloudStorageConfig) => void
  visibleSecrets: Record<string, boolean>
  toggleSecret: (key: string) => void
}) {
  return (
    <div className="grid gap-2.5">
      <div className="grid gap-2">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(103,83,255,0.24),rgba(91,68,255,0.1))] text-violet-300">
            <Settings2 className="h-3.5 w-3.5" />
          </div>
          <div className="grid gap-0.5">
            <strong className="text-[13px] font-semibold text-white">工作台基础参数</strong>
            <span className="text-[11px] leading-[1.45] text-slate-400">接口地址、默认语言、脚本数量与输出目录统一在这里管理。</span>
          </div>
        </div>

        <div className="grid gap-1.5 md:grid-cols-2">
          <label className="grid gap-1 md:col-span-2">
            <FormLabel title="API 基地址" />
            <BaseInput
              value={settings.apiBaseUrl}
              placeholder="可留空，沿用默认地址"
              onChange={(event) => setSettings((current) => ({ ...current, apiBaseUrl: event.target.value }))}
            />
          </label>

          <label className="grid gap-1">
            <FormLabel title="默认语言" />
            <BaseInput value={settings.locale} onChange={(event) => setSettings((current) => ({ ...current, locale: event.target.value }))} />
          </label>

          <label className="grid gap-1">
            <FormLabel title="默认脚本数量" />
            <BaseInput
              value={settings.defaultVariantCount}
              onChange={(event) => setSettings((current) => ({ ...current, defaultVariantCount: event.target.value }))}
            />
          </label>

          <label className="grid gap-1 md:col-span-2">
            <FormLabel title="默认输出目录" />
            <BaseInput
              value={settings.defaultOutputDir}
              placeholder="桌面端导出时可作为默认提示目录"
              onChange={(event) => setSettings((current) => ({ ...current, defaultOutputDir: event.target.value }))}
            />
          </label>
        </div>
      </div>

      <div className="grid gap-2 rounded-[12px] border border-white/6 bg-[rgba(255,255,255,0.02)] p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(103,83,255,0.24),rgba(91,68,255,0.1))] text-violet-300">
            <Cloud className="h-3.5 w-3.5" />
          </div>
          <div className="grid gap-0.5">
            <strong className="text-[13px] font-semibold text-white">云存储</strong>
            <span className="text-[11px] leading-[1.45] text-slate-400">管理素材上传、访问域名与交付资源前缀。</span>
          </div>
        </div>

        <div className="grid gap-1.5 md:grid-cols-2">
          <label className="grid gap-1">
            <FormLabel title="存储供应商" />
            <BaseInput value={cloud.provider} onChange={(event) => onChangeCloud({ ...cloud, provider: event.target.value })} />
          </label>
          <label className="grid gap-1">
            <FormLabel title="Bucket" />
            <BaseInput value={cloud.bucket} onChange={(event) => onChangeCloud({ ...cloud, bucket: event.target.value })} />
          </label>
          <label className="grid gap-1">
            <FormLabel title="访问域名" />
            <BaseInput value={cloud.domain} onChange={(event) => onChangeCloud({ ...cloud, domain: event.target.value })} />
          </label>
          <label className="grid gap-1">
            <FormLabel title="上传 Host" />
            <BaseInput value={cloud.uploadHost} onChange={(event) => onChangeCloud({ ...cloud, uploadHost: event.target.value })} />
          </label>
          <label className="grid gap-1 md:col-span-2">
            <FormLabel title="资源前缀" />
            <BaseInput
              value={cloud.prefix}
              placeholder="例如 videogenerate/prod/"
              onChange={(event) => onChangeCloud({ ...cloud, prefix: event.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <FormLabel title="Access Key" />
            <SecretField
              value={cloud.accessKey}
              visible={Boolean(visibleSecrets.cloudAccessKey)}
              onToggle={() => toggleSecret('cloudAccessKey')}
              onChange={(next) => onChangeCloud({ ...cloud, accessKey: next })}
              placeholder="输入 Access Key"
            />
          </label>
          <label className="grid gap-1">
            <FormLabel title="Secret Key" />
            <SecretField
              value={cloud.secretKey}
              visible={Boolean(visibleSecrets.cloudSecretKey)}
              onToggle={() => toggleSecret('cloudSecretKey')}
              onChange={(next) => onChangeCloud({ ...cloud, secretKey: next })}
              placeholder="输入 Secret Key"
            />
          </label>
        </div>
      </div>
    </div>
  )
}
