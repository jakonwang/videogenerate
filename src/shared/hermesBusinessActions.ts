import type { HermesWorkspaceId } from './hermesWorkspace'

export const HERMES_BUSINESS_CATEGORIES = [
  'product',
  'material',
  'sourceVideo',
  'clone',
  'livePhoto',
  'subtitle',
  'listing',
  'creative',
  'modelIdentity',
  'template',
  'production',
  'publishing',
  'artifact',
] as const

export type HermesBusinessCategory = typeof HERMES_BUSINESS_CATEGORIES[number]
export type HermesBusinessActionMode = 'read' | 'write' | 'dangerous'
export type HermesBusinessActionLocaleGroup = 'hermesTools' | 'hermesPublisherTools' | 'hermesTaskTools'

export type HermesBusinessActionDefinition = {
  id: string
  category: HermesBusinessCategory
  localeGroup: HermesBusinessActionLocaleGroup
  localeKey: string
  mode: HermesBusinessActionMode
  workspaceId: HermesWorkspaceId
}

const action = (
  id: string,
  category: HermesBusinessCategory,
  localeKey: string,
  workspaceId: HermesWorkspaceId,
  mode: HermesBusinessActionMode = 'write',
  localeGroup: HermesBusinessActionLocaleGroup = 'hermesTools',
): HermesBusinessActionDefinition => ({ id, category, localeGroup, localeKey, mode, workspaceId })

