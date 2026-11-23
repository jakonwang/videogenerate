/**
 * 服务器复刻引擎：网页传来的 AI 密钥、平台地址、七牛设置、图片平台选择都要去掉，其余参数原样保留。
 */
import assert from 'node:assert/strict'
import { stripCredentialOverrides } from '../services/cloud/engine/credentialArgs'

const args = [
  {
    modelTaskId: 't1',
    productType: 'earrings',
    purpose: 'model_library',
    modelReferenceImagePaths: ['cloudfile:abc/ref.jpg'],
    modelProfileOptions: { gender: 'female', ageRange: '20-25' },
    imageProviderPrimary: 'openai',
    openaiApiKey: '••••1234',
    openaiImageModel: 'gpt-image-2',
    klingApiKey: 'sk-real',
    klingHost: 'https://evil.example',
    grsaiHost: 'https://evil.example',
    apifoxHub: { apiKey: 'k', baseUrl: 'https://evil.example' },
    imageProviderCredentials: { openaiApiKey: 'x', qiniuSecretKey: 'y' },
    qiniuAccessKey: 'ak',
    qiniuPrefix: 'p',
    nested: [{ apiKey: 'z', baseUrl: 'https://evil.example', keep: 1 }],
  },
  'plain-string',
]

const [cleaned, text] = stripCredentialOverrides(args) as [Record<string, unknown>, string]
assert.equal(text, 'plain-string')
assert.deepEqual(cleaned, {
  modelTaskId: 't1',
  productType: 'earrings',
  purpose: 'model_library',
  modelReferenceImagePaths: ['cloudfile:abc/ref.jpg'],
  modelProfileOptions: { gender: 'female', ageRange: '20-25' },
  openaiImageModel: 'gpt-image-2',
  nested: [{ keep: 1 }],
})
console.log('cloud-engine-credential-args smoke ok')
