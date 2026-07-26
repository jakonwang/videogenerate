import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { agentOsService } from '../agent-os/service'
import { sanitizeHermesValue } from './eventSanitizer'
import type { AgentIntentType } from '../agent-os/types'
import { HERMES_WORKSPACE_IDS } from '../../../shared/hermesWorkspace'
import { dispatchHermesWorkspaceAction, listHermesWorkspaces } from './workspaceActions'
import { approveHermesPairing } from './pairing'
import { sendHermesMessage } from './messaging'

type McpRuntime = {
  port: number
  token: string
  url: string
}

let httpServer: ReturnType<typeof createServer> | null = null
let runtime: McpRuntime | null = null

const commonInput = {
  conversationId: z.string().optional().describe('VideoGenerate conversation identifier when provided by the application.'),
  employeeId: z.string().optional().describe('VideoGenerate employee identifier when provided by the application.'),
  waitForCompletion: z.boolean().optional().describe('Wait for the approved run to finish. Write operations return the pending approval by default.'),
  idempotencyKey: z.string().max(200).optional().describe('Stable caller key used to return the same business run after retries.'),
  request: z.string().optional().describe('The user objective for this operation.'),
  productId: z.string().optional().describe('Product identifier.'),
  productName: z.string().optional().describe('Product name when the identifier is unknown.'),
  quantity: z.number().int().min(1).max(20).optional().describe('Requested output quantity.'),
}

const modelIdentityProfileSchema = z.object({
  market: z.enum(['southeast_asia_female', 'global_female']).optional(),
  gender: z.enum(['female', 'male']).optional(),
  ageRange: z.enum(['18_24', '20_28', '25_32']).optional(),
  faceShape: z.enum(['oval', 'soft_round', 'defined']).optional(),
  hairStyle: z.enum(['dark_straight', 'dark_wavy', 'tied_back']).optional(),
  hairColor: z.enum(['dark_black', 'natural_brown']).optional(),
  skinTone: z.enum(['soft_warm', 'natural_warm', 'healthy_neutral']).optional(),
  bodyType: z.enum(['petite', 'slim', 'balanced']).optional(),
  outfitStyle: z.enum(['clean_minimal', 'casual_lifestyle', 'refined_commute']).optional(),
  mood: z.enum(['friendly_natural', 'calm_confident', 'bright_ugc']).optional(),
  sceneStyle: z.enum(['clean_studio', 'home_daylight', 'retail_lifestyle']).optional(),
  languageStyle: z.enum(['chinese_fluent', 'bilingual_soft_sell']).optional(),
  cameraPresence: z.enum(['tiktok_ugc', 'closeup_product_led', 'natural_social_commerce']).optional(),
  styleBias: z.enum(['wearing_focus', 'styling_focus', 'conversion_focus']).optional(),
}).strict()

const templateEditInput = {
  templateId: z.string().optional().describe('Existing template identifier for updates.'),
  templateName: z.string().max(200).optional().describe('Template name. Required when creating a template.'),
  structure: z.array(z.string().min(1).max(100)).min(1).max(20).optional().describe('Ordered production segment keys.'),
  segmentSyncMode: z.enum(['follow_product', 'fixed']).optional().describe('How template segments follow product buckets.'),
  durationMin: z.number().min(0.5).max(600).optional().describe('Minimum total duration in seconds.'),
  durationMax: z.number().min(0.5).max(600).optional().describe('Maximum total duration in seconds.'),
  skipStartSec: z.number().min(0).max(60).optional().describe('Seconds to skip from the start of source clips.'),
  segmentDurations: z.record(z.string(), z.object({
    min: z.number().min(0.1).max(600).optional(),
    max: z.number().min(0.1).max(600).optional(),
  }).strict()).optional().describe('Per-segment minimum and maximum duration settings.'),
  randomOrderMode: z.enum(['none', 'partial']).optional().describe('Whether later segments may be randomized.'),
  keepFirstCount: z.number().int().min(0).max(20).optional().describe('Leading segments preserved when partial randomization is enabled.'),
  transitionEnabled: z.boolean().optional(),
  transitionTypes: z.array(z.enum(['hardcut', 'fade', 'slideleft', 'slideright', 'pixelize', 'circlecrop', 'wipeup', 'squeezev', 'squeezeh'])).min(1).max(9).optional(),
  transitionDurationMin: z.number().min(0).max(10).optional(),
  transitionDurationMax: z.number().min(0).max(10).optional(),
  audioSource: z.enum(['keep', 'mute']).optional(),
  audioDuckingEnabled: z.boolean().optional(),
  audioDuckingAmountDb: z.number().min(0).max(60).optional(),
  subtitleEnabled: z.boolean().optional(),
  ttsEnabled: z.boolean().optional(),
  ttsVoice: z.string().max(100).optional(),
  ttsRate: z.string().max(20).optional(),
  ttsPitch: z.string().max(20).optional(),
  ttsMixVolume: z.number().min(0).max(1).optional(),
  ttsKeepOriginal: z.boolean().optional(),
  aspectUnifyMode: z.enum(['none', 'contain_pad', 'cover_crop']).optional(),
}

function textResult(value: unknown, isError = false) {
  return {
    isError,
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  }
}

function normalizedLimit(value: unknown, fallback = 30) {
  return Math.max(1, Math.min(100, Number(value || fallback) || fallback))
}

function matchesQuery(query: unknown, values: unknown[]) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return true
  return values.some((value) => String(value || '').toLowerCase().includes(needle))
}

function listResult<T>(items: T[], limit: unknown) {
  const count = normalizedLimit(limit)
  return textResult({ total: items.length, returned: Math.min(items.length, count), items: items.slice(0, count) })
}

function publicRunDetail(detail: Awaited<ReturnType<typeof agentOsService.getRun>>) {
  return {
    run: {
      id: detail.run.id,
      shortId: detail.run.shortId,
      status: detail.run.status,
      error: detail.run.error,
      warningCount: detail.run.warningCount,
    },
    steps: detail.steps.map((step) => ({
      id: step.id,
      title: step.title,
      status: step.status,
      error: step.error,
    })),
    artifacts: detail.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      name: artifact.name,
      localPath: artifact.localPath,
      metadata: sanitizeHermesValue(artifact.metadata),
    })),
    attempts: detail.attempts.map((attempt) => ({
      id: attempt.id,
      stepId: attempt.stepId,
      sequence: attempt.sequence,
      capabilityId: attempt.capabilityId,
      status: attempt.status,
      result: sanitizeHermesValue(attempt.result),
    })),
    recovery: detail.recovery,
  }
}

async function executeIntent(input: Record<string, unknown>, intentType: AgentIntentType, requireApproval: boolean) {
  const created = await agentOsService.createIntentRun({
    conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
    employeeId: typeof input.employeeId === 'string' ? input.employeeId : undefined,
    intentType,
    request: String(input.request || ''),
    stepInput: input,
    requireApproval,
    idempotencyKey: typeof input.idempotencyKey === 'string' ? input.idempotencyKey : undefined,
  })
  const shouldWait = input.waitForCompletion === true || (!requireApproval && input.waitForCompletion !== false)
  const detail = shouldWait
    ? await agentOsService.waitForRun(created.run.id)
    : await agentOsService.getRun(created.run.id)
  return textResult(publicRunDetail(detail), detail.run.status === 'failed' || detail.run.status === 'cancelled')
}

