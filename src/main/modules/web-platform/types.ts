export type WebUserStatus = 'active' | 'disabled'
export type SubscriptionStatus = 'inactive' | 'active' | 'expired'
export type WalletTransactionType =
  | 'topup'
  | 'subscription_purchase'
  | 'compute_reserve'
  | 'compute_charge'
  | 'compute_refund'
export type BillingAction =
  | 'analyze_reference'
  | 'generate_script_variants'
  | 'generate_storyboard_images'
  | 'generate_shot_videos'
  | 'compose_final_video'

export type WebUploadPurpose = 'clone_reference_video' | 'clone_product_image'

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

export type WebUser = {
  id: string
  phone: string
  displayName: string
  status: WebUserStatus
  createdAt: number
  updatedAt: number
}

export type WebSession = {
  token: string
  userId: string
  createdAt: number
  updatedAt: number
  expiresAt: number
}

export type SubscriptionPlan = {
  id: string
  name: string
  priceCny: number
  durationDays: number
  monthlyComputeCredits: number
  enabled: boolean
}

export type UserSubscription = {
  userId: string
  planId: string
  planName: string
  status: SubscriptionStatus
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

export type WalletTransaction = {
  id: string
  userId: string
  type: WalletTransactionType
  amountCredits: number
  balanceAfter: number
  note: string
  relatedOrderId?: string
  relatedProjectId?: string
  relatedAction?: BillingAction
  createdAt: number
}

export type BillingOrderType = 'subscription' | 'compute_pack'
export type BillingOrderStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export type BillingOrder = {
  id: string
  userId: string
  type: BillingOrderType
  planId?: string
  planName?: string
  amountCny: number
  credits?: number
  paymentChannel: 'mock_wechat' | 'mock_alipay'
  status: BillingOrderStatus
  createdAt: number
  updatedAt: number
  paidAt?: number
}

export type ComputePriceRule = {
  action: BillingAction
  credits: number
}

export type WebPlatformDb = {
  users: WebUser[]
  sessions: WebSession[]
  subscriptions: UserSubscription[]
  wallets: WalletAccount[]
  walletTransactions: WalletTransaction[]
  orders: BillingOrder[]
  subscriptionPlans: SubscriptionPlan[]
  computePriceRules: ComputePriceRule[]
}

export type WebUploadFileInput = {
  fileName: string
  base64Data: string
  mimeType?: string
}

export type WebAuthLoginInput = {
  phone: string
  code: string
  displayName?: string
}

export type WebAuthLoginResult = {
  token: string
  user: WebUser
  subscription: UserSubscription
  wallet: WalletAccount
}