export const HERMES_BUSINESS_ACTIONS: readonly HermesBusinessActionDefinition[] = [
  action('product.list', 'product', 'product_list', 'products', 'read'),
  action('product.inspect', 'product', 'product_inspect', 'products', 'read'),
  action('product.save', 'product', 'product_save', 'products'),
  action('product.analyze', 'product', 'product_analyze', 'products'),
  action('product.delete', 'product', 'product_delete', 'products', 'dangerous'),

  action('material.list', 'material', 'material_list', 'product-materials', 'read'),
  action('material.prepare', 'material', 'material_prepare', 'product-materials'),
  action('material.retryBatch', 'material', 'material_batch_retry', 'product-materials'),
  action('material.createVariants', 'material', 'material_variants_create', 'product-materials'),
  action('material.bindProduct', 'material', 'material_bind_product', 'product-materials'),
  action('material.updateUsage', 'material', 'material_usage_update', 'product-materials'),
  action('material.export', 'material', 'material_export', 'product-materials'),
  action('material.delete', 'material', 'material_delete', 'product-materials', 'dangerous'),

  action('sourceVideo.list', 'sourceVideo', 'source_video_list', 'video-downloads', 'read'),
  action('sourceVideo.import', 'sourceVideo', 'source_video_import', 'video-downloads'),
  action('sourceVideo.retry', 'sourceVideo', 'source_video_retry', 'video-downloads'),
  action('sourceVideo.delete', 'sourceVideo', 'source_video_delete', 'video-downloads', 'dangerous'),

  action('clone.list', 'clone', 'clone_project_list', 'clone-projects', 'read'),
  action('clone.createVideo', 'clone', 'video_clone', 'clone-projects'),
  action('clone.updateProject', 'clone', 'clone_project_update', 'clone-projects'),
  action('clone.pauseQueue', 'clone', 'clone_queue_pause', 'clone-projects', 'dangerous'),
  action('clone.resumeQueue', 'clone', 'clone_queue_resume', 'clone-projects', 'dangerous'),
  action('clone.syncProject', 'clone', 'clone_project_sync', 'clone-projects'),
  action('clone.retryShot', 'clone', 'clone_shot_retry', 'clone-projects'),
  action('clone.downloadShot', 'clone', 'clone_shot_download', 'clone-projects'),
  action('clone.composeFinal', 'clone', 'clone_final_compose', 'clone-projects'),
  action('clone.exportFinal', 'clone', 'clone_final_export', 'clone-projects'),
  action('clone.generateSubtitle', 'clone', 'clone_subtitle_generate', 'clone-projects'),
  action('clone.revertSubtitle', 'clone', 'clone_subtitle_revert', 'clone-projects'),
  action('clone.saveTemplate', 'clone', 'clone_template_save', 'clone-projects'),
  action('clone.convertTemplate', 'clone', 'clone_template_convert', 'clone-projects'),
  action('clone.deleteProject', 'clone', 'clone_project_delete', 'clone-projects', 'dangerous'),

  action('livePhoto.list', 'livePhoto', 'live_photo_list', 'live-photo', 'read'),
  action('livePhoto.create', 'livePhoto', 'live_photo_create', 'live-photo'),
  action('livePhoto.retry', 'livePhoto', 'live_photo_retry', 'live-photo'),
  action('livePhoto.pause', 'livePhoto', 'live_photo_pause', 'live-photo', 'dangerous'),
  action('livePhoto.resume', 'livePhoto', 'live_photo_resume', 'live-photo', 'dangerous'),
  action('livePhoto.export', 'livePhoto', 'live_photo_export', 'live-photo'),
  action('livePhoto.generateSubtitle', 'livePhoto', 'live_photo_subtitle_generate', 'live-photo'),
  action('livePhoto.revertSubtitle', 'livePhoto', 'live_photo_subtitle_revert', 'live-photo'),
  action('livePhoto.delete', 'livePhoto', 'live_photo_delete', 'live-photo', 'dangerous'),

  action('subtitle.generate', 'subtitle', 'subtitle_generate', 'video-subtitles'),
  action('subtitle.sliceVideo', 'subtitle', 'video_slice', 'live-slicer', 'write', 'hermesPublisherTools'),

  action('listing.list', 'listing', 'listing_list', 'tiktok-listing', 'read'),
  action('listing.generate', 'listing', 'listing_generate', 'tiktok-listing'),
  action('listing.save', 'listing', 'listing_save', 'tiktok-listing'),
  action('listing.export', 'listing', 'listing_export', 'tiktok-listing'),
  action('listing.readExportConfig', 'listing', 'listing_export_config_get', 'tiktok-listing', 'read'),
  action('listing.saveExportConfig', 'listing', 'listing_export_config_save', 'tiktok-listing'),
  action('listing.delete', 'listing', 'listing_delete', 'tiktok-listing', 'dangerous'),

  action('creative.list', 'creative', 'tiktok_creative_list', 'tiktok-creative', 'read'),
  action('creative.create', 'creative', 'tiktok_creative_create', 'tiktok-creative'),
  action('creative.startShot', 'creative', 'tiktok_creative_shot_start', 'tiktok-creative'),
  action('creative.startNextShot', 'creative', 'tiktok_creative_next_start', 'tiktok-creative'),
  action('creative.completeShot', 'creative', 'tiktok_creative_shot_complete', 'tiktok-creative'),
  action('creative.recordFailure', 'creative', 'tiktok_creative_shot_fail', 'tiktok-creative'),
  action('creative.delete', 'creative', 'tiktok_creative_delete', 'tiktok-creative', 'dangerous'),

  action('modelIdentity.list', 'modelIdentity', 'model_identity_list', 'models', 'read'),
  action('modelIdentity.generate', 'modelIdentity', 'model_identity_generate', 'models'),
  action('modelIdentity.rename', 'modelIdentity', 'model_identity_rename', 'models'),
  action('modelIdentity.assign', 'modelIdentity', 'model_identity_assign', 'models'),
  action('modelIdentity.delete', 'modelIdentity', 'model_identity_delete', 'models', 'dangerous'),

  action('template.list', 'template', 'template_list', 'templates', 'read'),
  action('template.save', 'template', 'template_save', 'templates'),
  action('template.duplicate', 'template', 'template_duplicate', 'templates'),
  action('template.delete', 'template', 'template_delete', 'templates', 'dangerous'),

  action('production.listTasks', 'production', 'production_task_list', 'production-tasks', 'read'),
  action('production.createBatch', 'production', 'production_batch_create', 'production'),
  action('production.retryTask', 'production', 'production_task_retry', 'production-tasks', 'write', 'hermesTaskTools'),
  action('production.cancelTask', 'production', 'production_task_cancel', 'production-tasks', 'dangerous', 'hermesTaskTools'),
  action('production.removeTask', 'production', 'production_task_remove', 'production-tasks', 'dangerous', 'hermesTaskTools'),
  action('production.controlQueue', 'production', 'production_queue_control', 'production-tasks', 'dangerous'),
  action('production.readRun', 'production', 'run_get', 'production-tasks', 'read'),

  action('publishing.list', 'publishing', 'publisher_list', 'publisher', 'read'),
  action('publishing.readConfig', 'publishing', 'publisher_config_get', 'publisher', 'read', 'hermesPublisherTools'),
  action('publishing.listCloudPhones', 'publishing', 'publisher_cloud_phone_list', 'publisher', 'read', 'hermesPublisherTools'),
  action('publishing.listCandidates', 'publishing', 'publisher_candidate_list', 'publish-center', 'read', 'hermesPublisherTools'),
  action('publishing.listMusic', 'publishing', 'publisher_music_list', 'publisher', 'read', 'hermesPublisherTools'),
  action('publishing.readTask', 'publishing', 'publisher_task_get', 'publish-center', 'read', 'hermesPublisherTools'),
  action('publishing.saveAccount', 'publishing', 'publisher_account_save', 'publisher', 'dangerous', 'hermesPublisherTools'),
  action('publishing.deleteAccount', 'publishing', 'publisher_account_delete', 'publisher', 'dangerous', 'hermesPublisherTools'),
  action('publishing.saveMusic', 'publishing', 'publisher_music_save', 'publisher', 'write', 'hermesPublisherTools'),
  action('publishing.deleteMusic', 'publishing', 'publisher_music_delete', 'publisher', 'dangerous', 'hermesPublisherTools'),
  action('publishing.syncTask', 'publishing', 'publisher_task_sync', 'publish-center', 'write', 'hermesPublisherTools'),
  action('publishing.publishVideo', 'publishing', 'video_publish', 'publish-center', 'dangerous'),

  action('artifact.list', 'artifact', 'artifact_list', 'production-tasks', 'read'),
  action('artifact.export', 'artifact', 'artifact_export', 'production-tasks'),
]
