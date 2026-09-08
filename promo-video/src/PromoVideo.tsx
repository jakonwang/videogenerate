import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const colors = {
  ink: '#070a12',
  panel: '#101522',
  purple: '#6d4aff',
  violet: '#9c7bff',
  teal: '#12c6b0',
  white: '#f6f7fb',
  muted: '#9ba5ba',
}

const ease = Easing.bezier(0.16, 1, 0.3, 1)

const sceneFade = (frame: number, duration: number) => interpolate(
  frame,
  [0, 14, duration - 14, duration],
  [0, 1, 1, 0],
  {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease},
)

function Background() {
  const frame = useCurrentFrame()
  const drift = interpolate(frame, [0, 1440], [0, 90])
  return (
    <AbsoluteFill style={{ backgroundColor: colors.ink, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: -260,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          transform: `translate(${drift * -0.25}px, ${drift * 0.18}px)`,
          opacity: 0.45,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 820,
          height: 820,
          borderRadius: '50%',
          right: -300 + drift,
          top: -390,
          background: `radial-gradient(circle, ${colors.purple}55 0%, transparent 68%)`,
          filter: 'blur(30px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 760,
          height: 760,
          borderRadius: '50%',
          left: -360 - drift * 0.5,
          bottom: -420,
          background: `radial-gradient(circle, ${colors.teal}33 0%, transparent 68%)`,
          filter: 'blur(34px)',
        }}
      />
    </AbsoluteFill>
  )
}

function Wordmark({small = false}: {small?: boolean}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: small ? 12 : 18 }}>
      <Img
        src={staticFile('brand.png')}
        style={{ width: small ? 48 : 90, height: small ? 48 : 90, borderRadius: small ? 14 : 26 }}
      />
      <div>
        <div style={{ color: colors.white, fontSize: small ? 24 : 46, fontWeight: 760, letterSpacing: -1.2 }}>
          VideoGenerate
        </div>
        <div style={{ color: colors.muted, fontSize: small ? 11 : 17, letterSpacing: small ? 2.3 : 4.2, marginTop: small ? 2 : 7 }}>
          AI EDITING SUITE
        </div>
      </div>
    </div>
  )
}

