'use client'

/**
 * 软件设置里的 AI 部分：平台接入（卡片）、默认模型（全部下拉）、图生视频模型（系列 × 平台矩阵）。
 * 模型都从清单里选，不让管理员手填模型名；清单外的模型走「自定义」。
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Eye, EyeOff, Film, Plug, SlidersHorizontal } from 'lucide-react'

import {
  MANAGED_PLATFORM_KEYS,
  MANAGED_PLATFORM_LABELS,
  SECRET_MASK_PREFIX,
  type ManagedPlatformKey,
  type ManagedSecretField,
  type ManagedSoftwareSettings,
} from '@shared/cloud/managedSettings'
import { adminClient } from '@/lib/admin-client'
import { CHAT_MODEL_OPTIONS, IMAGE_MODEL_OPTIONS, PLATFORM_DISPLAY_NAMES, type ModelOption } from '@shared/aiModels'
import { CAPABILITY_PLATFORM_OPTIONS, type PlatformProfile } from '@shared/platformSettings'
import {
  VIDEO_CATALOG_PLATFORM_LABELS,
  VIDEO_MODEL_CATALOG,
  resolveEnabledVideoModelIds,
  videoModelSeries,
  type VideoCatalogPlatform,
  type VideoModelSpec,
} from '@shared/videoModels'
import { AdminField, AdminPanel, AdminTag } from '@/components/admin/admin-ui'
import { Button, Input } from '@/components/admin/controls'
import { ModelSelect, type ModelSelectGroup } from '@/components/admin/model-select'

type SetForm = (next: ManagedSoftwareSettings) => void
const CAP_LABEL = { video: '视频', image: '图片', chat: '对话' } as const
const CATALOG_PLATFORMS: VideoCatalogPlatform[] = ['gaorui', 'xibapi', 'grsai']
const CUSTOM = '__custom__'

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

/**
 * 密钥输入框：显示掩码，聚焦时全选方便直接粘贴新值；保留掩码表示不修改。
 * 传了 field 时右侧有「显示 / 复制」：已保存的密钥向服务器取明文（仅超管，留痕），只在本框里显示，不改表单。
 */
