import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { shell } from 'electron'
import type { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { GMV_MAX_CALLBACK_URL, type GmvMaxOAuthSecrets } from './types'
import { gmvMaxAuthStore } from './authStore'

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

type CallbackResult = { code: string }

export function validateGmvMaxOAuthCallback(url: URL, expectedState: string): CallbackResult {
  const error = url.searchParams.get('error')
  if (error) throw new Error(`TikTok authorization failed: ${error}`)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || state !== expectedState) throw new Error('TikTok authorization state validation failed.')
  return { code }
}

export class GmvMaxOAuthProvider implements OAuthClientProvider {
  private secrets: GmvMaxOAuthSecrets = {}
  private callbackPromise: Promise<CallbackResult> | null = null
  private callbackServer: Server | null = null
  private readonly oauthState = randomUUID()

  constructor(private readonly connectionId: string, private readonly interactive: boolean) {}

  async initialize() {
    this.secrets = await gmvMaxAuthStore.read(this.connectionId)
  }

  get redirectUrl() {
    return GMV_MAX_CALLBACK_URL
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'VideoGenerate GMV MAX Optimizer',
      redirect_uris: [GMV_MAX_CALLBACK_URL],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp:tt4b',
    }
  }

  state() {
    return this.oauthState
  }

  clientInformation() {
    return this.secrets.clientInformation as OAuthClientInformationMixed | undefined
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    this.secrets.clientInformation = clientInformation as unknown as Record<string, unknown>
    await this.persist()
  }

  tokens() {
    return this.secrets.tokens as OAuthTokens | undefined
  }

  async saveTokens(tokens: OAuthTokens) {
    const expiresIn = Number(tokens.expires_in || 0)
    this.secrets.tokens = {
      ...tokens,
      ...(expiresIn > 0 ? { expires_at: Date.now() + expiresIn * 1000 } : {}),
    } as unknown as Record<string, unknown>
    await this.persist()
  }

  async redirectToAuthorization(authorizationUrl: URL) {
    if (!this.interactive) return
    this.callbackPromise = this.startCallbackServer()
    await shell.openExternal(authorizationUrl.toString())
  }

  async waitForCallback() {
    if (!this.callbackPromise) throw new Error('TikTok authorization was not started.')
    return await this.callbackPromise
  }

  async saveCodeVerifier(codeVerifier: string) {
    this.secrets.codeVerifier = codeVerifier
    await this.persist()
  }

  codeVerifier() {
    if (!this.secrets.codeVerifier) throw new Error('TikTok OAuth code verifier is missing.')
    return this.secrets.codeVerifier
  }

  async saveDiscoveryState(state: OAuthDiscoveryState) {
    this.secrets.discoveryState = state as unknown as Record<string, unknown>
    await this.persist()
  }

  discoveryState() {
    return this.secrets.discoveryState as OAuthDiscoveryState | undefined
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all') this.secrets = {}
    if (scope === 'client') delete this.secrets.clientInformation
    if (scope === 'tokens') delete this.secrets.tokens
    if (scope === 'verifier') delete this.secrets.codeVerifier
    if (scope === 'discovery') delete this.secrets.discoveryState
    await this.persist()
  }

  closeCallbackServer() {
    this.callbackServer?.close()
    this.callbackServer = null
    this.callbackPromise = null
  }

  tokenExpiresAt() {
    return Number((this.secrets.tokens as any)?.expires_at || 0) || undefined
  }

  private async persist() {
    await gmvMaxAuthStore.write(this.connectionId, this.secrets)
  }

  private startCallbackServer(): Promise<CallbackResult> {
    if (this.callbackServer) throw new Error('TikTok authorization is already in progress.')
    return new Promise((resolve, reject) => {
      const callbackUrl = new URL(GMV_MAX_CALLBACK_URL)
      let settled = false
      let timeout: NodeJS.Timeout | null = null
      const finish = (error?: Error, result?: CallbackResult) => {
        if (settled) return
        settled = true
        if (timeout) clearTimeout(timeout)
        this.callbackServer?.close()
        this.callbackServer = null
        if (error) reject(error)
        else if (result) resolve(result)
      }
      const server = createServer((request, response) => {
        const url = new URL(request.url || '/', GMV_MAX_CALLBACK_URL)
        if (url.pathname !== callbackUrl.pathname) {
          response.writeHead(404).end('Not found')
          return
        }
        let result: CallbackResult
        try {
          result = validateGmvMaxOAuthCallback(url, this.oauthState)
        } catch (error) {
          response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>Invalid authorization response</h1><p>Return to VideoGenerate.</p>')
          finish(error instanceof Error ? error : new Error(String(error)))
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>Authorization complete</h1><p>You can close this window and return to VideoGenerate.</p>')
        finish(undefined, result)
      })
      this.callbackServer = server
      server.on('error', (error: NodeJS.ErrnoException) => {
        const message = error.code === 'EADDRINUSE' ? 'TikTok OAuth callback port 17863 is already in use.' : error.message
        finish(new Error(message))
      })
      server.listen(Number(callbackUrl.port), callbackUrl.hostname)
      timeout = setTimeout(() => finish(new Error('TikTok authorization timed out after five minutes.')), CALLBACK_TIMEOUT_MS)
    })
  }
}
