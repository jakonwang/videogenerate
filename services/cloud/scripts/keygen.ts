/**
 * 生成授权令牌签名密钥对（Ed25519）。
 *   私钥：services/cloud/data/keys/entitlement-private.pem（仅放在服务器上，绝不提交）
 *   公钥：写入 src/shared/cloud/entitlementPublicKey.ts，随桌面端一起打包
 *
 * 用法：npm run cloud:keygen [-- --force]
 * 注意：换密钥后，旧版本桌面端将无法验证新令牌，需要同时发布新版本客户端。
 */
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { loadCloudConfig } from '../src/config'

const config = loadCloudConfig()
const force = process.argv.includes('--force')
const privatePath = config.entitlementPrivateKeyPath
const clientFile = resolve(process.cwd(), 'src', 'shared', 'cloud', 'entitlementPublicKey.ts')

if (existsSync(privatePath) && !force) {
  console.error(`私钥已存在：${privatePath}\n如确定要轮换密钥，请加 --force（旧客户端将失效）。`)
  process.exit(1)
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

mkdirSync(dirname(privatePath), { recursive: true })
writeFileSync(privatePath, privatePem, { mode: 0o600 })
writeFileSync(join(dirname(privatePath), 'entitlement-public.pem'), publicPem)
writeFileSync(
  clientFile,
  `/** 由 npm run cloud:keygen 生成：桌面端用来验证云端签发的授权令牌。公钥可以公开。 */\nexport const ENTITLEMENT_PUBLIC_KEY_PEM = ${JSON.stringify(publicPem)}\n`,
)
console.log(`私钥：${privatePath}`)
console.log(`公钥已写入：${clientFile}`)
