'use client'

/**
 * 后台的模型选择器：按平台分组、可搜索、显示平台接入状态，替代原生 <select>。
 * 键盘：↑↓ 移动、Enter 选中、Esc 关闭；点外面关闭。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, PenLine, Search } from 'lucide-react'

export type ModelSelectItem = {
  value: string
  label: string
  /** 右侧的小字，例如模型 id、时长 */
  meta?: string
  /** 特殊项（平台默认 / 自定义）用弱一点的样式 */
  kind?: 'default' | 'custom'
}

export type ModelSelectGroup = {
  key: string
  title: string
  /** 平台接入状态：未接入的组会标灰提示 */
  ready?: boolean
  items: ModelSelectItem[]
}

/** 平台首字做的小色块，同一平台颜色固定 */
const PLATFORM_TONES: Record<string, string> = {
  grsai: 'ms-tone-a',
  gaorui: 'ms-tone-b',
  xibapi: 'ms-tone-c',
  ai666: 'ms-tone-d',
}

export function PlatformMark({ platform, title }: { platform: string; title: string }) {
  return <span className={`ms-mark ${PLATFORM_TONES[platform] ?? 'ms-tone-d'}`}>{title.slice(0, 1)}</span>
}

export function ModelSelect({
  groups,
  value,
  onChange,
  placeholder = '请选择',
  emptyItem,
  className = '',
}: {
  groups: ModelSelectGroup[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** 不属于任何平台的项（例如「不指定」），放在列表最上面 */
  emptyItem?: ModelSelectItem
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => {
    if (emptyItem && emptyItem.value === value) return { item: emptyItem, group: undefined as ModelSelectGroup | undefined }
    for (const group of groups) {
      const item = group.items.find((entry) => entry.value === value)
      if (item) return { item, group }
    }
    return undefined
  }, [groups, value, emptyItem])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (item: ModelSelectItem, group?: ModelSelectGroup) =>
      !q || [item.label, item.meta, group?.title].some((text) => String(text || '').toLowerCase().includes(q))
    return {
      empty: emptyItem && match(emptyItem) ? emptyItem : undefined,
      groups: groups.map((group) => ({ ...group, items: group.items.filter((item) => match(item, group)) })).filter((group) => group.items.length),
    }
  }, [groups, query, emptyItem])

  const flat = useMemo(() => [...(filtered.empty ? [filtered.empty] : []), ...filtered.groups.flatMap((group) => group.items)], [filtered])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    const index = flat.findIndex((item) => item.value === value)
    setActive(index >= 0 ? index : 0)
    requestAnimationFrame(() => searchRef.current?.focus())
    // 只在打开时定位一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (item: ModelSelectItem) => {
    onChange(item.value)
    setOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(flat.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (flat[active]) choose(flat[active])
    }
  }

  let index = -1
  const renderItem = (item: ModelSelectItem) => {
    index += 1
    const i = index
    const isSelected = item.value === value
    return (
      <button
        key={item.value}
        type="button"
        role="option"
        aria-selected={isSelected}
        data-index={i}
        className={`ms-item${i === active ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}${item.kind ? ` is-${item.kind}` : ''}`}
        onMouseEnter={() => setActive(i)}
        onClick={() => choose(item)}
      >
        <span className="ms-item__label">
          {item.kind === 'custom' ? <PenLine size={13} /> : null}
          {item.label}
        </span>
        {item.meta ? <span className="ms-item__meta">{item.meta}</span> : null}
        <span className="ms-item__check">{isSelected ? <Check size={14} /> : null}</span>
      </button>
    )
  }

  return (
    <div ref={rootRef} className={`ms ${open ? 'is-open' : ''} ${className}`} onKeyDown={onKeyDown}>
      <button type="button" className="ms-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {selected?.group ? <PlatformMark platform={selected.group.key} title={selected.group.title} /> : null}
        <span className="ms-trigger__text">
          <b>{selected ? selected.item.label : placeholder}</b>
          {selected?.group ? <small>{selected.group.title}</small> : null}
        </span>
        <ChevronDown size={15} className="ms-trigger__chev" />
      </button>
      {open ? (
        <div className="ms-panel" role="listbox">
          <label className="ms-search">
            <Search size={14} />
            <input ref={searchRef} value={query} placeholder="搜索模型或平台" onChange={(e) => { setQuery(e.target.value); setActive(0) }} />
          </label>
          <div ref={listRef} className="ms-list">
            {filtered.empty ? renderItem(filtered.empty) : null}
            {filtered.groups.map((group) => (
              <div key={group.key} className="ms-group">
                <div className="ms-group__head">
                  <PlatformMark platform={group.key} title={group.title} />
                  <span>{group.title}</span>
                  {group.ready === false ? <em>未接入</em> : null}
                </div>
                {group.items.map(renderItem)}
              </div>
            ))}
            {!flat.length ? <div className="ms-none">没有匹配的模型</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