function createBusinessServer() {
  const server = new McpServer({ name: 'videogenerate', version: '1.0.0' }, { capabilities: { logging: {} } })

  server.registerTool('videogenerate_product_inspect', {
    title: 'Inspect product data',
    description: 'Read products and their available reference materials from VideoGenerate.',
    inputSchema: commonInput,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (input) => await executeIntent(input, 'Intent.ProductInspect', false))

  server.registerTool('videogenerate_product_save', {
    title: 'Create or update product',
    description: 'Create a VideoGenerate product or update approved product metadata and local reference images.',
    inputSchema: {
      ...commonInput,
      productName: z.string().optional().describe('Product name. Required when creating a product.'),
      productType: z.enum(['phone_case', 'earring', 'necklace', 'ring', 'bracelet', 'clothes', 'bag', 'shoes', 'toy', 'general']).optional().describe('Product category.'),
      storyboardTemplateType: z.enum(['general', 'jewelry', 'ecommerce_packaging', 'lifestyle_interaction']).optional().describe('Preferred storyboard family.'),
      remark: z.string().max(2_000).optional().describe('Product notes.'),
      imagePaths: z.array(z.string()).min(1).max(20).optional().describe('Absolute local reference image paths.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent(input, 'Intent.ProductSave', true))

  server.registerTool('videogenerate_product_analyze', {
    title: 'Refresh product analysis',
    description: 'Create an approved VideoGenerate run that refreshes structural analysis for an existing product.',
    inputSchema: {
      ...commonInput,
      productId: z.string().describe('Existing VideoGenerate product identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent(input, 'Intent.ProductAnalyze', true))

  server.registerTool('videogenerate_product_delete', {
    title: 'Delete product',
    description: 'Create an approved VideoGenerate run that deletes an existing product record.',
    inputSchema: {
      ...commonInput,
      productId: z.string().describe('Existing VideoGenerate product identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'delete' }, 'Intent.ProductManage', true))

  server.registerTool('videogenerate_material_prepare', {
    title: 'Prepare production materials',
    description: 'Create a reusable material batch from local source videos.',
    inputSchema: {
      ...commonInput,
      videoPaths: z.array(z.string()).min(1).describe('Absolute local video paths.'),
      category: z.string().optional().describe('Material category.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent(input, 'Intent.MaterialPrepare', true))

  server.registerTool('videogenerate_material_batch_retry', {
    title: 'Retry material batch',
    description: 'Create an approved VideoGenerate run that retries failed work in an existing material batch.',
    inputSchema: {
      ...commonInput,
      batchId: z.string().describe('Existing material batch identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'retry_batch' }, 'Intent.MaterialManage', true))

  server.registerTool('videogenerate_material_variants_create', {
    title: 'Create material background variants',
    description: 'Create an approved VideoGenerate run that derives new background variants from existing product materials.',
    inputSchema: {
      ...commonInput,
      materialIds: z.array(z.string()).min(1).max(20).describe('Existing material identifiers.'),
      variantCount: z.number().int().min(1).max(6).optional().describe('Variants to create for each material.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'create_variants' }, 'Intent.MaterialManage', true))

  server.registerTool('videogenerate_material_bind_product', {
    title: 'Bind material to product',
    description: 'Create an approved VideoGenerate run that binds one material to a product, or removes its current binding.',
    inputSchema: {
      ...commonInput,
      materialId: z.string().describe('Existing material identifier.'),
      productId: z.string().optional().describe('Product identifier. Omit to remove the current product binding.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'bind_product' }, 'Intent.MaterialManage', true))

  server.registerTool('videogenerate_material_usage_update', {
    title: 'Update material usage state',
    description: 'Create an approved VideoGenerate run that marks existing materials as used or unused.',
    inputSchema: {
      ...commonInput,
      materialIds: z.array(z.string()).min(1).max(100).describe('Existing material identifiers.'),
      usageStatus: z.enum(['used', 'unused']).describe('New material usage state.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'update_usage' }, 'Intent.MaterialManage', true))

  server.registerTool('videogenerate_material_export', {
    title: 'Export materials',
    description: 'Create an approved VideoGenerate run that copies selected materials to a local output directory.',
    inputSchema: {
      ...commonInput,
      materialIds: z.array(z.string()).min(1).max(100).describe('Existing material identifiers.'),
      outputDir: z.string().describe('Absolute local output directory.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'export' }, 'Intent.MaterialManage', true))

  server.registerTool('videogenerate_material_delete', {
    title: 'Delete materials',
    description: 'Create an approved VideoGenerate run that permanently deletes selected material records and their managed files.',
    inputSchema: {
      ...commonInput,
      materialIds: z.array(z.string()).min(1).max(100).describe('Existing material identifiers.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'delete' }, 'Intent.MaterialManage', true))

  server.registerTool('videogenerate_video_clone', {
    title: 'Create commerce video',
    description: 'Create commerce video outputs from a reference video and approved product materials.',
    inputSchema: {
      ...commonInput,
      referenceVideoPath: z.string().describe('Absolute local reference video path.'),
      productImagePaths: z.array(z.string()).optional().describe('Absolute local product image paths.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent(input, 'Intent.CommerceVideoCreate', true))

  server.registerTool('videogenerate_clone_project_update', {
    title: 'Update clone project',
    description: 'Update the title or description of an existing commerce video project.',
    inputSchema: {
      ...commonInput,
      cloneProjectId: z.string().describe('Existing clone project identifier.'),
      title: z.string().max(200).optional().describe('New project title.'),
      description: z.string().max(2_000).optional().describe('New project description.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'update_meta' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_queue_pause', {
    title: 'Pause clone project queue',
    description: 'Pause automatic video generation for an existing commerce video project.',
    inputSchema: { ...commonInput, cloneProjectId: z.string().describe('Existing clone project identifier.') },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'pause_queue' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_queue_resume', {
    title: 'Resume clone project queue',
    description: 'Resume automatic video generation for an existing commerce video project.',
    inputSchema: { ...commonInput, cloneProjectId: z.string().describe('Existing clone project identifier.') },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'resume_queue' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_project_sync', {
    title: 'Sync clone project work',
    description: 'Reconcile pending remote video work and recover current project state without submitting duplicate work.',
    inputSchema: { ...commonInput, cloneProjectId: z.string().describe('Existing clone project identifier.') },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'reconcile' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_shot_retry', {
    title: 'Retry clone project shot',
    description: 'Retry video generation for one storyboard shot in an existing commerce video project.',
    inputSchema: {
      ...commonInput,
      cloneProjectId: z.string().describe('Existing clone project identifier.'),
      shotId: z.string().describe('Storyboard shot identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'retry_shot' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_shot_download', {
    title: 'Download clone project shot',
    description: 'Recover and download a completed storyboard shot result without resubmitting generation.',
    inputSchema: {
      ...commonInput,
      cloneProjectId: z.string().describe('Existing clone project identifier.'),
      shotId: z.string().describe('Storyboard shot identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'download_shot' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_final_compose', {
    title: 'Compose clone project final video',
    description: 'Compose ready storyboard shots into the final commerce video and register the result.',
    inputSchema: {
      ...commonInput,
      cloneProjectId: z.string().describe('Existing clone project identifier.'),
      outputDir: z.string().optional().describe('Optional absolute output directory.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'compose' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_final_export', {
    title: 'Export clone project final video',
    description: 'Copy the current final video from an existing commerce video project to an approved local directory.',
    inputSchema: {
      ...commonInput,
      cloneProjectId: z.string().describe('Existing clone project identifier.'),
      outputDir: z.string().describe('Absolute local output directory.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'export' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_subtitle_generate', {
    title: 'Add subtitles to clone project video',
    description: 'Generate subtitles or a fixed title for a project final video and apply the successful result to the project.',
    inputSchema: {
      ...commonInput,
      cloneProjectId: z.string().describe('Existing clone project identifier.'),
      titleText: z.string().max(500).optional().describe('Optional fixed title. Omit to generate timed captions from speech.'),
      jobName: z.string().max(200).optional().describe('Optional subtitle job name.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'subtitle_generate' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_subtitle_revert', {
    title: 'Remove clone project subtitles',
    description: 'Restore the original final video for a project that currently uses a generated subtitle video.',
    inputSchema: { ...commonInput, cloneProjectId: z.string().describe('Existing clone project identifier.') },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'subtitle_revert' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_template_save', {
    title: 'Save clone project template',
    description: 'Save the current project blueprint as a reusable clone template.',
    inputSchema: {
      ...commonInput,
      cloneProjectId: z.string().describe('Existing clone project identifier.'),
      templateName: z.string().max(200).optional().describe('Optional template name.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'save_clone_template' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_template_convert', {
    title: 'Convert clone project to production template',
    description: 'Convert the current project blueprint into a reusable production template.',
    inputSchema: {
      ...commonInput,
      cloneProjectId: z.string().describe('Existing clone project identifier.'),
      templateName: z.string().max(200).optional().describe('Optional template name.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'convert_template' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_clone_project_delete', {
    title: 'Delete clone project',
    description: 'Permanently delete an existing commerce video project after explicit approval.',
    inputSchema: { ...commonInput, cloneProjectId: z.string().describe('Existing clone project identifier.') },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'delete' }, 'Intent.CloneProjectManage', true))

  server.registerTool('videogenerate_live_photo_create', {
    title: 'Create live photo',
    description: 'Create live photo outputs for a product using its approved reference images.',
    inputSchema: {
      ...commonInput,
      productImagePaths: z.array(z.string()).optional().describe('Absolute local product image paths.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent(input, 'Intent.LivePhotoCreate', true))

  server.registerTool('videogenerate_live_photo_retry', {
    title: 'Retry Live Photo items',
    description: 'Create an approved VideoGenerate run that retries selected Live Photo work from the safest recoverable stage.',
    inputSchema: {
      ...commonInput,
      livePhotoIds: z.array(z.string()).min(1).max(20).describe('Existing Live Photo item identifiers.'),
      motionTemplate: z.enum(['push_in', 'push_out', 'ambient_sway']).optional().describe('Optional motion template override.'),
      replacementRegion: z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      }).optional().describe('Optional normalized replacement region for corrective retries.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'retry' }, 'Intent.LivePhotoManage', true))

  server.registerTool('videogenerate_live_photo_pause', {
    title: 'Pause Live Photo items',
    description: 'Create an approved VideoGenerate run that pauses automatic continuation for selected Live Photo items.',
    inputSchema: {
      ...commonInput,
      livePhotoIds: z.array(z.string()).min(1).max(100).describe('Existing Live Photo item identifiers.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'pause' }, 'Intent.LivePhotoManage', true))

  server.registerTool('videogenerate_live_photo_resume', {
    title: 'Resume Live Photo items',
    description: 'Create an approved VideoGenerate run that resumes automatic continuation for selected Live Photo items.',
    inputSchema: {
      ...commonInput,
      livePhotoIds: z.array(z.string()).min(1).max(100).describe('Existing Live Photo item identifiers.'),
      motionTemplate: z.enum(['push_in', 'push_out', 'ambient_sway']).optional().describe('Optional motion template override.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'resume' }, 'Intent.LivePhotoManage', true))

  server.registerTool('videogenerate_live_photo_export', {
    title: 'Export Live Photo videos',
    description: 'Create an approved VideoGenerate run that exports ready Live Photo videos and reports skipped items.',
    inputSchema: {
      ...commonInput,
      livePhotoIds: z.array(z.string()).min(1).max(100).describe('Existing Live Photo item identifiers.'),
      outputDir: z.string().optional().describe('Absolute local output directory. Omit to use the managed export directory.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'export' }, 'Intent.LivePhotoManage', true))

  server.registerTool('videogenerate_live_photo_subtitle_generate', {
    title: 'Add titles to Live Photo videos',
    description: 'Create an approved VideoGenerate run that generates title overlays and applies successful outputs to selected Live Photo items.',
    inputSchema: {
      ...commonInput,
      livePhotoIds: z.array(z.string()).min(1).max(20).describe('Existing Live Photo item identifiers.'),
      titleText: z.string().min(1).max(500).describe('Title text to apply to every selected video.'),
      jobName: z.string().max(200).optional().describe('Optional subtitle job name.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'subtitle_generate' }, 'Intent.LivePhotoManage', true))

  server.registerTool('videogenerate_live_photo_subtitle_revert', {
    title: 'Remove Live Photo titles',
    description: 'Create an approved VideoGenerate run that restores the original video for selected titled Live Photo items.',
    inputSchema: {
      ...commonInput,
      livePhotoIds: z.array(z.string()).min(1).max(100).describe('Existing Live Photo item identifiers.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'subtitle_revert' }, 'Intent.LivePhotoManage', true))

  server.registerTool('videogenerate_live_photo_delete', {
    title: 'Delete Live Photo records',
    description: 'Create an approved VideoGenerate run that permanently removes selected Live Photo records.',
    inputSchema: {
      ...commonInput,
      livePhotoIds: z.array(z.string()).min(1).max(100).describe('Existing Live Photo item identifiers.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'delete' }, 'Intent.LivePhotoManage', true))

  server.registerTool('videogenerate_subtitle_generate', {
    title: 'Generate subtitle video',
    description: 'Generate subtitles and a packaged output video from an existing local video.',
    inputSchema: {
      ...commonInput,
      sourceVideoPath: z.string().describe('Absolute local source video path.'),
      projectId: z.string().optional().describe('Related VideoGenerate project identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent(input, 'Intent.SubtitleGenerate', true))

  server.registerTool('videogenerate_video_slice', {
    title: 'Split long video',
    description: 'Create an approved VideoGenerate run that splits a local long video into reusable segment files.',
    inputSchema: {
      ...commonInput,
      inputPath: z.string().describe('Absolute local source video path.'),
      segmentTimeSec: z.number().int().min(1).max(600).optional().describe('Target segment duration in seconds.'),
      outputDir: z.string().optional().describe('Optional absolute local output directory.'),
      outputFormat: z.enum(['source', 'mp4']).optional().describe('Preserve the source container or produce MP4 segment files.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent(input, 'Intent.VideoSlice', true))

  server.registerTool('videogenerate_video_publish', {
    title: 'Publish video',
    description: 'Submit an approved local video to an approved publishing account.',
    inputSchema: {
      ...commonInput,
      videoPath: z.string().describe('Absolute local video path.'),
      publishAccountId: z.string().describe('Approved publishing account identifier.'),
      videoDesc: z.string().optional().describe('Publishing description.'),
      scheduleAt: z.number().optional().describe('Unix timestamp in milliseconds.'),
    },
    annotations: { destructiveHint: true, openWorldHint: true },
  }, async (input) => await executeIntent(input, 'Intent.VideoPublish', true))

  server.registerTool('videogenerate_publisher_account_save', {
    title: 'Save publishing account',
    description: 'Create an approved VideoGenerate run that creates or updates a publishing account binding.',
    inputSchema: {
      ...commonInput,
      publishAccountId: z.string().optional().describe('Existing publishing account identifier for updates.'),
      name: z.string().max(200).optional().describe('Publishing account display name. Required for creation.'),
      cloudPhoneId: z.string().max(200).optional().describe('Bound cloud phone identifier. Required for creation.'),
      cloudPhoneName: z.string().max(200).optional().describe('Bound cloud phone display name. Required for creation.'),
      externalAccountId: z.string().max(200).optional().describe('Optional external platform account identifier.'),
      remark: z.string().max(2_000).optional().describe('Optional account notes.'),
      status: z.enum(['active', 'disabled']).optional().describe('Account availability.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'account_save' }, 'Intent.PublishingManage', true))

  server.registerTool('videogenerate_publisher_account_delete', {
    title: 'Delete publishing account',
    description: 'Create an approved VideoGenerate run that deletes a local publishing account binding.',
    inputSchema: {
      ...commonInput,
      publishAccountId: z.string().describe('Existing publishing account identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'account_delete' }, 'Intent.PublishingManage', true))

  server.registerTool('videogenerate_publisher_music_save', {
    title: 'Save publishing music preset',
    description: 'Create an approved VideoGenerate run that creates or updates a reusable publishing music preset.',
    inputSchema: {
      ...commonInput,
      musicPresetId: z.string().optional().describe('Existing music preset identifier for updates.'),
      label: z.string().max(200).optional().describe('Music preset label. Required for creation.'),
      refVideoId: z.string().max(500).optional().describe('Reference video identifier used by the publishing platform. Required for creation.'),
      remark: z.string().max(2_000).optional().describe('Optional music preset notes.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'music_save' }, 'Intent.PublishingManage', true))

  server.registerTool('videogenerate_publisher_music_delete', {
    title: 'Delete publishing music preset',
    description: 'Create an approved VideoGenerate run that deletes a reusable publishing music preset.',
    inputSchema: {
      ...commonInput,
      musicPresetId: z.string().describe('Existing music preset identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'music_delete' }, 'Intent.PublishingManage', true))

  server.registerTool('videogenerate_publisher_task_sync', {
    title: 'Synchronize publishing task',
    description: 'Create an approved VideoGenerate run that queries and records the latest state of an existing publishing task.',
    inputSchema: {
      ...commonInput,
      publishTaskId: z.string().describe('Existing VideoGenerate publishing task identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'task_sync' }, 'Intent.PublishingManage', true))

  server.registerTool('videogenerate_artifact_export', {
    title: 'Export artifacts',
    description: 'Copy selected VideoGenerate artifacts to a local output directory.',
    inputSchema: {
      ...commonInput,
      artifactPaths: z.array(z.string()).min(1).describe('Absolute local artifact paths.'),
      outputDir: z.string().describe('Absolute local output directory.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent(input, 'Intent.ArtifactExport', true))

  server.registerTool('videogenerate_run_get', {
    title: 'Read business run',
    description: 'Read the current status, steps, attempts, and artifacts of a VideoGenerate run.',
    inputSchema: { runId: z.string().describe('VideoGenerate run identifier.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ runId }) => textResult(publicRunDetail(await agentOsService.getRun(runId))))

  server.registerTool('videogenerate_artifact_list', {
    title: 'List artifacts',
    description: 'List VideoGenerate artifacts for a run or conversation.',
    inputSchema: {
      runId: z.string().optional().describe('VideoGenerate run identifier.'),
      conversationId: z.string().optional().describe('VideoGenerate conversation identifier.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (input) => textResult(await agentOsService.listArtifacts(input)))

  server.registerTool('videogenerate_source_video_import', {
    title: 'Import source videos',
    description: 'Create an approved VideoGenerate run that imports source videos from supported sharing links.',
    inputSchema: {
      ...commonInput,
      shareUrls: z.array(z.string().url()).min(1).max(20).describe('Supported source-video sharing links.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent(input, 'Intent.SourceVideoImport', true))

  server.registerTool('videogenerate_source_video_retry', {
    title: 'Retry source video',
    description: 'Create an approved VideoGenerate run that retries an existing failed or incomplete source-video download.',
    inputSchema: {
      ...commonInput,
      sourceVideoId: z.string().describe('Existing source-video record identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'retry' }, 'Intent.SourceVideoManage', true))

  server.registerTool('videogenerate_source_video_delete', {
    title: 'Delete source video',
    description: 'Create an approved VideoGenerate run that permanently deletes a source-video record and its managed local files.',
    inputSchema: {
      ...commonInput,
      sourceVideoId: z.string().describe('Existing source-video record identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'delete' }, 'Intent.SourceVideoManage', true))

  server.registerTool('videogenerate_listing_generate', {
    title: 'Generate product listing',
    description: 'Create an approved VideoGenerate run that generates copy and product images for an existing listing record.',
    inputSchema: {
      ...commonInput,
      listingId: z.string().describe('Existing VideoGenerate listing identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent(input, 'Intent.ListingGenerate', true))

  server.registerTool('videogenerate_listing_export', {
    title: 'Export product listings',
    description: 'Create an approved VideoGenerate run that exports completed listing records as a spreadsheet.',
    inputSchema: {
      ...commonInput,
      listingIds: z.array(z.string()).min(1).max(100).describe('Completed VideoGenerate listing identifiers.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent(input, 'Intent.ListingExport', true))

  server.registerTool('videogenerate_listing_save', {
    title: 'Save product listing',
    description: 'Create an approved VideoGenerate run that creates or updates a product listing record.',
    inputSchema: {
      ...commonInput,
      listingId: z.string().optional().describe('Existing listing identifier for updates.'),
      sourceImagePath: z.string().optional().describe('Absolute local source image path. Required for creation.'),
      referenceImagePaths: z.array(z.string()).max(20).optional().describe('Optional absolute local supplementary reference image paths.'),
      category: z.enum(['earring', 'ring', 'necklace', 'phone_case', 'bracelet']).optional().describe('Product listing category.'),
      sku: z.string().max(200).optional().describe('Product SKU. Required for creation.'),
      localDisplayPrice: z.string().max(100).optional().describe('Local display price. Required for creation.'),
      titleLanguage: z.enum(['zh-CN', 'en-US', 'vi-VN']).optional().describe('Listing title language.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'save' }, 'Intent.ListingManage', true))

  server.registerTool('videogenerate_listing_delete', {
    title: 'Delete product listing',
    description: 'Create an approved VideoGenerate run that deletes an existing product listing record.',
    inputSchema: {
      ...commonInput,
      listingId: z.string().describe('Existing VideoGenerate listing identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'delete' }, 'Intent.ListingManage', true))

  server.registerTool('videogenerate_listing_export_config_save', {
    title: 'Save listing export configuration',
    description: 'Create an approved VideoGenerate run that saves category mappings used by listing spreadsheet exports.',
    inputSchema: {
      ...commonInput,
      configs: z.array(z.object({
        category: z.enum(['earring', 'ring', 'necklace', 'phone_case', 'bracelet']),
        categoryId: z.string().min(1).max(200),
        productAttributes: z.string().max(10_000),
      }).strict()).min(1).max(5).describe('Category export mappings.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'save_export_config' }, 'Intent.ListingManage', true))

  server.registerTool('videogenerate_tiktok_creative_create', {
    title: 'Create TikTok creative tasks',
    description: 'Create approved TikTok creative draft tasks from existing clone projects.',
    inputSchema: {
      ...commonInput,
      cloneProjectIds: z.array(z.string()).min(1).max(20).describe('Clone project identifiers with ready storyboard frames.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'create_drafts' }, 'Intent.TiktokCreativeManage', true))

  server.registerTool('videogenerate_tiktok_creative_shot_start', {
    title: 'Start TikTok creative shot',
    description: 'Create an approved run that opens a visible browser and prepares one creative shot for manual review.',
    inputSchema: {
      ...commonInput,
      taskId: z.string().describe('Existing TikTok creative task identifier.'),
      shotId: z.string().describe('Shot identifier within the creative task.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'start_shot' }, 'Intent.TiktokCreativeManage', true))

  server.registerTool('videogenerate_tiktok_creative_next_start', {
    title: 'Start next TikTok creative shot',
    description: 'Create an approved run that opens a visible browser and prepares the next pending shot for manual review.',
    inputSchema: {
      ...commonInput,
      taskId: z.string().describe('Existing TikTok creative task identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async (input) => await executeIntent({ ...input, action: 'start_next' }, 'Intent.TiktokCreativeManage', true))

  server.registerTool('videogenerate_tiktok_creative_shot_complete', {
    title: 'Complete TikTok creative shot',
    description: 'Create an approved run that records a local result video for one creative shot.',
    inputSchema: {
      ...commonInput,
      taskId: z.string().describe('Existing TikTok creative task identifier.'),
      shotId: z.string().describe('Shot identifier within the creative task.'),
      resultVideoPath: z.string().describe('Absolute local path of the completed result video.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'mark_completed' }, 'Intent.TiktokCreativeManage', true))

  server.registerTool('videogenerate_tiktok_creative_shot_fail', {
    title: 'Record TikTok creative shot failure',
    description: 'Create an approved run that records a failure for one creative shot.',
    inputSchema: {
      ...commonInput,
      taskId: z.string().describe('Existing TikTok creative task identifier.'),
      shotId: z.string().describe('Shot identifier within the creative task.'),
      error: z.string().max(2_000).optional().describe('Failure reason.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'mark_failed' }, 'Intent.TiktokCreativeManage', true))

  server.registerTool('videogenerate_tiktok_creative_delete', {
    title: 'Delete TikTok creative task',
    description: 'Create an approved run that deletes a TikTok creative task record without deleting its output files.',
    inputSchema: {
      ...commonInput,
      taskId: z.string().describe('Existing TikTok creative task identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'delete' }, 'Intent.TiktokCreativeManage', true))

  server.registerTool('videogenerate_production_batch_create', {
    title: 'Create production batch',
    description: 'Create an approved VideoGenerate run that queues production tasks from a product and template.',
    inputSchema: {
      ...commonInput,
      productId: z.string().describe('VideoGenerate product identifier.'),
      templateId: z.string().describe('VideoGenerate production template identifier.'),
      outputDir: z.string().describe('Absolute local output directory.'),
      quantity: z.number().int().min(1).max(100).optional().describe('Requested task quantity.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent(input, 'Intent.ProductionBatchCreate', true))

  server.registerTool('videogenerate_workspace_catalog', {
    title: 'List VideoGenerate workspaces',
    description: 'List the application workspaces that can be opened inside VideoGenerate.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => textResult({ workspaces: listHermesWorkspaces() }))

  server.registerTool('videogenerate_workspace_open', {
    title: 'Open VideoGenerate workspace',
    description: 'Navigate the current VideoGenerate desktop window to a registered workspace or business record.',
    inputSchema: {
      workspaceId: z.enum(HERMES_WORKSPACE_IDS).describe('Registered VideoGenerate workspace identifier.'),
      entityId: z.string().optional().describe('Product, clone project, or production task identifier when required.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ workspaceId, entityId }) => {
    const result = dispatchHermesWorkspaceAction(workspaceId, entityId)
    return textResult({
      opened: result.recipientCount > 0,
      workspaceId: result.action.workspaceId,
      route: result.action.route,
      recipientCount: result.recipientCount,
    })
  })

  server.registerTool('videogenerate_product_list', {
    title: 'List products',
    description: 'List products and reference-asset availability from the VideoGenerate product library.',
    inputSchema: {
      query: z.string().optional().describe('Optional name, type, or identifier search.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, limit }) => {
    const { productsRepo } = await import('../products/repo')
    const products = (await productsRepo.list())
      .filter((item) => matchesQuery(query, [item.id, item.name, item.type, item.remark]))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        imageCount: Array.isArray(item.images) ? item.images.length : 0,
        videoCount: Object.values(item.assets || {}).reduce((count, rows) => count + (Array.isArray(rows) ? rows.length : 0), 0),
        coverImagePath: item.coverImagePath,
        analysisStatus: item.analysisBoardStatus,
        updatedAt: item.updatedAt,
      }))
    return listResult(products, limit)
  })

  server.registerTool('videogenerate_material_list', {
    title: 'List product image materials',
    description: 'List reusable product image materials with product binding and usage state.',
    inputSchema: {
      query: z.string().optional().describe('Optional category, source video, product, or identifier search.'),
      usageStatus: z.enum(['all', 'unused', 'used']).optional().describe('Optional usage-state filter.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, usageStatus, limit }) => {
    const { productImageMaterialsService } = await import('../product-image-materials/service')
    const materials = (await productImageMaterialsService.listMaterials('desktop-local'))
      .filter((item) => !usageStatus || usageStatus === 'all' || item.usageStatus === usageStatus)
      .filter((item) => matchesQuery(query, [item.id, item.category, item.sourceVideoName, item.boundProductId]))
      .map((item) => ({
        id: item.id,
        category: item.category,
        usageStatus: item.usageStatus,
        boundProductId: item.boundProductId,
        sourceVideoName: item.sourceVideoName,
        localImagePath: item.localImagePath,
        thumbnailPath: item.thumbnailPath,
        createdAt: item.createdAt,
      }))
    return listResult(materials, limit)
  })

  server.registerTool('videogenerate_source_video_list', {
    title: 'List downloaded source videos',
    description: 'List downloaded source videos with download and material-usage state.',
    inputSchema: {
      query: z.string().optional().describe('Optional title, author, video, or identifier search.'),
      status: z.enum(['all', 'processing', 'completed', 'failed']).optional().describe('Optional download-state filter.'),
      usageStatus: z.enum(['all', 'unused', 'used']).optional().describe('Optional material-usage filter.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, status, usageStatus, limit }) => {
    const { videoParserDownloadService } = await import('../video-parser-download/service')
    const videos = (await videoParserDownloadService.listItems('desktop-local'))
      .filter((item) => !status || status === 'all' || item.status === status)
      .filter((item) => !usageStatus || usageStatus === 'all' || item.usedStatus === usageStatus)
      .filter((item) => matchesQuery(query, [item.id, item.videoId, item.title, item.author, item.shareUrl]))
      .map((item) => ({
        id: item.id,
        videoId: item.videoId,
        title: item.title,
        author: item.author,
        status: item.status,
        usedStatus: item.usedStatus,
        localVideoPath: item.localVideoPath,
        thumbnailPath: item.thumbnailPath,
        error: item.error,
        createdAt: item.createdAt,
      }))
    return listResult(videos, limit)
  })

  server.registerTool('videogenerate_clone_project_list', {
    title: 'List clone projects',
    description: 'List commerce video clone projects and their current workflow progress.',
    inputSchema: {
      query: z.string().optional().describe('Optional project search.'),
      status: z.string().optional().describe('Optional exact project status.'),
      archived: z.boolean().optional().describe('Optional archived-state filter.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, status, archived, limit }) => {
    const { cloneService } = await import('../clone/service')
    const projects = (await cloneService.listProjectSummaries({ query, status, archived }))
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        currentStep: item.currentStep,
        progressPercent: item.progressPercent,
        referenceVideoName: item.referenceVideoName,
        selectedModelIdentityName: item.selectedModelIdentityName,
        shotCount: item.shotCount,
        generatedImageCount: item.generatedImageCount,
        generatedVideoCount: item.generatedVideoCount,
        finalOutputPath: item.finalOutputPath,
        lastError: item.lastError,
        updatedAt: item.updatedAt,
      }))
    return listResult(projects, limit)
  })

  server.registerTool('videogenerate_live_photo_list', {
    title: 'List Live Photo records',
    description: 'List Live Photo records, workflow state, quality result, and output paths.',
    inputSchema: {
      filter: z.enum(['all', 'failed', 'running', 'paused']).optional().describe('Optional workflow-state filter.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ filter, limit }) => {
    const { livePhotoRepo } = await import('../live-photo/repo')
    const pageSize = normalizedLimit(limit)
    const allItems = await livePhotoRepo.list()
    const filteredItems = allItems
      .filter((item) => {
        if (!filter || filter === 'all') return true
        if (filter === 'failed') {
          return item.packagingStatus === 'failed' || item.autoFlowStatus?.status === 'failed_retryable' || item.autoFlowStatus?.status === 'failed_terminal'
        }
        if (filter === 'running') return item.packagingStatus === 'processing' || item.autoFlowStatus?.status === 'running'
        return Boolean(item.autoFlowStatus?.paused)
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    const items = filteredItems.slice(0, pageSize)
    return textResult({
      total: filteredItems.length,
      returned: items.length,
      items: items.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        sourceProjectId: item.sourceProjectId,
        sourceProjectTitle: item.sourceProjectTitle,
        productId: item.productId,
        productName: item.productSnapshot?.name,
        packagingStatus: item.packagingStatus,
        autoFlowStatus: item.autoFlowStatus?.status,
        paused: Boolean(item.autoFlowStatus?.paused),
        qualityDecision: item.qualityReport?.decision,
        previewVideoPath: item.previewVideoPath,
        posterPath: item.posterPath,
        exportBundlePath: item.exportBundlePath,
        error: item.error,
        createdAt: item.createdAt,
      })),
    })
  })

  server.registerTool('videogenerate_listing_list', {
    title: 'List TikTok listing records',
    description: 'List TikTok product listing records and their generation state.',
    inputSchema: {
      query: z.string().optional().describe('Optional SKU, title, category, or identifier search.'),
      status: z.enum(['all', 'idle', 'generating', 'done', 'failed']).optional().describe('Optional generation-state filter.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, status, limit }) => {
    const { tiktokListingService } = await import('../tiktok-listing/service')
    const listings = (await tiktokListingService.list())
      .filter((item) => !status || status === 'all' || item.generationStatus === status)
      .filter((item) => matchesQuery(query, [item.id, item.sku, item.category, item.generatedTitle]))
      .map((item) => ({
        id: item.id,
        sku: item.sku,
        category: item.category,
        titleLanguage: item.titleLanguage,
        generatedTitle: item.generatedTitle,
        generationStatus: item.generationStatus,
        generationError: item.generationError,
        listingImageCount: item.listingImages.length,
        sourceImagePath: item.sourceImagePath,
        updatedAt: item.updatedAt,
      }))
    return listResult(listings, limit)
  })

  server.registerTool('videogenerate_listing_export_config_get', {
    title: 'Read listing export configuration',
    description: 'Read the category mappings used by TikTok listing spreadsheet exports.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const { tiktokListingService } = await import('../tiktok-listing/service')
    return textResult({ configs: await tiktokListingService.getExportCategoryConfigs() })
  })

  server.registerTool('videogenerate_tiktok_creative_list', {
    title: 'List TikTok creative tasks',
    description: 'List TikTok creative tasks, shot progress, manual-review state, and local results.',
    inputSchema: {
      query: z.string().optional().describe('Optional clone project title, identifier, task identifier, or shot identifier search.'),
      status: z.enum(['all', 'draft', 'running', 'requires_manual', 'completed', 'failed']).optional().describe('Optional task-state filter.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum tasks to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, status, limit }) => {
    const { tiktokCreativeStudioService } = await import('../tiktok-creative-studio/service')
    const tasks = (await tiktokCreativeStudioService.list())
      .filter((item) => !status || status === 'all' || item.status === status)
      .filter((item) => matchesQuery(query, [item.id, item.sourceCloneProjectId, item.sourceCloneProjectTitle, ...item.shots.map((shot) => shot.shotId)]))
      .map((item) => ({
        id: item.id,
        sourceCloneProjectId: item.sourceCloneProjectId,
        sourceCloneProjectTitle: item.sourceCloneProjectTitle,
        status: item.status,
        totalShots: item.totalShots,
        completedShots: item.completedShots,
        failedShots: item.failedShots,
        waitingShots: item.waitingShots,
        lastError: item.lastError,
        updatedAt: item.updatedAt,
        shots: item.shots.map((shot) => ({
          shotId: shot.shotId,
          shotIndex: shot.shotIndex,
          status: shot.status,
          imagePath: shot.imagePath,
          durationSec: shot.durationSec,
          resultVideoPath: shot.resultVideoPath,
          lastError: shot.lastError,
        })),
      }))
    return listResult(tasks, limit)
  })

  server.registerTool('videogenerate_model_identity_list', {
    title: 'List model identities',
    description: 'List reusable model identities and reference-image availability from the VideoGenerate model library.',
    inputSchema: {
      query: z.string().optional().describe('Optional name, market, style, or identifier search.'),
      status: z.string().optional().describe('Optional exact generation status.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, status, limit }) => {
    const { cloneService } = await import('../clone/service')
    const models = (await cloneService.listModelIdentityLibrary())
      .filter((item) => !status || status === 'all' || item.status === status)
      .filter((item) => matchesQuery(query, [item.id, item.name, item.market, item.gender, item.ageRange, item.outfitStyle, item.sceneStyle]))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        productType: item.productType,
        market: item.market,
        gender: item.gender,
        ageRange: item.ageRange,
        outfitStyle: item.outfitStyle,
        sceneStyle: item.sceneStyle,
        description: item.description,
        imageCount: item.imagePaths.length,
        coverImagePath: item.coverImagePath,
        error: item.error,
        updatedAt: item.updatedAt,
      }))
    return listResult(models, limit)
  })

  server.registerTool('videogenerate_model_identity_generate', {
    title: 'Generate reusable model identity',
    description: 'Create an approved VideoGenerate run that generates a reusable model identity from business profile choices and optional local person references.',
    inputSchema: {
      ...commonInput,
      productType: z.enum(['earrings', 'phone_case', 'clothes', 'toy', 'general']).optional().describe('Product family the identity should support.'),
      productPoints: z.string().max(2_000).optional().describe('Product presentation requirements without provider or model details.'),
      profile: modelIdentityProfileSchema.optional().describe('Reusable person, styling, scene, and commerce profile.'),
      referenceImagePaths: z.array(z.string()).max(12).optional().describe('Optional absolute local person-reference image paths.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'generate' }, 'Intent.ModelIdentityManage', true))

  server.registerTool('videogenerate_model_identity_rename', {
    title: 'Rename model identity',
    description: 'Create an approved VideoGenerate run that renames an existing reusable model identity.',
    inputSchema: {
      ...commonInput,
      identityId: z.string().describe('Existing model identity identifier.'),
      name: z.string().min(1).max(200).describe('New display name.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'rename' }, 'Intent.ModelIdentityManage', true))

  server.registerTool('videogenerate_model_identity_assign', {
    title: 'Assign model identity to clone project',
    description: 'Create an approved VideoGenerate run that binds a reusable model identity to an existing commerce video project.',
    inputSchema: {
      ...commonInput,
      identityId: z.string().describe('Existing model identity identifier.'),
      cloneProjectId: z.string().describe('Existing clone project identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'assign' }, 'Intent.ModelIdentityManage', true))

  server.registerTool('videogenerate_model_identity_delete', {
    title: 'Delete model identity',
    description: 'Permanently delete an existing reusable model identity and its managed image files after explicit approval.',
    inputSchema: {
      ...commonInput,
      identityId: z.string().describe('Existing model identity identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'delete' }, 'Intent.ModelIdentityManage', true))

  server.registerTool('videogenerate_template_list', {
    title: 'List production templates',
    description: 'List production templates with their structure, duration, and source metadata.',
    inputSchema: {
      query: z.string().optional().describe('Optional template name, product category, or identifier search.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, limit }) => {
    const { templatesRepo } = await import('../templates/repo')
    const templates = (await templatesRepo.list())
      .filter((item) => matchesQuery(query, [item.id, item.name, item.meta?.productCategory, item.meta?.hookType]))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .map((item) => ({
        id: item.id,
        name: item.name,
        structure: item.structure,
        segmentSyncMode: item.segmentSyncMode,
        totalDurationSec: item.totalDurationSec,
        skipStartSec: item.skipStartSec,
        segmentDurationSec: item.segmentDurationSec,
        randomizeOrder: item.randomizeOrder,
        transition: item.transition,
        audio: item.audio,
        subtitleEnabled: item.subtitle?.enabled,
        ttsEnabled: item.tts?.enabled,
        ttsVoice: item.tts?.voice,
        aspectUnifyMode: item.aspectUnifyMode,
        source: item.meta?.source,
        cloneProjectId: item.meta?.cloneProjectId,
        productCategory: item.meta?.productCategory,
        hookType: item.meta?.hookType,
        updatedAt: item.updatedAt,
      }))
    return listResult(templates, limit)
  })

  server.registerTool('videogenerate_template_save', {
    title: 'Create or update production template',
    description: 'Create an approved VideoGenerate run that saves production ordering, timing, transitions, audio, subtitles, speech, and aspect behavior.',
    inputSchema: {
      ...commonInput,
      ...templateEditInput,
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent(input, 'Intent.TemplateSave', true))

  server.registerTool('videogenerate_template_duplicate', {
    title: 'Duplicate production template',
    description: 'Create an approved VideoGenerate run that copies an existing production template with all supported settings.',
    inputSchema: {
      ...commonInput,
      templateId: z.string().describe('Existing production template identifier.'),
      templateName: z.string().max(200).optional().describe('Optional name for the copied template.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'duplicate' }, 'Intent.TemplateManage', true))

  server.registerTool('videogenerate_template_delete', {
    title: 'Delete production template',
    description: 'Permanently delete an existing production template after explicit approval.',
    inputSchema: {
      ...commonInput,
      templateId: z.string().describe('Existing production template identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'delete' }, 'Intent.TemplateManage', true))

  server.registerTool('videogenerate_production_task_list', {
    title: 'List production tasks',
    description: 'List current VideoGenerate production queue tasks and their output state.',
    inputSchema: {
      status: z.enum(['all', 'queued', 'running', 'paused', 'done', 'error', 'skipped', 'cancelled']).optional().describe('Optional task-state filter.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ status, limit }) => {
    const { taskQueue } = await import('../tasks/queue')
    const tasks = taskQueue.list()
      .filter((item) => !status || status === 'all' || item.status === status)
      .slice()
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .map((item) => ({
        id: item.id,
        productId: item.productId,
        templateId: item.templateId,
        status: item.status,
        progress: item.progress,
        outPath: item.outPath,
        reportPath: item.reportPath,
        renderMs: item.renderMs,
        error: item.error,
        createdAt: item.createdAt,
      }))
    return listResult(tasks, limit)
  })

  server.registerTool('videogenerate_production_task_retry', {
    title: 'Retry production task',
    description: 'Create an approved VideoGenerate run that retries one failed, cancelled, or skipped production task.',
    inputSchema: {
      ...commonInput,
      taskId: z.string().describe('Existing production task identifier.'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'retry' }, 'Intent.ProductionTaskManage', true))

  server.registerTool('videogenerate_production_task_cancel', {
    title: 'Cancel production task',
    description: 'Create an approved VideoGenerate run that cancels one queued, running, or paused production task while preserving output files.',
    inputSchema: {
      ...commonInput,
      taskId: z.string().describe('Existing production task identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'cancel' }, 'Intent.ProductionTaskManage', true))

  server.registerTool('videogenerate_production_task_remove', {
    title: 'Remove production task record',
    description: 'Create an approved VideoGenerate run that removes one stopped production task record without deleting its output files.',
    inputSchema: {
      ...commonInput,
      taskId: z.string().describe('Existing production task identifier.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent({ ...input, action: 'remove' }, 'Intent.ProductionTaskManage', true))

  server.registerTool('videogenerate_production_queue_control', {
    title: 'Control production queue',
    description: 'Create an approved VideoGenerate run that pauses, resumes, or cancels the production task queue.',
    inputSchema: {
      ...commonInput,
      action: z.enum(['pause', 'resume', 'cancel']).describe('Production queue action.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => await executeIntent(input, 'Intent.ProductionQueueControl', true))

  server.registerTool('videogenerate_publisher_list', {
    title: 'List publishing accounts and tasks',
    description: 'List configured VideoGenerate publishing accounts and recent publishing tasks without exposing credentials.',
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe('Maximum publishing tasks to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ limit }) => {
    const { geelarkPublisher } = await import('../web-platform/geelark')
    const [accounts, tasks] = await Promise.all([
      geelarkPublisher.listAccounts('desktop-local'),
      geelarkPublisher.listTasks('desktop-local'),
    ])
    const taskLimit = normalizedLimit(limit)
    return textResult({
      accounts: accounts.map((item) => ({
        id: item.id,
        name: item.name,
        platform: item.platform,
        cloudPhoneId: item.cloudPhoneId,
        cloudPhoneName: item.cloudPhoneName,
        status: item.status,
        remark: item.remark,
        updatedAt: item.updatedAt,
      })),
      taskTotal: tasks.length,
      tasks: tasks.slice(0, taskLimit).map((item) => ({
        id: item.id,
        cloneProjectId: item.cloneProjectId,
        publishAccountId: item.publishAccountId,
        cloudPhoneId: item.cloudPhoneId,
        sourceVideoPath: item.sourceVideoPath,
        productId: item.productId,
        scheduleAt: item.scheduleAt,
        status: item.status,
        failDesc: item.failDesc,
        updatedAt: item.updatedAt,
      })),
    })
  })

  server.registerTool('videogenerate_publisher_config_get', {
    title: 'Read publishing connection status',
    description: 'Read the sanitized publishing connection state without returning credentials or access tokens.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const { geelarkPublisher } = await import('../web-platform/geelark')
    const config = await geelarkPublisher.getConfig('desktop-local')
    return textResult({
      configured: Boolean(config.appId && (config.hasAppSecret || config.hasAccessToken)),
      hasAppId: Boolean(config.appId),
      hasAppSecret: config.hasAppSecret,
      hasAccessToken: config.hasAccessToken,
      requestTimeoutMs: config.requestTimeoutMs,
      updatedAt: config.updatedAt,
    })
  })

  server.registerTool('videogenerate_publisher_cloud_phone_list', {
    title: 'List publishing cloud phones',
    description: 'List cloud phones available for publishing account bindings.',
    inputSchema: {
      query: z.string().optional().describe('Optional phone name, serial number, group, tag, or identifier search.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum cloud phones to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ query, limit }) => {
    const { geelarkPublisher } = await import('../web-platform/geelark')
    const phones = (await geelarkPublisher.listCloudPhones('desktop-local'))
      .filter((item) => matchesQuery(query, [item.id, item.serialName, item.serialNo, item.groupName, ...(item.tags || [])]))
      .map((item) => ({
        id: item.id,
        serialName: item.serialName,
        serialNo: item.serialNo,
        status: item.status,
        rpaStatus: item.rpaStatus,
        remark: item.remark,
        groupName: item.groupName,
        tags: item.tags,
      }))
    return listResult(phones, limit)
  })

  server.registerTool('videogenerate_publisher_candidate_list', {
    title: 'List publishing candidates',
    description: 'List completed VideoGenerate outputs that are ready for publishing and are not already in an active publishing task.',
    inputSchema: {
      query: z.string().optional().describe('Optional project title, project identifier, or video path search.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum candidates to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, limit }) => {
    const { webPlatformService } = await import('../web-platform/service')
    const candidates = (await webPlatformService.listGeelarkPublishCandidates(''))
      .filter((item) => matchesQuery(query, [item.cloneProjectId, item.title, item.finalOutputPath, item.referenceVideoName]))
      .map((item) => ({
        cloneProjectId: item.cloneProjectId,
        title: item.title,
        coverAssetPath: item.coverAssetPath,
        finalOutputPath: item.finalOutputPath,
        referenceVideoName: item.referenceVideoName,
        updatedAt: item.updatedAt,
        publishedStatus: item.publishedStatus,
        lastPublishTaskId: item.lastPublishTaskId,
        lastPublishStatus: item.lastPublishStatus,
      }))
    return listResult(candidates, limit)
  })

  server.registerTool('videogenerate_publisher_music_list', {
    title: 'List publishing music presets',
    description: 'List reusable publishing music presets.',
    inputSchema: {
      query: z.string().optional().describe('Optional preset label, reference identifier, notes, or identifier search.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum presets to return.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, limit }) => {
    const { geelarkPublisher } = await import('../web-platform/geelark')
    const presets = (await geelarkPublisher.listMusicPresets('desktop-local'))
      .filter((item) => matchesQuery(query, [item.id, item.label, item.refVideoId, item.remark]))
    return listResult(presets, limit)
  })

  server.registerTool('videogenerate_publisher_task_get', {
    title: 'Read publishing task',
    description: 'Read one publishing task including its latest result images and diagnostic summary.',
    inputSchema: {
      publishTaskId: z.string().describe('Existing VideoGenerate publishing task identifier.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ publishTaskId }) => {
    const { geelarkPublisher } = await import('../web-platform/geelark')
    const task = await geelarkPublisher.getTask('desktop-local', publishTaskId)
    if (!task) return textResult({ error: 'Publishing task not found.' }, true)
    return textResult({
      id: task.id,
      cloneProjectId: task.cloneProjectId,
      publishAccountId: task.publishAccountId,
      cloudPhoneId: task.cloudPhoneId,
      cloudPhoneName: task.cloudPhoneName,
      sourceVideoPath: task.sourceVideoPath,
      videoDesc: task.videoDesc,
      productId: task.productId,
      scheduleAt: task.scheduleAt,
      externalTaskId: task.geelarkTaskId,
      status: task.status,
      failCode: task.failCode,
      failDesc: task.failDesc,
      resultImages: task.resultImages,
      logs: task.logs.slice(-50),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      lastSyncAt: task.lastSyncAt,
    })
  })

  server.registerTool('videogenerate_messaging_pairing_approve', {
    title: 'Approve messaging pairing',
    description: 'Approve an explicit Hermes messaging pairing code for a supported VideoGenerate channel. Use only when the user supplied the platform and pairing code and asked to approve it.',
    inputSchema: {
      platform: z.enum(['feishu', 'wecom', 'weixin']).describe('Messaging platform that issued the pairing code.'),
      code: z.string().regex(/^[A-Za-z0-9]{6,32}$/).describe('Pairing code supplied by the user.'),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (input) => textResult(await approveHermesPairing(input)))

  server.registerTool('videogenerate_messaging_send', {
    title: 'Send channel message',
    description: 'Send user-requested text and local attachments through a configured VideoGenerate messaging channel. For an attached image or file, pass its exact absolute local path in mediaPaths. Use only when the user explicitly requested delivery. Never report success unless this tool returns success.',
    inputSchema: {
      platform: z.enum(['feishu', 'wecom', 'weixin']).describe('Configured messaging platform.'),
      message: z.string().max(10_000).optional().describe('Exact message or caption requested by the user. May be omitted for media-only delivery.'),
      mediaPaths: z.array(z.string().min(1)).max(8).optional().describe('Absolute local paths of attached images or files to deliver as native channel media.'),
      target: z.string().optional().describe('Recipient identifier. Omit only when the platform has exactly one approved recipient.'),
    },
    annotations: { destructiveHint: true, openWorldHint: true },
  }, async (input) => textResult(await sendHermesMessage(input)))

  return server
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > 2 * 1024 * 1024) throw new Error('MCP request is too large')
    chunks.push(value)
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
}

function writeJson(res: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

export async function ensureVideoGenerateMcpServer(): Promise<McpRuntime> {
  if (runtime && httpServer) return runtime
  const token = randomBytes(32).toString('base64url')
  const candidate = createServer(async (req, res) => {
    if (req.url !== '/mcp') return writeJson(res, 404, { error: 'not_found' })
    if (req.headers.authorization !== `Bearer ${token}`) return writeJson(res, 401, { error: 'unauthorized' })
    if (req.method !== 'POST') return writeJson(res, 405, { error: 'method_not_allowed' })
    const server = createBusinessServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    try {
      const body = await readJsonBody(req)
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (error) {
      if (!res.headersSent) writeJson(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: String((error as Error)?.message || error) } })
    } finally {
      res.once('close', () => {
        void transport.close()
        void server.close()
      })
    }
  })
  const port = await new Promise<number>((resolve, reject) => {
    candidate.once('error', reject)
    candidate.listen(0, '127.0.0.1', () => {
      const address = candidate.address()
      if (!address || typeof address === 'string') return reject(new Error('MCP server did not bind a TCP port'))
      resolve(address.port)
    })
  })
  httpServer = candidate
  runtime = { port, token, url: `http://127.0.0.1:${port}/mcp` }
  return runtime
}

export async function stopVideoGenerateMcpServer() {
  const active = httpServer
  httpServer = null
  runtime = null
  if (!active) return
  await new Promise<void>((resolve) => active.close(() => resolve()))
}
