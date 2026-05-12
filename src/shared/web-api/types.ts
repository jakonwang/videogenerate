export type WebUser = {
  id: string
  phone: string
  displayName: string
  status: 'active' | 'disabled'
  createdAt: number
  updatedAt: number
}

export type UserSubscription = {
  userId: string
  planId: string
  planName: string
  status: 'inactive' | 'active' | 'expired'
  startedAt?: number
  expiresAt?: number
  updatedAt: number
}

export type WalletAccount = {
  userId: string
  balanceCredits: number
  totalChargedCredits: number
  totalRefundedCredits: number
  updatedAt: number
}

export type SubscriptionPlan = {
  id: string
  name: string
  priceCny: number
  durationDays: number
  monthlyComputeCredits: number
  enabled: boolean
}

export type BillingOrder = {
  id: string
  userId: string
  type: 'subscription' | 'compute_pack'
  planId?: string
  planName?: string
  amountCny: number
  credits?: number
  paymentChannel: 'mock_wechat' | 'mock_alipay'
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  createdAt: number
  updatedAt: number
  paidAt?: number
}

export type WalletTransaction = {
  id: string
  userId: string
  type: 'topup' | 'subscription_purchase' | 'compute_reserve' | 'compute_charge' | 'compute_refund'
  amountCredits: number
  balanceAfter: number
  note: string
  relatedOrderId?: string
  relatedProjectId?: string
  relatedAction?: string
  createdAt: number
}

export type CloneProjectSummary = {
  id: string
  title: string
  description?: string
  archived?: boolean
  status: string
  createdAt: number
  updatedAt: number
  currentStep: string
  progressPercent: number
  referenceVideoName: string
  referenceVideoPath: string
  coverAssetPath: string
  previewOutputPath: string
  previewReportPath: string
  outputDir: string
  finalOutputPath: string
  selectedModelIdentityName: string
  productReferenceImageCount: number
  shotCount: number
  generatedImageCount: number
  generatedVideoCount: number
  lastError: string
}

export type CloneRuntimeResponse = {
  pipeline: any
  wallet: WalletAccount
  recentBillingLogs: WalletTransaction[]
}

export type CloneModelIdentitySummary = {
  id: string
  name: string
  status: 'idle' | 'generating' | 'done' | 'failed'
  productType: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
  coverImagePath?: string
  imagePaths: string[]
  description: string
  updatedAt: number
}

export type CloneWorkflowStep =
  | 'upload_analyze_script'
  | 'model_product_consistency'
  | 'storyboard_video_generation'
  | 'export_final'
  | 'generate_script_variants'
  | 'select_script_variant'
  | 'generate_storyboard_grids'
  | 'generate_shot_videos'
  | 'review_replace_shots'
  | 'compose_final_video'

export type DesktopReleaseItem = {
  version: string
  releaseNotes: string
  downloadUrl: string
  publishedAt?: string
  isMandatory?: boolean
  platform?: string
}

export type DesktopReleaseInfo = {
  latest: DesktopReleaseItem | null
  items: DesktopReleaseItem[]
}
