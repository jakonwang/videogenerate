'use client'

import { useState } from 'react'

import { formatFen } from '@shared/cloud/client'

type Point = { date: string; fen: number; count: number }

/** 近 N 天收入柱状图：单系列、主题色、悬停显示当天金额与笔数 */
export function RevenueChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 640
  const height = 180
  const pad = { top: 12, right: 8, bottom: 22, left: 44 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const max = Math.max(...data.map((d) => d.fen), 0)
  // 纵轴取整到「好看」的刻度
  const step = max <= 0 ? 10000 : Math.pow(10, Math.floor(Math.log10(max / 100))) * 100
  const top = max <= 0 ? 10000 : Math.ceil(max / step) * step
  const ticks = [0, top / 2, top]
  const slot = plotW / data.length
  const barW = Math.max(6, Math.min(28, slot - 6))
  const total = data.reduce((s, d) => s + d.fen, 0)
  const active = hover === null ? null : data[hover]

  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline gap-3">
        <span className="text-[22px] font-extrabold tabular-nums">{formatFen(total)}</span>
        <span className="vg-muted text-[12px]">近 {data.length} 天合计 · {data.reduce((s, d) => s + d.count, 0)} 笔</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-[180px] w-full" role="img" aria-label="近 14 天每日收入柱状图" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const y = pad.top + plotH - (t / top) * plotH
          return (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="var(--theme-divider)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill="var(--theme-text-muted)">
                {t === 0 ? '0' : `¥${t / 100 >= 1000 ? `${(t / 100000).toFixed(1)}k` : Math.round(t / 100)}`}
              </text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const h = top > 0 ? (d.fen / top) * plotH : 0
          const x = pad.left + i * slot + (slot - barW) / 2
          const y = pad.top + plotH - h
          const r = Math.min(4, h)
          const isActive = hover === i
          const isToday = i === data.length - 1
          return (
            <g key={d.date}>
              {/* 命中区域比柱子大，方便悬停 */}
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill={isActive ? 'var(--theme-panel-soft)' : 'transparent'} onMouseEnter={() => setHover(i)} />
              {h > 0 ? (
                <path
                  d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`}
                  fill="var(--theme-accent)"
                  opacity={hover === null || isActive ? 1 : 0.45}
                  pointerEvents="none"
                />
              ) : null}
              {i % 2 === (data.length - 1) % 2 ? (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize={10} fill={isToday ? 'var(--theme-text)' : 'var(--theme-text-muted)'} pointerEvents="none">
                  {isToday ? '今天' : d.date}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {active && hover !== null ? (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-[var(--theme-border-control)] bg-[var(--theme-panel)] px-3 py-2 text-[12px] shadow-[var(--theme-shadow-float)]"
          style={{ left: `${((pad.left + hover * slot + slot / 2) / width) * 100}%`, top: 36, transform: 'translateX(-50%)' }}
        >
          <div className="vg-muted">{hover === data.length - 1 ? '今天' : active.date}</div>
          <div className="font-bold tabular-nums text-[var(--theme-text)]">{formatFen(active.fen)}</div>
          <div className="vg-muted">{active.count} 笔订单</div>
        </div>
      ) : null}
    </div>
  )
}
