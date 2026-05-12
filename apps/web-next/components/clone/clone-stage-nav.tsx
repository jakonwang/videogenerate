import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

const STAGES = [
  'upload_analyze_script',
  'generate_script_variants',
  'generate_storyboard_grids',
  'generate_shot_videos',
  'compose_final_video',
] as const

const STAGE_META: Record<(typeof STAGES)[number], { short: string; title: string }> = {
  upload_analyze_script: { short: '01', title: '分析参考视频' },
  generate_script_variants: { short: '02', title: '脚本生成' },
  generate_storyboard_grids: { short: '03', title: '分镜图片' },
  generate_shot_videos: { short: '04', title: '分镜视频' },
  compose_final_video: { short: '05', title: '合成成片' },
}

function normalizeStage(step?: string) {
  if (step === 'select_script_variant') return 'generate_script_variants'
  if (step === 'review_replace_shots') return 'generate_shot_videos'
  if (step === 'export_final') return 'compose_final_video'
  if (STAGES.includes((step as (typeof STAGES)[number]) || 'upload_analyze_script')) {
    return step as (typeof STAGES)[number]
  }
  return 'upload_analyze_script'
}

export function CloneStageNav({
  currentStep,
  onStepChange,
}: {
  currentStep?: string
  onStepChange?: (step: (typeof STAGES)[number]) => void
}) {
  const normalized = normalizeStage(currentStep)
  const currentIndex = Math.max(STAGES.indexOf(normalized), 0)

  return (
    <div className="clone-stage-flow clone-stage-flow--top rounded-[22px] border border-white/8 bg-[rgba(10,18,32,0.56)] px-2 py-2.5">
      <div className="clone-stage-flow__rail gap-3">
        {STAGES.map((step, index) => {
          const meta = STAGE_META[step]
          const done = index < currentIndex
          const active = index === currentIndex

          return (
            <button
              key={step}
              type="button"
              onClick={() => onStepChange?.(step)}
              className={cn(
                'clone-stage-flow__item min-h-[72px] rounded-[20px] px-3 py-3',
                active && 'is-active',
                done && 'is-done',
                onStepChange && 'cursor-pointer',
              )}
            >
              <div className="clone-stage-flow__bubble h-10 w-10 rounded-[14px] text-[12px]">
                {done ? <Check className="h-4 w-4" /> : <span>{meta.short}</span>}
              </div>
              <div className="clone-stage-flow__copy">
                <strong className="text-[15px] font-semibold text-white">{meta.title}</strong>
              </div>
              {index < STAGES.length - 1 ? <i className="clone-stage-flow__connector" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
