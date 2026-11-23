/**
 * 服务器复刻引擎：网页传来的复刻参数里的 AI 密钥、平台地址、七牛设置、图片平台选择一律去掉，
 * 引擎只用父进程下发的凭据（云端 AI 代理 + 这个子进程的代理令牌）。
 * 否则网页页面带的掩码密钥（••••1234）会盖掉真密钥，改过的平台地址还会把代理令牌发到别的服务器。
 */
const CREDENTIAL_FIELD = /^(imageProviderPrimary|imageProviderCredentials|apifoxHub|baseUrl|apiKey|[a-zA-Z]+(ApiKey|Host|BaseUrl|AccessKey|SecretKey)|qiniu[A-Z][a-zA-Z]*)$/

export function stripCredentialOverrides(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCredentialOverrides)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !CREDENTIAL_FIELD.test(key))
      .map(([key, item]) => [key, stripCredentialOverrides(item)]),
  )
}
