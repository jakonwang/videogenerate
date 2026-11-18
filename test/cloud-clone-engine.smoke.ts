/**
 * 服务器复刻引擎：网页调用复刻功能（和电脑端页面同名同参数）在服务器上执行，项目与电脑端双向同步。
 * Real cloud server + per-user engine worker + a simulated desktop (the desktop's own clone repo and sync bridge).
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

const root = mkdtempSync(join(tmpdir(), 'vg-clone-engine-'))
// This process plays the desktop: its clone data lives here.
process.env.VIDEOGENERATE_USER_DATA_DIR = join(root, 'desktop')
process.env.VIDEOGENERATE_DATA_DIR = join(root, 'desktop', 'data')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until<T>(label: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 60_000): Promise<T> {
  const started = Date.now()
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() - started > timeoutMs) throw new Error(`timed out: ${label}`)
    await sleep(500)
  }
}

async function main() {
  const { createCloudApp } = await import('../services/cloud/src/app')
  const { createCloudClient, CloudClientError } = await import('../src/shared/cloud/client')
  const { cloudFileRef } = await import('../src/shared/cloud/relay')
  const { SYNC_COLLECTIONS } = await import('../src/shared/cloud/sync')
  const { getFfmpegExecutable } = await import('../src/main/lib/binariesPath')

  const keyPath = join(root, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  const app = createCloudApp({ dataDir: join(root, 'cloud'), dbPath: join(root, 'cloud', 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, cloneEngineAllowMock: true, port: 0 })
  const port = await app.listen()
  const base = `http://127.0.0.1:${port}`
  try {
    let token = ''
    const web = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
    await web.register({ account: 'engine@example.com', password: 'password-123' })
    token = (await web.login({ account: 'engine@example.com', password: 'password-123', client: 'web' } as any)).sessionToken
    // Not a member yet: the server engine is for members only.
    await assert.rejects(web.relay.call('clone', 'listProjectSummaries', [{}]), (error: any) => error instanceof CloudClientError && error.code === 'NO_ENTITLEMENT')
    const plans = await web.listPlans()
    const order = await web.createOrder({ planCode: plans.plans[0].code, channel: 'mock' })
    await web.mockPay(order.order.orderNo)

    // 1) No computer online: clone still works, on the server.
    assert.equal((await web.relay.status()).online, false)
    const created = await web.relay.call<any>('clone', 'createDraftProject', [{ locale: 'zh-CN', title: '服务器上的复刻' }])
    const projectId = created.project?.id ?? created.id
    assert.ok(projectId, 'project created on the server')
    const list = await web.relay.call<any[]>('clone', 'listProjectSummaries', [{}])
    assert.ok(list.some((item) => item.id === projectId && item.title === '服务器上的复刻'), 'listed with the desktop summary shape')
    console.log('✓ web creates and lists a clone project on the server engine without a computer')

    // 2) Reference video picked on the web: uploaded to the cloud, the engine downloads and binds it.
    const video = join(root, 'ref.mp4')
    const ff = spawnSync(getFfmpegExecutable(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=25', '-t', '2', '-pix_fmt', 'yuv420p', video])
    assert.equal(ff.status, 0, String(ff.stderr))
    const { fileId } = await web.sync.uploadFile(readFileSync(video), 'video/mp4')
    const bound = await web.relay.call<any>('clone', 'bindProjectReferenceVideo', [{ cloneProjectId: projectId, videoPath: cloudFileRef(fileId, 'ref.mp4') }])
    const boundProject = bound.project ?? bound
    const serverPath = String(boundProject.referenceVideoPath || '')
    assert.ok(serverPath.includes('clone-engine'), `reference stored in the user's engine folder (${serverPath})`)
    const shown = await web.relay.call<any>('media', 'publish', [{ path: serverPath, width: 320 }])
    assert.ok(/^[a-f0-9]{64}$/.test(shown.fileId) && shown.mime === 'image/jpeg', 'engine files are shown on the web via the cloud (video poster)')
    // Another user's path is never served by this user's engine.
    await assert.rejects(web.relay.call('media', 'publish', [{ path: serverPath.replace(/clone-engine[\\/][^\\/]+/, 'clone-engine/someone-else') }]))
    // Paths outside the user's own engine folder are refused (other users' data, server files).
    await assert.rejects(web.relay.call('clone', 'bindProjectReferenceVideo', [{ cloneProjectId: projectId, videoPath: video }]), /只能使用自己上传的文件/)
    await assert.rejects(web.relay.call('clone', 'bindProjectReferenceVideo', [{ cloneProjectId: projectId, videoPath: serverPath + '/../../../../../cloud.sqlite' }]), /只能使用自己上传的文件/)
    // Keys are the administrator's: never readable from the web.
    await assert.rejects(web.relay.call('clone', 'getModelCredentials', []), (error: any) => error instanceof CloudClientError && error.code === 'DESKTOP_OFFLINE')
    console.log('✓ reference video from the web bound on the server; previews and path isolation OK')

    // 3) The project reaches the computer.
    const record = await until('clone workspace record', async () => {
      const page = await web.sync.pull(0, [SYNC_COLLECTIONS.cloneWorkspaces])
      return page.changes.find((change) => change.id === projectId && !change.deleted && (change.data as any)?.files?.length) as any
    })
    assert.equal(record.data.origin, 'server')
    const { syncCloneWorkspaces, defaultCloneStore } = await import('../src/main/modules/cloud-sync/cloneBridge')
    const { cloneRepo } = await import('../src/main/modules/clone/repo')
    const desktopSession = { client: web, userId: record.data ? (await web.me()).user.id : '', canWrite: true }
    const ids = { productToCloud: () => undefined, productToLocal: () => undefined, modelToCloud: () => undefined, modelToLocal: () => undefined }
    const options = { origin: 'desktop' as const, store: await defaultCloneStore(), ids }
    const first = await syncCloneWorkspaces(desktopSession, options)
    assert.ok(first.pulled >= 1, 'desktop pulled the server project')
    const onDesktop = await cloneRepo.getProject(projectId)
    assert.equal(onDesktop?.title, '服务器上的复刻')
    assert.ok(onDesktop?.referenceVideoPath.startsWith(join(root, 'desktop')), `reference path rewritten to this computer (${onDesktop?.referenceVideoPath})`)
    assert.ok(existsSync(onDesktop!.referenceVideoPath), 'reference video downloaded to the computer')
    console.log('✓ server project synced to the computer with its files')

    // 4) Edited on the computer → the server sees it.
    await cloneRepo.upsertProject({ ...onDesktop!, title: '电脑上改的标题' })
    await sleep(20)
    const second = await syncCloneWorkspaces(desktopSession, options)
    assert.ok(second.pushed >= 1, 'desktop pushed its edit')
    const renamed = await until('server sees the desktop edit', async () => {
      await sleep(10_500) // the engine pulls before reads at most every 10 s
      const items = await web.relay.call<any[]>('clone', 'listProjectSummaries', [{}])
      return items.find((item) => item.id === projectId && item.title === '电脑上改的标题')
    }, 40_000)
    assert.ok(renamed)
    console.log('✓ edit made on the computer shows on the web (server engine)')

    // 5) Desktop-made project shows up on the server.
    const local = await cloneRepo.createProject({ locale: 'zh-CN', strength: 'structure', referenceVideoPath: video, referenceVideoName: 'ref.mp4', title: '电脑上新建的复刻' })
    await syncCloneWorkspaces(desktopSession, options)
    const fromDesktop = await until('desktop project on the server', async () => {
      await sleep(10_500)
      const items = await web.relay.call<any[]>('clone', 'listProjectSummaries', [{}])
      return items.find((item) => item.id === local.id)
    }, 40_000)
    assert.equal(fromDesktop.title, '电脑上新建的复刻')
    const serverCopy = await web.relay.call<any>('clone', 'getProject', [{ cloneProjectId: local.id }])
    assert.ok(String(serverCopy.referenceVideoPath || serverCopy.project?.referenceVideoPath).includes('clone-engine'), 'desktop paths rewritten to the server')
    console.log('✓ project made on the computer opens on the web')

    // 6) Deleted on the web → removed on the computer.
    await web.relay.call('clone', 'removeProject', [{ cloneProjectId: local.id, force: true }])
    await until('deletion reaches the computer', async () => {
      await sleep(2_500)
      await syncCloneWorkspaces(desktopSession, options)
      return !(await cloneRepo.getProject(local.id))
    }, 40_000)
    console.log('✓ deletion on the web reaches the computer')
    console.log('cloud clone engine smoke test passed')
  } finally {
    await app.close()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