function Kicker({children}: {children: React.ReactNode}) {
  return (
    <div style={{ color: colors.teal, fontSize: 18, fontWeight: 700, letterSpacing: 3.4, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

function Headline({children, accent}: {children: React.ReactNode; accent?: React.ReactNode}) {
  return (
    <div style={{ color: colors.white, fontSize: 72, lineHeight: 1.08, fontWeight: 760, letterSpacing: -3.2 }}>
      {children}
      {accent ? <span style={{ color: colors.violet }}>{accent}</span> : null}
    </div>
  )
}

function Caption({children}: {children: React.ReactNode}) {
  return <div style={{ color: colors.muted, fontSize: 24, lineHeight: 1.55, marginTop: 22, maxWidth: 680 }}>{children}</div>
}

function Metric({value, label}: {value: string; label: string}) {
  return (
    <div style={{ borderLeft: `1px solid ${colors.teal}77`, paddingLeft: 18, minWidth: 160 }}>
      <div style={{ color: colors.white, fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ color: colors.muted, fontSize: 14, marginTop: 5 }}>{label}</div>
    </div>
  )
}

function ScreenshotCard({src, progress, rotate = 0}: {src: string; progress: number; rotate?: number}) {
  const scale = interpolate(progress, [0, 1], [1.04, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease})
  const y = interpolate(progress, [0, 1], [48, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease})
  return (
    <div style={{ transform: `translateY(${y}px) rotate(${rotate}deg) scale(${scale})`, transformOrigin: 'center center' }}>
      <div style={{ position: 'absolute', inset: -1, borderRadius: 26, padding: 1, background: `linear-gradient(135deg, ${colors.teal}, ${colors.purple})`, opacity: 0.72 }} />
      <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', backgroundColor: colors.panel, boxShadow: '0 34px 100px rgba(0,0,0,0.55)' }}>
        <Img src={staticFile(src)} style={{ display: 'block', width: 980, height: 620, objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(7,10,18,0.35))' }} />
      </div>
    </div>
  )
}

function Intro() {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const enter = spring({frame, fps, config: {damping: 22, stiffness: 90}})
  const opacity = interpolate(frame, [0, 24, 92, 130], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease})
  return (
    <AbsoluteFill style={{ opacity, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `translateY(${interpolate(enter, [0, 1], [45, 0])}px)`, textAlign: 'center' }}>
        <Wordmark />
        <div style={{ marginTop: 46, color: colors.white, fontSize: 36, fontWeight: 500, letterSpacing: 5 }}>让每一次创作，都更接近完成</div>
        <div style={{ marginTop: 22, color: colors.teal, fontSize: 18, letterSpacing: 4 }}>A NEW OPERATING SYSTEM FOR CREATIVE WORK</div>
      </div>
    </AbsoluteFill>
  )
}

function CommandCenter() {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const reveal = spring({frame, fps, config: {damping: 22, stiffness: 78}})
  const imageProgress = interpolate(frame, [16, 120], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease})
  return (
    <AbsoluteFill style={{ padding: '150px 100px', boxSizing: 'border-box', display: 'flex', flexDirection: 'row', gap: 80, opacity: sceneFade(frame, 300) }}>
      <div style={{ width: 560, paddingTop: 48, transform: `translateX(${interpolate(reveal, [0, 1], [-70, 0])}px)`, opacity: reveal }}>
        <Kicker>01 / Command Center</Kicker>
        <div style={{ marginTop: 18 }}><Headline>一个懂业务的<br/><span style={{ color: colors.teal }}>AI 工作中枢</span></Headline></div>
        <Caption>从一句目标开始，Hermes 自动理解任务、拆解计划、调度员工，并把每一步结果沉淀为可追踪的产物。</Caption>
        <div style={{ display: 'flex', gap: 34, marginTop: 42 }}><Metric value="1→N" label="一条指令，多位员工协同" /><Metric value="24/7" label="后台任务持续运行" /></div>
      </div>
      <div style={{ position: 'relative', width: 980, height: 620, marginTop: 34, opacity: imageProgress }}><ScreenshotCard src="home-command.png" progress={imageProgress} rotate={-1.2} /></div>
    </AbsoluteFill>
  )
}

function Execution() {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const reveal = spring({frame, fps, config: {damping: 23, stiffness: 84}})
  const imageProgress = interpolate(frame, [10, 115], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease})
  return (
    <AbsoluteFill style={{ padding: '140px 100px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', opacity: sceneFade(frame, 300) }}>
      <div style={{ opacity: reveal, transform: `translateY(${interpolate(reveal, [0, 1], [35, 0])}px)` }}>
        <Kicker>02 / Visible Intelligence</Kicker>
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Headline>计划、执行、审核，<span style={{ color: colors.violet }}>全程可见</span></Headline>
          <div style={{ color: colors.muted, fontSize: 20, width: 330, lineHeight: 1.5, paddingBottom: 8 }}>每个运行都有版本、事件时间线、审批节点和产物来源链。</div>
        </div>
      </div>
      <div style={{ position: 'relative', width: 1200, height: 650, alignSelf: 'center', marginTop: 44, opacity: imageProgress }}><ScreenshotCard src="run-timeline.png" progress={imageProgress} rotate={0.7} /></div>
    </AbsoluteFill>
  )
}

function Production() {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const reveal = spring({frame, fps, config: {damping: 21, stiffness: 82}})
  const p = interpolate(frame, [10, 100], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease})
  return (
    <AbsoluteFill style={{ padding: '145px 100px', boxSizing: 'border-box', display: 'flex', flexDirection: 'row', gap: 50, opacity: sceneFade(frame, 300) }}>
      <div style={{ width: 560, paddingTop: 60, opacity: reveal, transform: `translateX(${interpolate(reveal, [0, 1], [-45, 0])}px)` }}>
        <Kicker>03 / Production Pipeline</Kicker>
        <div style={{ marginTop: 18 }}><Headline>把复杂工作，<br/><span style={{ color: colors.teal }}>交给会做事的 AI</span></Headline></div>
        <Caption>素材准备、复刻生成、动态照片、字幕包装、批量发布，统一在一个工作台里完成。</Caption>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 34, maxWidth: 390 }}>
          {['素材准备', '视频复刻', 'Live Photo', '字幕包装', '批量发布'].map((item, index) => <div key={item} style={{ color: colors.white, border: `1px solid ${index === 2 ? colors.teal : '#293247'}`, background: index === 2 ? `${colors.teal}22` : '#121a2a', borderRadius: 100, padding: '9px 16px', fontSize: 15 }}>{item}</div>)}
        </div>
      </div>
      <div style={{ position: 'relative', width: 980, height: 620, marginTop: 20, opacity: p }}><ScreenshotCard src="live-photo.png" progress={p} rotate={1.1} /></div>
    </AbsoluteFill>
  )
}

