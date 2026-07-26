import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-mcp-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  const { agentOsService } = await import('../src/main/modules/agent-os/service')
  const { agentOsStore } = await import('../src/main/modules/agent-os/store')
  const { ensureVideoGenerateMcpServer, stopVideoGenerateMcpServer } = await import('../src/main/modules/hermes/mcpServer')
  const { subscribeHermesWorkspaceActions } = await import('../src/main/modules/hermes/workspaceActions')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
  const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')
  const { closeWebPlatformSqlite } = await import('../src/main/modules/web-platform/sqlite')
  let client: Client | null = null
  let openedWorkspace = ''
  const unsubscribeWorkspaceActions = subscribeHermesWorkspaceActions((action) => {
    openedWorkspace = action.workspaceId
  })
  try {
    await agentOsService.initialize()
    const endpoint = await ensureVideoGenerateMcpServer()
    const denied = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    assert.equal(denied.status, 401)

    client = new Client({ name: 'videogenerate-smoke', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
      requestInit: { headers: { Authorization: `Bearer ${endpoint.token}` } },
    })
    await client.connect(transport)
    const tools = await client.listTools()
    const names = tools.tools.map((tool) => tool.name).sort()
    assert.deepEqual(names, [
      'videogenerate_artifact_export',
      'videogenerate_artifact_list',
      'videogenerate_clone_final_compose',
      'videogenerate_clone_final_export',
      'videogenerate_clone_project_delete',
      'videogenerate_clone_project_list',
      'videogenerate_clone_project_sync',
      'videogenerate_clone_project_update',
      'videogenerate_clone_queue_pause',
      'videogenerate_clone_queue_resume',
      'videogenerate_clone_shot_download',
      'videogenerate_clone_shot_retry',
      'videogenerate_clone_subtitle_generate',
      'videogenerate_clone_subtitle_revert',
      'videogenerate_clone_template_convert',
      'videogenerate_clone_template_save',
      'videogenerate_listing_delete',
      'videogenerate_listing_export',
      'videogenerate_listing_export_config_get',
      'videogenerate_listing_export_config_save',
      'videogenerate_listing_generate',
      'videogenerate_listing_list',
      'videogenerate_listing_save',
      'videogenerate_live_photo_create',
      'videogenerate_live_photo_delete',
      'videogenerate_live_photo_export',
      'videogenerate_live_photo_list',
      'videogenerate_live_photo_pause',
      'videogenerate_live_photo_resume',
      'videogenerate_live_photo_retry',
      'videogenerate_live_photo_subtitle_generate',
      'videogenerate_live_photo_subtitle_revert',
      'videogenerate_material_batch_retry',
      'videogenerate_material_bind_product',
      'videogenerate_material_delete',
      'videogenerate_material_export',
      'videogenerate_material_list',
      'videogenerate_material_prepare',
      'videogenerate_material_usage_update',
      'videogenerate_material_variants_create',
      'videogenerate_messaging_pairing_approve',
      'videogenerate_messaging_send',
      'videogenerate_model_identity_assign',
      'videogenerate_model_identity_delete',
      'videogenerate_model_identity_generate',
      'videogenerate_model_identity_list',
      'videogenerate_model_identity_rename',
      'videogenerate_product_analyze',
      'videogenerate_product_delete',
      'videogenerate_product_inspect',
      'videogenerate_product_list',
      'videogenerate_product_save',
      'videogenerate_production_batch_create',
      'videogenerate_production_queue_control',
      'videogenerate_production_task_cancel',
      'videogenerate_production_task_list',
      'videogenerate_production_task_remove',
      'videogenerate_production_task_retry',
      'videogenerate_publisher_account_delete',
      'videogenerate_publisher_account_save',
      'videogenerate_publisher_candidate_list',
      'videogenerate_publisher_cloud_phone_list',
      'videogenerate_publisher_config_get',
      'videogenerate_publisher_list',
      'videogenerate_publisher_music_delete',
      'videogenerate_publisher_music_list',
      'videogenerate_publisher_music_save',
      'videogenerate_publisher_task_get',
      'videogenerate_publisher_task_sync',
      'videogenerate_run_get',
      'videogenerate_source_video_delete',
      'videogenerate_source_video_import',
      'videogenerate_source_video_list',
      'videogenerate_source_video_retry',
      'videogenerate_subtitle_generate',
      'videogenerate_template_delete',
      'videogenerate_template_duplicate',
      'videogenerate_template_list',
      'videogenerate_template_save',
      'videogenerate_tiktok_creative_create',
      'videogenerate_tiktok_creative_delete',
      'videogenerate_tiktok_creative_list',
      'videogenerate_tiktok_creative_next_start',
      'videogenerate_tiktok_creative_shot_complete',
      'videogenerate_tiktok_creative_shot_fail',
      'videogenerate_tiktok_creative_shot_start',
      'videogenerate_video_clone',
      'videogenerate_video_publish',
      'videogenerate_video_slice',
      'videogenerate_workspace_catalog',
      'videogenerate_workspace_open',
    ])
    const modelIdentityTools = tools.tools.filter((tool) => tool.name.startsWith('videogenerate_model_identity_'))
    const publicIdentityContract = JSON.stringify(modelIdentityTools)
    assert.doesNotMatch(publicIdentityContract, /"(?:apiKey|baseUrl|provider|adapter)"|openai|kling|grsai|seedance/i)
    const managedBusinessTools = tools.tools.filter((tool) => /videogenerate_(?:listing_|tiktok_creative_|product_delete)/.test(tool.name))
    const managedBusinessContract = JSON.stringify(managedBusinessTools)
    assert.doesNotMatch(managedBusinessContract, /"(?:apiKey|baseUrl|provider|adapter|model)"|openai|kling|grsai|seedance/i)
    const publishingTools = tools.tools.filter((tool) => tool.name.startsWith('videogenerate_publisher_'))
    const publishingContract = JSON.stringify(publishingTools)
    assert.doesNotMatch(publishingContract, /"(?:apiKey|appSecret|accessToken|baseUrl)"/i)
    const artifacts = await client.callTool({ name: 'videogenerate_artifact_list', arguments: {} })
    assert.notEqual(artifacts.isError, true)
    for (const toolName of [
      'videogenerate_product_list',
      'videogenerate_material_list',
      'videogenerate_source_video_list',
      'videogenerate_clone_project_list',
      'videogenerate_live_photo_list',
      'videogenerate_listing_list',
      'videogenerate_listing_export_config_get',
      'videogenerate_tiktok_creative_list',
      'videogenerate_model_identity_list',
      'videogenerate_template_list',
      'videogenerate_production_task_list',
      'videogenerate_publisher_list',
      'videogenerate_publisher_config_get',
      'videogenerate_publisher_candidate_list',
      'videogenerate_publisher_music_list',
      'videogenerate_workspace_catalog',
    ]) {
      const result = await client.callTool({ name: toolName, arguments: {} })
      assert.notEqual(result.isError, true, `${toolName} should return a read-only result`)
    }
    const opened = await client.callTool({
      name: 'videogenerate_workspace_open',
      arguments: { workspaceId: 'settings' },
    })
    assert.notEqual(opened.isError, true)
    assert.equal(openedWorkspace, 'settings')
    const missingEntity = await client.callTool({
      name: 'videogenerate_workspace_open',
      arguments: { workspaceId: 'product-detail' },
    })
    assert.equal(missingEntity.isError, true)

    const approvalKey = 'mcp-source-import-approval'
    const pendingImport = await client.callTool({
      name: 'videogenerate_source_video_import',
      arguments: {
        shareUrls: ['https://www.tiktok.com/t/ZT-test/'],
        request: 'Import this source video.',
        idempotencyKey: approvalKey,
      },
    })
    assert.notEqual(pendingImport.isError, true)
    const pendingImportDetail = JSON.parse(String((pendingImport.content[0] as { text?: string })?.text || '{}'))
    assert.equal(pendingImportDetail.run.status, 'waiting_approval')
    assert.ok(pendingImportDetail.run.id)

    const duplicateImport = await client.callTool({
      name: 'videogenerate_source_video_import',
      arguments: {
        shareUrls: ['https://www.tiktok.com/t/ZT-test/'],
        request: 'Retry the same source import.',
        idempotencyKey: approvalKey,
      },
    })
    assert.notEqual(duplicateImport.isError, true)
    const duplicateImportDetail = JSON.parse(String((duplicateImport.content[0] as { text?: string })?.text || '{}'))
    assert.equal(duplicateImportDetail.run.id, pendingImportDetail.run.id)
    await agentOsStore.mutate((db) => {
      const run = db.runs.find((item) => item.id === pendingImportDetail.run.id)!
      const step = db.steps.find((item) => item.runId === run.id)!
      db.attempts.push({
        id: 'mcp-redaction-attempt',
        runId: run.id,
        stepId: step.id,
        sequence: 1,
        capabilityId: step.intentType === 'Intent.SourceVideoImport' ? 'SourceVideo.Import' : 'Product.Read',
        capabilityVersion: 1,
        bindingId: 'internal-binding',
        adapterVersion: 'internal-adapter',
        inputSnapshot: {},
        idempotencyKey: 'internal-idempotency',
        status: 'failed',
        result: {
          success: false,
          status: 'failed',
          artifactIds: [],
          logs: ['Authorization: Bearer private-bearer-value'],
          warnings: [],
          cost: {},
          retryable: true,
          externalRefs: { apiKey: 'private-api-key-value', jobId: 'public-job-id' },
          error: { code: 'fixture', message: 'password=private-password-value' },
        },
        createdAt: Date.now(),
        completedAt: Date.now(),
      })
      db.artifacts.push({
        id: 'mcp-redaction-artifact',
        kind: 'report',
        name: 'Recovery report',
        uri: 'agent-report://recovery',
        metadata: { clientSecret: 'private-client-secret', state: 'pending' },
        sourceArtifactIds: [],
        producerRunId: run.id,
        producerStepId: step.id,
        lifecycle: 'managed',
        createdAt: Date.now(),
      })
    })
    const publicRun = await client.callTool({
      name: 'videogenerate_run_get',
      arguments: { runId: pendingImportDetail.run.id },
    })
    assert.notEqual(publicRun.isError, true)
    const publicRunText = String((publicRun.content[0] as { text?: string })?.text || '')
    assert.match(publicRunText, /public-job-id/)
    assert.match(publicRunText, /\[redacted\]/)
    assert.doesNotMatch(publicRunText, /private-(?:bearer|api-key|password|client-secret)-value/)
    assert.doesNotMatch(publicRunText, /internal-binding|internal-adapter|internal-idempotency/)

    const conflictingIntent = await client.callTool({
      name: 'videogenerate_listing_generate',
      arguments: { listingId: 'listing-test', idempotencyKey: approvalKey },
    })
    assert.equal(conflictingIntent.isError, true)

    for (const [toolName, args] of [
      ['videogenerate_source_video_retry', { sourceVideoId: 'source-1', idempotencyKey: 'source-retry-approval' }],
      ['videogenerate_product_delete', { productId: 'product-1', idempotencyKey: 'product-delete-approval' }],
      ['videogenerate_source_video_delete', { sourceVideoId: 'source-1', idempotencyKey: 'source-delete-approval' }],
      ['videogenerate_material_batch_retry', { batchId: 'batch-1', idempotencyKey: 'material-retry-approval' }],
      ['videogenerate_material_bind_product', { materialId: 'material-1', productId: 'product-1', idempotencyKey: 'material-bind-approval' }],
      ['videogenerate_material_usage_update', { materialIds: ['material-1'], usageStatus: 'used', idempotencyKey: 'material-usage-approval' }],
      ['videogenerate_material_export', { materialIds: ['material-1'], outputDir: root, idempotencyKey: 'material-export-approval' }],
      ['videogenerate_material_delete', { materialIds: ['material-1'], idempotencyKey: 'material-delete-approval' }],
      ['videogenerate_material_variants_create', { materialIds: ['material-1'], variantCount: 1, idempotencyKey: 'material-variant-approval' }],
      ['videogenerate_video_slice', { inputPath: 'C:\\Temp\\long-video.mp4', segmentTimeSec: 30, outputFormat: 'mp4', idempotencyKey: 'video-slice-approval' }],
      ['videogenerate_publisher_account_save', { name: 'Publishing account', cloudPhoneId: 'phone-1', cloudPhoneName: 'Phone 1', idempotencyKey: 'publisher-account-save-approval' }],
      ['videogenerate_publisher_account_delete', { publishAccountId: 'account-1', idempotencyKey: 'publisher-account-delete-approval' }],
      ['videogenerate_publisher_music_save', { label: 'Music preset', refVideoId: 'reference-1', idempotencyKey: 'publisher-music-save-approval' }],
      ['videogenerate_publisher_music_delete', { musicPresetId: 'music-1', idempotencyKey: 'publisher-music-delete-approval' }],
      ['videogenerate_publisher_task_sync', { publishTaskId: 'publish-task-1', idempotencyKey: 'publisher-task-sync-approval' }],
      ['videogenerate_listing_save', { sourceImagePath: 'C:\\Temp\\listing.png', category: 'earring', sku: 'SKU-1', localDisplayPrice: '19.99', titleLanguage: 'en-US', idempotencyKey: 'listing-save-approval' }],
      ['videogenerate_listing_delete', { listingId: 'listing-1', idempotencyKey: 'listing-delete-approval' }],
      ['videogenerate_listing_export_config_save', { configs: [{ category: 'earring', categoryId: '123', productAttributes: 'material:silver' }], idempotencyKey: 'listing-config-approval' }],
      ['videogenerate_tiktok_creative_create', { cloneProjectIds: ['clone-1'], idempotencyKey: 'creative-create-approval' }],
      ['videogenerate_tiktok_creative_shot_start', { taskId: 'creative-1', shotId: 'shot-1', idempotencyKey: 'creative-start-approval' }],
      ['videogenerate_tiktok_creative_next_start', { taskId: 'creative-1', idempotencyKey: 'creative-next-approval' }],
      ['videogenerate_tiktok_creative_shot_complete', { taskId: 'creative-1', shotId: 'shot-1', resultVideoPath: 'C:\\Temp\\result.mp4', idempotencyKey: 'creative-complete-approval' }],
      ['videogenerate_tiktok_creative_shot_fail', { taskId: 'creative-1', shotId: 'shot-1', error: 'Manual failure', idempotencyKey: 'creative-fail-approval' }],
      ['videogenerate_tiktok_creative_delete', { taskId: 'creative-1', idempotencyKey: 'creative-delete-approval' }],
      ['videogenerate_clone_project_update', { cloneProjectId: 'clone-1', title: 'Updated project', idempotencyKey: 'clone-update-approval' }],
      ['videogenerate_clone_queue_pause', { cloneProjectId: 'clone-1', idempotencyKey: 'clone-pause-approval' }],
      ['videogenerate_clone_queue_resume', { cloneProjectId: 'clone-1', idempotencyKey: 'clone-resume-approval' }],
      ['videogenerate_clone_project_sync', { cloneProjectId: 'clone-1', idempotencyKey: 'clone-sync-approval' }],
      ['videogenerate_clone_shot_retry', { cloneProjectId: 'clone-1', shotId: 'shot-1', idempotencyKey: 'clone-shot-retry-approval' }],
      ['videogenerate_clone_shot_download', { cloneProjectId: 'clone-1', shotId: 'shot-1', idempotencyKey: 'clone-shot-download-approval' }],
      ['videogenerate_clone_final_compose', { cloneProjectId: 'clone-1', idempotencyKey: 'clone-compose-approval' }],
      ['videogenerate_clone_final_export', { cloneProjectId: 'clone-1', outputDir: root, idempotencyKey: 'clone-export-approval' }],
      ['videogenerate_clone_subtitle_generate', { cloneProjectId: 'clone-1', titleText: 'Title', idempotencyKey: 'clone-subtitle-approval' }],
      ['videogenerate_clone_subtitle_revert', { cloneProjectId: 'clone-1', idempotencyKey: 'clone-subtitle-revert-approval' }],
      ['videogenerate_clone_template_save', { cloneProjectId: 'clone-1', idempotencyKey: 'clone-template-save-approval' }],
      ['videogenerate_clone_template_convert', { cloneProjectId: 'clone-1', idempotencyKey: 'clone-template-convert-approval' }],
      ['videogenerate_clone_project_delete', { cloneProjectId: 'clone-1', idempotencyKey: 'clone-delete-approval' }],
      ['videogenerate_model_identity_generate', { productType: 'earrings', profile: { gender: 'female' }, idempotencyKey: 'identity-generate-approval' }],
      ['videogenerate_model_identity_rename', { identityId: 'identity-1', name: 'Renamed identity', idempotencyKey: 'identity-rename-approval' }],
      ['videogenerate_model_identity_assign', { identityId: 'identity-1', cloneProjectId: 'clone-1', idempotencyKey: 'identity-assign-approval' }],
      ['videogenerate_model_identity_delete', { identityId: 'identity-1', idempotencyKey: 'identity-delete-approval' }],
      ['videogenerate_template_save', { templateName: 'Template', structure: ['hook', 'show'], transitionTypes: ['fade'], idempotencyKey: 'template-save-approval' }],
      ['videogenerate_template_duplicate', { templateId: 'template-1', idempotencyKey: 'template-duplicate-approval' }],
      ['videogenerate_template_delete', { templateId: 'template-1', idempotencyKey: 'template-delete-approval' }],
      ['videogenerate_production_task_retry', { taskId: 'task-1', idempotencyKey: 'production-task-retry-approval' }],
      ['videogenerate_production_task_cancel', { taskId: 'task-1', idempotencyKey: 'production-task-cancel-approval' }],
      ['videogenerate_production_task_remove', { taskId: 'task-1', idempotencyKey: 'production-task-remove-approval' }],
      ['videogenerate_live_photo_retry', { livePhotoIds: ['live-photo-1'], idempotencyKey: 'live-photo-retry-approval' }],
      ['videogenerate_live_photo_pause', { livePhotoIds: ['live-photo-1'], idempotencyKey: 'live-photo-pause-approval' }],
      ['videogenerate_live_photo_resume', { livePhotoIds: ['live-photo-1'], idempotencyKey: 'live-photo-resume-approval' }],
      ['videogenerate_live_photo_export', { livePhotoIds: ['live-photo-1'], outputDir: root, idempotencyKey: 'live-photo-export-approval' }],
      ['videogenerate_live_photo_subtitle_generate', { livePhotoIds: ['live-photo-1'], titleText: 'Title', idempotencyKey: 'live-photo-subtitle-approval' }],
      ['videogenerate_live_photo_subtitle_revert', { livePhotoIds: ['live-photo-1'], idempotencyKey: 'live-photo-subtitle-revert-approval' }],
      ['videogenerate_live_photo_delete', { livePhotoIds: ['live-photo-1'], idempotencyKey: 'live-photo-delete-approval' }],
    ] as const) {
      const pending = await client.callTool({ name: toolName, arguments: args })
      assert.notEqual(pending.isError, true, `${toolName} should create an approval run`)
      const detail = JSON.parse(String((pending.content[0] as { text?: string })?.text || '{}'))
      assert.equal(detail.run.status, 'waiting_approval', `${toolName} should wait for approval`)
    }
    console.log('videogenerate-mcp.smoke: ok')
  } finally {
    unsubscribeWorkspaceActions()
    await client?.close()
    await stopVideoGenerateMcpServer()
    closeCloneSqlite()
    closeLivePhotoSqlite()
    closeWebPlatformSqlite()
    await rm(root, { recursive: true, force: true })
  }
}

void main()
