import React from 'react'
import { AbsoluteFill, Composition, registerRoot } from 'remotion'

export type RemotionSubtitleRun = {
  text: string
  kind: 'text' | 'emoji'
}

export type RemotionSubtitleLine = {
  text: string
  runs?: RemotionSubtitleRun[]
  secondary?: boolean
}

export type RemotionSubtitleProps = {
  width: number
  height: number
  lines: RemotionSubtitleLine[]
  fontFamily: string
  fontSize: number
  fontColor: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  position: 'top' | 'center' | 'bottom'
  safeMargin: number
  textAlign: 'left' | 'center' | 'right'
  lineGap: number
  maxWidthRatio: number
  bottomMargin: number
  embeddedFontFamily?: string
  embeddedFontDataUri?: string | null
  emojiMap?: Record<string, string>
}

const compositionId = 'BatchSubtitleOverlay'

const resolveJustify = (textAlign: RemotionSubtitleProps['textAlign']) => {
  if (textAlign === 'left') return 'flex-start'
  if (textAlign === 'right') return 'flex-end'
  return 'center'
}

const resolveVertical = (position: RemotionSubtitleProps['position']) => {
  if (position === 'top') return 'flex-start'
  if (position === 'center') return 'center'
  return 'flex-end'
}

const SubtitleOverlay: React.FC<RemotionSubtitleProps> = ({
  lines,
  fontFamily,
  fontSize,
  fontColor,
  strokeColor,
  strokeWidth,
  shadowColor,
  shadowBlur,
  position,
  safeMargin,
  textAlign,
  lineGap,
  maxWidthRatio,
  bottomMargin,
  embeddedFontFamily,
  embeddedFontDataUri,
  emojiMap,
}) => {
  const justifyContent = resolveVertical(position)
  const alignItems = resolveJustify(textAlign)
  const safePadding = Math.max(32, safeMargin * 8)
  const insetBottom = position === 'bottom' ? Math.max(safePadding, bottomMargin) : safePadding
  const width = `${Math.max(0.4, Math.min(0.92, maxWidthRatio || 0.72)) * 100}%`
  const activeFontFamily = embeddedFontFamily || fontFamily

  return (
    <AbsoluteFill
      style={{
        backgroundColor: 'transparent',
        justifyContent,
        alignItems,
        paddingTop: safePadding,
        paddingLeft: safePadding,
        paddingRight: safePadding,
        paddingBottom: insetBottom,
        boxSizing: 'border-box',
      }}
    >
      {embeddedFontDataUri ? (
        <style>
          {`@font-face {
            font-family: '${activeFontFamily}';
            src: url('${embeddedFontDataUri}') format('opentype');
            font-weight: 400 900;
            font-style: normal;
          }`}
        </style>
      ) : null}
      <div
        style={{
          width,
          display: 'flex',
          flexDirection: 'column',
          gap: Math.max(4, lineGap || 8),
          alignItems,
        }}
      >
        {lines.map((line, index) => {
          const currentFontSize = line.secondary ? Math.round(fontSize * 0.74) : fontSize
          return (
            <div
              key={`${line.text}-${index}`}
              style={{
                color: fontColor,
                fontFamily: activeFontFamily,
                fontSize: currentFontSize,
                fontWeight: 800,
                fontStyle: 'normal',
                fontSynthesis: 'none',
                lineHeight: 1.12,
                textAlign,
                textShadow: `0 6px ${Math.max(0, shadowBlur || 0)}px ${shadowColor}`,
                WebkitTextStroke: `${Math.max(0, strokeWidth || 0)}px ${strokeColor}`,
                paintOrder: 'stroke fill',
                wordBreak: 'break-word',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  flexWrap: 'wrap',
                  gap: 0,
                  justifyContent:
                    textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
                }}
              >
                {(line.runs?.length ? line.runs : [{ text: line.text, kind: 'text' as const }]).map((run, runIndex) => {
                  if (run.kind === 'emoji') {
                    const emojiUri = emojiMap?.[run.text]
                    if (emojiUri) {
                      const emojiSize = Math.round(currentFontSize * 1.06)
                      return (
                        <img
                          key={`${run.text}-${runIndex}`}
                          src={emojiUri}
                          alt={run.text}
                          style={{
                            width: emojiSize,
                            height: emojiSize,
                            objectFit: 'contain',
                            transform: 'translateY(0.09em)',
                            display: 'inline-block',
                          }}
                        />
                      )
                    }
                  }
                  return <span key={`${run.text}-${runIndex}`}>{run.text}</span>
                })}
              </span>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

const Root: React.FC = () => {
  return (
    <Composition
      id={compositionId}
      component={SubtitleOverlay}
      width={1080}
      height={1920}
      durationInFrames={1}
      fps={30}
      defaultProps={{
        width: 1080,
        height: 1920,
        lines: [{ text: '字幕预览' }],
        fontFamily: 'Noto Sans SC',
        fontSize: 72,
        fontColor: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 6,
        shadowColor: '#000000',
        shadowBlur: 12,
        position: 'bottom',
        safeMargin: 12,
        textAlign: 'center',
        lineGap: 8,
        maxWidthRatio: 0.72,
        bottomMargin: 220,
        embeddedFontFamily: 'Noto Sans SC',
        embeddedFontDataUri: null,
        emojiMap: {},
      }}
    />
  )
}

registerRoot(Root)

export { compositionId }