function Settings() {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const reveal = spring({frame, fps, config: {damping: 22, stiffness: 80}})
  const p = interpolate(frame, [10, 110], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease})
  return (
    <AbsoluteFill style={{ padding: '140px 100px', boxSizing: 'border-box', display: 'flex', flexDirection: 'row', gap: 20, opacity: sceneFade(frame, 270) }}>
      <div style={{ width: 680, paddingTop: 44, opacity: reveal, transform: `translateX(${interpolate(reveal, [0, 1], [-52, 0])}px)` }}>
        <Kicker>04 / Control Everything</Kicker>
        <div style={{ marginTop: 18 }}><Headline>模型、技能、渠道、<br/><span style={{ color: colors.violet }}>存储，都在应用内</span></Headline></div>
        <Caption>无需跳转外部工具。权限、密钥、主题、运行时和数据生命周期，都有清晰的管理边界。</Caption>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 38 }}><div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: colors.teal, boxShadow: `0 0 24px ${colors.teal}` }} /><span style={{ color: colors.white, fontSize: 18 }}>你的数据，由你掌控</span></div>
      </div>
      <div style={{ position: 'relative', width: 980, height: 620, marginTop: 20, opacity: p }}><ScreenshotCard src="settings.png" progress={p} rotate={-0.8} /></div>
    </AbsoluteFill>
  )
}

function Finale() {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const reveal = spring({frame, fps, config: {damping: 24, stiffness: 70}})
  const glow = interpolate(frame, [0, 160], [0.3, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ position: 'absolute', width: 720, height: 720, borderRadius: '50%', background: `radial-gradient(circle, ${colors.purple}${Math.round(glow * 95).toString(16).padStart(2, '0')} 0%, transparent 68%)`, filter: 'blur(16px)' }} />
      <div style={{ position: 'relative', transform: `translateY(${interpolate(reveal, [0, 1], [44, 0])}px)`, opacity: reveal }}>
        <Wordmark />
        <div style={{ width: 700, height: 1, background: `linear-gradient(90deg, transparent, ${colors.teal}, transparent)`, margin: '44px auto 34px' }} />
        <div style={{ color: colors.white, fontSize: 34, fontWeight: 500, letterSpacing: 5 }}>让创意流动起来</div>
        <div style={{ color: colors.muted, fontSize: 18, letterSpacing: 3.2, marginTop: 22 }}>CREATE WITH CLARITY. SHIP WITH CONFIDENCE.</div>
        <div style={{ marginTop: 42, color: colors.teal, fontSize: 16, letterSpacing: 2 }}>videogenerate.app</div>
      </div>
    </AbsoluteFill>
  )
}

export const PromoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif' }}>
      <Background />
      <Sequence from={0} durationInFrames={150}><Intro /></Sequence>
      <Sequence from={150} durationInFrames={300}><CommandCenter /></Sequence>
      <Sequence from={450} durationInFrames={300}><Execution /></Sequence>
      <Sequence from={750} durationInFrames={300}><Production /></Sequence>
      <Sequence from={1050} durationInFrames={270}><Settings /></Sequence>
      <Sequence from={1320} durationInFrames={120}><Finale /></Sequence>
      <Audio src={staticFile('ambient.mp3')} volume={0.22} />
    </AbsoluteFill>
  )
}
