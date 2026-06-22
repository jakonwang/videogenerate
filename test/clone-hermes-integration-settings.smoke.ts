import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-clone-hermes-settings-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DB_DIR = path.join(root, 'db')
  process.env.VIDEOGENERATE_OUTPUT_DIR = path.join(root, 'output')
  process.env.VIDEOGENERATE_TMP_DIR = path.join(root, 'tmp')

  const { cloneRepo } = await import('../src/main/modules/clone/repo')

  try {
    const defaults = await cloneRepo.getHermesIntegrationSettings()
    if (defaults.enabled !== false) throw new Error('expected default hermes integration disabled')
    if (defaults.feishu.receiveIdType !== 'open_id') throw new Error('expected default feishu receiveIdType open_id')

    const saved = await cloneRepo.setHermesIntegrationSettings({
      enabled: true,
      callbackBaseUrl: 'https://example.test/hermes',
      feishu: {
        enabled: true,
        appId: 'cli_123',
        appSecret: 'secret_123',
        defaultReceiveId: 'ou_123',
        receiveIdType: 'open_id',
      },
      wecom: {
        enabled: true,
        corpId: 'ww123',
        corpSecret: 'corp_secret',
        agentId: '1000002',
        defaultToUser: 'zhangsan',
      },
    })

    if (!saved.enabled) throw new Error('expected saved settings enabled')
    if (saved.feishu.appId !== 'cli_123') throw new Error('expected feishu app id persisted')
    if (saved.wecom.agentId !== '1000002') throw new Error('expected wecom agent id persisted')

    const reloaded = await cloneRepo.getHermesIntegrationSettings()
    if (reloaded.callbackBaseUrl !== 'https://example.test/hermes') throw new Error('expected callback base url persisted')
    if (reloaded.feishu.defaultReceiveId !== 'ou_123') throw new Error('expected feishu receive id persisted')
    if (reloaded.wecom.defaultToUser !== 'zhangsan') throw new Error('expected wecom default user persisted')

    console.log('clone hermes integration settings smoke test passed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