export function SecretInput({ value, onChange, field }: { value: string; onChange: (v: string) => void; field?: ManagedSecretField }) {
  const masked = value.startsWith(SECRET_MASK_PREFIX)
  const [plain, setPlain] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // 表单值变了（保存后重新掩码、或换了新值），之前取到的明文作废
    setPlain(null)
    setShown(false)
  }, [value])

  const realValue = async () => {
    if (!masked) return value
    if (plain !== null) return plain
    if (!field) return ''
    setBusy(true)
    setError('')
    try {
      const { value: secret } = await adminClient.admin.revealSoftwareSecret(field)
      setPlain(secret)
      return secret
    } finally {
      setBusy(false)
    }
  }

  const toggle = async () => {
    if (shown) return setShown(false)
    try {
      await realValue()
      setShown(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const copy = async () => {
    try {
      const text = await realValue()
      if (!text) return
      await writeClipboard(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const input = (
    <Input
      value={shown && masked && plain !== null ? plain : value}
      placeholder="未设置"
      autoComplete="off"
      spellCheck={false}
      className="admin-mono"
      onFocus={(e) => masked && e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value)}
    />
  )
  if (!field) return input
  const empty = !value
  return (
    <div className="admin-secret" title={error || undefined}>
      {input}
      <span className="admin-secret__actions">
        <button type="button" className="admin-secret__btn" disabled={empty || busy} onClick={() => void toggle()} aria-label={shown ? '隐藏密钥' : '显示密钥'} title={shown ? '隐藏' : '显示'}>
          {shown ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button type="button" className={`admin-secret__btn${copied ? ' is-done' : ''}`} disabled={empty || busy} onClick={() => void copy()} aria-label="复制密钥" title={copied ? '已复制' : '复制'}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </span>
    </div>
  )
}

function hostOf(value: string, fallback: string) {
  const raw = String(value || fallback || '').trim()
  try {
    return new URL(raw).host
  } catch {
    return raw
  }
}

/* ------------------------------------------------------------------ 平台接入 */

export function PlatformSection({ form, setForm }: { form: ManagedSoftwareSettings; setForm: SetForm }) {
  const [editing, setEditing] = useState<string | null>(null)
  const setPlatform = (key: ManagedPlatformKey, field: 'apiKey' | 'baseUrl', value: string) =>
    setForm({ ...form, platforms: { ...form.platforms, [key]: { ...form.platforms[key], [field]: value } } })

  return (
    <AdminPanel icon={Plug} title="平台接入" subtitle="Key 只保存在服务器，用户电脑拿不到；显示为 •••• 表示已设置">
      <div className="ai-platforms">
        {MANAGED_PLATFORM_KEYS.map((key) => {
          const caps = CAPABILITY_PLATFORM_OPTIONS.find((item) => item.id === key)?.capabilities ?? []
          const configured = Boolean(form.platforms[key].apiKey)
          const open = editing === key
          return (
            <div key={key} className={`ai-platform${open ? ' is-open' : ''}`}>
              <div className="ai-platform__head">
                <b>{MANAGED_PLATFORM_LABELS[key].label}</b>
                {configured ? <AdminTag tone="success" dot>已接入</AdminTag> : <AdminTag dot>未接入</AdminTag>}
              </div>
              <div className="ai-platform__caps">
                {caps.map((cap) => (
                  <span key={cap}>{CAP_LABEL[cap]}</span>
                ))}
              </div>
              <div className="ai-platform__foot">
                <span className="admin-mono">{hostOf(form.platforms[key].baseUrl, MANAGED_PLATFORM_LABELS[key].hostPlaceholder)}</span>
                <Button variant="ghost" size="sm" onClick={() => setEditing(open ? null : key)}>
                  {open ? '收起' : configured ? '编辑' : '填写 Key'}
                </Button>
              </div>
              {open ? (
                <div className="ai-platform__form">
                  <AdminField label="API Key">
                    <SecretInput field={`platform.${key}`} value={form.platforms[key].apiKey} onChange={(v) => setPlatform(key, 'apiKey', v)} />
                  </AdminField>
                  <AdminField label="接口地址">
                    <Input value={form.platforms[key].baseUrl} placeholder={MANAGED_PLATFORM_LABELS[key].hostPlaceholder} onChange={(e) => setPlatform(key, 'baseUrl', e.target.value)} />
                  </AdminField>
                </div>
              ) : null}
            </div>
          )
        })}
        <div className={`ai-platform${editing === 'tikhub' ? ' is-open' : ''}`}>
          <div className="ai-platform__head">
            <b>TikHub</b>
            {form.tikhubApiKey ? <AdminTag tone="success" dot>已接入</AdminTag> : <AdminTag dot>未接入</AdminTag>}
          </div>
          <div className="ai-platform__caps">
            <span>链接解析</span>
          </div>
          <div className="ai-platform__foot">
            <span className="admin-mono">api.tikhub.io</span>
            <Button variant="ghost" size="sm" onClick={() => setEditing(editing === 'tikhub' ? null : 'tikhub')}>
              {editing === 'tikhub' ? '收起' : form.tikhubApiKey ? '编辑' : '填写 Key'}
            </Button>
          </div>
          {editing === 'tikhub' ? (
            <div className="ai-platform__form">
              <AdminField label="Bearer Token">
                <SecretInput field="tikhubApiKey" value={form.tikhubApiKey} onChange={(v) => setForm({ ...form, tikhubApiKey: v })} />
              </AdminField>
            </div>
          ) : null}
        </div>
      </div>
    </AdminPanel>
  )
}

/* ------------------------------------------------------------------ 默认模型 */

/** 「模型 · 平台」一个下拉选完；清单外的模型选「自定义模型名」后在右边填 */
function ModelPicker({
  form,
  options,
  platforms,
  value,
  onChange,
}: {
  form: ManagedSoftwareSettings
  options: ModelOption[]
  platforms: PlatformProfile[]
  value: { platform: PlatformProfile; model: string }
  onChange: (next: { platform: PlatformProfile; model: string }) => void
}) {
  // 只有「刚选了自定义、还没填名字」需要记状态；其余全由当前值推出来（空模型 = 平台默认模型）
  const [pickedCustom, setPickedCustom] = useState(false)
  const listed = !value.model || options.some((item) => item.platform === value.platform && item.model === value.model)
  const custom = pickedCustom || !listed
  const selectValue = custom ? `${value.platform}|${CUSTOM}` : `${value.platform}|${value.model}`
  const groups: ModelSelectGroup[] = platforms.map((platform) => ({
    key: platform,
    title: PLATFORM_DISPLAY_NAMES[platform],
    ready: Boolean(form.platforms[platform as ManagedPlatformKey]?.apiKey),
    items: [
      { value: `${platform}|`, label: '平台默认模型', kind: 'default' as const },
      ...options.filter((item) => item.platform === platform).map((item) => ({ value: `${platform}|${item.model}`, label: item.label, meta: item.model })),
      { value: `${platform}|${CUSTOM}`, label: '自定义模型名', kind: 'custom' as const },
    ],
  }))
  return (
    <>
      <ModelSelect
        className="ai-defaults__select"
        groups={groups}
        value={selectValue}
        onChange={(next) => {
          const [platform, model] = next.split('|') as [PlatformProfile, string]
          if (model === CUSTOM) {
            setPickedCustom(true)
            onChange({ platform, model: value.platform === platform && !listed ? value.model : '' })
            return
          }
          setPickedCustom(false)
          onChange({ platform, model })
        }}
      />
      {custom ? (
        <Input
          className="admin-mono ai-defaults__extra"
          value={value.model}
          placeholder="填写模型名"
          onChange={(e) => onChange({ platform: value.platform, model: e.target.value.trim() })}
        />
      ) : null}
    </>
  )
}

/** AI 复刻用的视频模型：高瑞 / 小扳手从清单选，GRS.AI / AI666 填模型名 */
function cloneVideoOptions(): ModelOption[] {
  return VIDEO_MODEL_CATALOG.filter((spec) => spec.platform === 'gaorui' || spec.platform === 'xibapi').map((spec) => ({
    platform: spec.platform,
    model: spec.model,
    label: spec.label,
  }))
}

export function DefaultModelsSection({ form, setForm }: { form: ManagedSoftwareSettings; setForm: SetForm }) {
  const caps = form.capabilities
  const setCap = <K extends keyof ManagedSoftwareSettings['capabilities']>(key: K, patch: Partial<ManagedSoftwareSettings['capabilities'][K]>) =>
    setForm({ ...form, capabilities: { ...caps, [key]: { ...caps[key], ...patch } } })
  const usableVideo = usableVideoModels(form)
  const videoCloneOptions = useMemo(cloneVideoOptions, [])

  return (
    <AdminPanel icon={SlidersHorizontal} title="默认模型" subtitle="都从清单里选；清单外的模型选「自定义模型名」">
      <div className="ai-defaults">
        <div className="ai-defaults__row">
        <span className="ai-defaults__label">图片生成</span>
        <ModelPicker
          form={form}
          options={IMAGE_MODEL_OPTIONS}
          platforms={['grsai', 'xibapi', 'gaorui', 'ai666']}
          value={{ platform: caps.image.platform, model: caps.image.model }}
          onChange={(next) => setCap('image', { platform: next.platform as typeof caps.image.platform, model: next.model })}
        />
        <div className="ai-seg" role="group" aria-label="图片质量">
          {(
            [
              ['high', '高质量'],
              ['medium', '中等'],
              ['low', '低'],
            ] as const
          ).map(([quality, text]) => (
            <button key={quality} type="button" className={caps.image.quality === quality ? 'is-on' : ''} onClick={() => setCap('image', { quality })}>
              {text}
            </button>
          ))}
        </div>
        </div>

        <div className="ai-defaults__row">
        <span className="ai-defaults__label">脚本分析 / 对话</span>
        <ModelPicker
          form={form}
          options={CHAT_MODEL_OPTIONS}
          platforms={['grsai', 'xibapi', 'gaorui', 'ai666']}
          value={{ platform: caps.chat.platform, model: caps.chat.model }}
          onChange={(next) => setCap('chat', { platform: next.platform as typeof caps.chat.platform, model: next.model })}
        />
        </div>

        <div className="ai-defaults__row">
        <span className="ai-defaults__label">AI 复刻视频</span>
        <ModelPicker
          form={form}
          options={videoCloneOptions}
          platforms={['gaorui', 'xibapi', 'grsai', 'ai666']}
          value={{ platform: caps.video.platform, model: caps.video.model }}
          onChange={(next) => setCap('video', { platform: next.platform, model: next.model })}
        />
        </div>

        <div className="ai-defaults__row">
        <span className="ai-defaults__label">图生视频</span>
        <ModelSelect
          className="ai-defaults__select"
          value={caps.video.defaultModelId}
          onChange={(next) => setCap('video', { defaultModelId: next })}
          emptyItem={{ value: '', label: '不指定（用户自己选）', kind: 'default' }}
          groups={CATALOG_PLATFORMS.map((platform) => ({
            key: platform,
            title: VIDEO_CATALOG_PLATFORM_LABELS[platform],
            ready: Boolean(form.platforms[platform].apiKey),
            items: usableVideo
              .filter((spec) => spec.platform === platform)
              .map((spec) => ({ value: spec.id, label: spec.label, meta: durationRange([spec]) })),
          })).filter((group) => group.items.length)}
        />
        <span className="ai-defaults__hint">用户每次生成时可以改</span>
        </div>
      </div>
    </AdminPanel>
  )
}

/* ------------------------------------------------------------------ 图生视频模型 */

function usableVideoModels(form: ManagedSoftwareSettings) {
  const enabled = new Set(resolveEnabledVideoModelIds(form.capabilities.video.modelSwitches))
  return VIDEO_MODEL_CATALOG.filter((spec) => enabled.has(spec.id) && Boolean(form.platforms[spec.platform].apiKey))
}

function durationRange(specs: VideoModelSpec[]) {
  const all = specs.flatMap((spec) => spec.durations)
  const min = Math.min(...all)
  const max = Math.max(...all)
  return min === max ? `${min} 秒` : `${min}–${max} 秒`
}

export function VideoModelMatrix({ form, setForm }: { form: ManagedSoftwareSettings; setForm: SetForm }) {
  const video = form.capabilities.video
  const enabled = new Set(resolveEnabledVideoModelIds(video.modelSwitches))
  const usable = usableVideoModels(form)
  const rows = useMemo(() => {
    const map = new Map<string, VideoModelSpec[]>()
    for (const spec of VIDEO_MODEL_CATALOG) {
      const { series } = videoModelSeries(spec)
      map.set(series, [...(map.get(series) ?? []), spec])
    }
    return [...map.entries()]
  }, [])

  const toggle = (spec: VideoModelSpec) => {
    const on = !enabled.has(spec.id)
    setForm({
      ...form,
      capabilities: {
        ...form.capabilities,
        video: {
          ...video,
          // 每次都写完整的开关表：后台点过之后，没点亮的模型一律算关闭
          modelSwitches: { ...Object.fromEntries(VIDEO_MODEL_CATALOG.map((item) => [item.id, enabled.has(item.id)])), [spec.id]: on },
          defaultModelId: !on && video.defaultModelId === spec.id ? '' : video.defaultModelId,
        },
      },
    })
  }

  return (
    <AdminPanel icon={Film} title="图生视频模型" subtitle={`点亮 = 开放给用户选择；平台已接入且点亮的模型才会出现在用户的下拉里（当前 ${usable.length} 个）`}>
      <div className="vg-table-wrap">
        <table className="vg-table ai-matrix">
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>模型</th>
              {CATALOG_PLATFORMS.map((platform) => (
                <th key={platform}>
                  <span className="ai-matrix__platform">
                    {VIDEO_CATALOG_PLATFORM_LABELS[platform]}
                    {form.platforms[platform].apiKey ? null : <small>未接入</small>}
                  </span>
                </th>
              ))}
              <th>时长 · 尾帧</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([series, specs]) => (
              <tr key={series}>
                <td>
                  <b>{series}</b>
                </td>
                {CATALOG_PLATFORMS.map((platform) => {
                  const cell = specs.filter((spec) => spec.platform === platform)
                  if (!cell.length) return <td key={platform} className="ai-matrix__none">—</td>
                  const keyed = Boolean(form.platforms[platform].apiKey)
                  return (
                    <td key={platform}>
                      <div className="ai-chips">
                        {cell.map((spec) => {
                          const on = enabled.has(spec.id)
                          return (
                            <button
                              key={spec.id}
                              type="button"
                              className={`ai-chip${on ? ' is-on' : ''}${keyed ? '' : ' is-idle'}`}
                              aria-pressed={on}
                              title={`${spec.model}${spec.note ? `\n${spec.note}` : ''}${keyed ? '' : '\n平台未接入，点亮后也不会给用户'}`}
                              onClick={() => toggle(spec)}
                            >
                              {videoModelSeries(spec).variant}
                              {video.defaultModelId === spec.id ? <em>默认</em> : null}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
                <td className="ai-matrix__spec">
                  {durationRange(specs)}
                  {specs.some((spec) => spec.lastFrame) ? ' · 支持' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPanel>
  )
}

