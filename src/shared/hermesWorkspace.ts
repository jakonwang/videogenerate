export const HERMES_WORKSPACE_IDS = [
  'home',
  'models',
  'products',
  'product-detail',
  'clone-projects',
  'clone-project',
  'production',
  'production-tasks',
  'production-task',
  'templates',
  'live-slicer',
  'plugins',
  'live-photo',
  'product-materials',
  'tiktok-creative',
  'tiktok-listing',
  'video-downloads',
  'video-subtitles',
  'publisher',
  'publish-center',
  'settings',
] as const

export type HermesWorkspaceId = typeof HERMES_WORKSPACE_IDS[number]

export type HermesWorkspaceDefinition = {
  id: HermesWorkspaceId
  name: string
  description: string
  routeName: string
  entityParam?: 'productId' | 'projectId' | 'taskId'
}

export type HermesWorkspaceAction = {
  id: string
  workspaceId: HermesWorkspaceId
  route: {
    name: string
    params?: Record<string, string>
    query?: Record<string, string>
  }
  createdAt: number
}

export const HERMES_SETTINGS_SECTIONS = [
  'appearance',
  'platforms',
  'capabilities',
  'hermes-runtime',
  'hermes-skills',
  'hermes-channels',
  'hermes-data',
  'qiniu',
] as const

export type HermesSettingsSection = typeof HERMES_SETTINGS_SECTIONS[number]

export const HERMES_WORKSPACES: readonly HermesWorkspaceDefinition[] = [
  { id: 'home', name: 'Hermes workspace', description: 'Open the Hermes conversation workspace.', routeName: 'home' },
  { id: 'models', name: 'Model library', description: 'Manage reusable model identities and reference assets.', routeName: 'models' },
  { id: 'products', name: 'Product library', description: 'Browse and manage products and product reference assets.', routeName: 'products' },
  { id: 'product-detail', name: 'Product detail', description: 'Open one product and its reference assets.', routeName: 'product-detail', entityParam: 'productId' },
  { id: 'clone-projects', name: 'Clone projects', description: 'Browse commerce video clone projects.', routeName: 'clone' },
  { id: 'clone-project', name: 'Clone project', description: 'Open one commerce video clone project.', routeName: 'clone-project', entityParam: 'projectId' },
  { id: 'production', name: 'Production center', description: 'Open the production overview and task launcher.', routeName: 'production' },
  { id: 'production-tasks', name: 'Production tasks', description: 'Browse production tasks and results.', routeName: 'production-tasks' },
  { id: 'production-task', name: 'Production task', description: 'Open one production task.', routeName: 'production-task-detail', entityParam: 'taskId' },
  { id: 'templates', name: 'Template library', description: 'Manage production, audio, visual, and subtitle templates.', routeName: 'templates' },
  { id: 'live-slicer', name: 'Live slicer', description: 'Open the long-video slicing workspace.', routeName: 'live-slicer' },
  { id: 'plugins', name: 'Plugin center', description: 'Browse installed and available VideoGenerate plugins.', routeName: 'plugins' },
  { id: 'live-photo', name: 'Live Photo', description: 'Create, review, and export Live Photo outputs.', routeName: 'plugin-live-photo-generator' },
  { id: 'product-materials', name: 'Product image materials', description: 'Prepare and browse reusable product image materials.', routeName: 'plugin-product-image-materials' },
  { id: 'tiktok-creative', name: 'TikTok Creative Studio', description: 'Open the TikTok creative production workspace.', routeName: 'plugin-tiktok-creative-studio' },
  { id: 'tiktok-listing', name: 'TikTok listing helper', description: 'Generate and export TikTok product listing records.', routeName: 'plugin-tiktok-listing-helper' },
  { id: 'video-downloads', name: 'Video downloads', description: 'Import and browse downloaded source videos.', routeName: 'plugin-video-parser-download' },
  { id: 'video-subtitles', name: 'Video subtitles', description: 'Generate and package subtitles for local videos.', routeName: 'plugin-video-batch-subtitle' },
  { id: 'publisher', name: 'Publisher', description: 'Manage publishing accounts and publishing entry points.', routeName: 'plugin-geelark-publisher' },
  { id: 'publish-center', name: 'Publish center', description: 'Prepare and submit approved publishing jobs.', routeName: 'plugin-geelark-publish-center' },
  { id: 'settings', name: 'Settings', description: 'Manage application, Hermes, model, channel, skill, and theme settings.', routeName: 'settings' },
]
