// -*- coding: utf-8 -*-
// Muse product swap, prompt versions, style reference batches and account order. No network, no browser.
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMuseAccounts } from '../src/main/modules/muse-creative-studio/accounts'
import { MuseGenerateError } from '../src/main/modules/muse-creative-studio/generate'
import type { MusePrepareImage } from '../src/main/modules/muse-creative-studio/images'
import { MUSE_TEXTS, translateMuse } from '../src/renderer/src/locales/muse/dictionary'
import { createMuseService } from '../src/main/modules/muse-creative-studio/service'

async function main() {
  // Every text used by the Muse pages exists in all languages.
  const dir = join(__dirname, '../src/renderer/src/ui')
  const pages = [...(await readdir(join(dir, 'components/muse'))).map((name) => join(dir, 'components/muse', name)), join(dir, 'views/MuseCreativeStudioView.vue')]
  let texts = 0
  for (const page of pages) {
    for (const match of (await readFile(page, 'utf8')).matchAll(/\bm\('((?:[^'\\]|\\.)*)'/g)) {
      texts += 1
      const entry = MUSE_TEXTS[match[1]]
      assert.ok(entry?.['en-US'] && entry['vi-VN'], `missing translation: ${match[1]}`)
    }
  }
  assert.ok(texts > 200)
  for (const [zh, entry] of Object.entries(MUSE_TEXTS)) {
    const holes = (text: string) => (text.match(/\{\d\}/g) ?? []).sort().join()
    for (const text of [entry['en-US'], entry['vi-VN']]) assert.equal(holes(text), holes(zh), zh)
  }
  assert.equal(translateMuse('换图失败：provider down', 'en-US'), 'Swap failed: provider down')
  assert.equal(translateMuse('我的手链', 'vi-VN'), '我的手链', 'product names are left alone')
  assert.equal(translateMuse('{0} 条任务', 'zh-CN', [3]), '3 条任务')

  const root = await mkdtemp(join(tmpdir(), 'muse-images-'))
  const image = join(root, 'ref.png')
  const swapped = join(root, 'swapped.png')
  const closing = join(root, 'closing.png')
  const closingSwapped = join(root, 'closing-swapped.png')
  const lastFrames: string[] = []
  const details: string[][] = []
  await writeFile(image, 'reference')
  await writeFile(swapped, 'swapped')
  await writeFile(closing, 'closing')
  await writeFile(closingSwapped, 'closing swapped')

  type Call = Parameters<MusePrepareImage>[0]
  const calls: Call[] = []
  const sent: string[] = []
  let answer: (call: Call) => Promise<Awaited<ReturnType<MusePrepareImage>>> = async () => ({ pending: false, preparedImagePath: swapped, state: { replacementRegion: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, revision: 1 }, productSnapshot: { id: 'p1' } } })
  const vault = { encrypt: (v: string) => v, decrypt: (v: string) => v }
  const accounts = createMuseAccounts({ path: () => join(root, 'accounts.json'), vault })
  const make = () => createMuseService({
    accounts,
    checkExit: async () => ({ ip: '203.0.113.7', country: 'US', museReachable: true, checkedAt: Date.now() }),
    checkSession: async () => ({ state: 'ready' }),
    readQuota: async () => { throw new Error('not used') },
    login: async () => [],
    generate: async (input) => {
      await input.onStage('submitting')
      if (input.lastFramePath) lastFrames.push(await readFile(input.lastFramePath, 'utf8'))
      details.push(await Promise.all((input.detailImagePaths ?? []).map((path) => readFile(path, 'utf8'))))
      sent.push(`${await readFile(input.imagePath!, 'utf8')}|${input.prompt}`)
      if (input.prompt.includes('REFUSE')) throw new MuseGenerateError('failed', 'no', 'refused')
      return { videoPath: swapped, width: 720, height: 1280, durationSec: 10, bytes: 1 }
    },
    jobsPath: () => join(root, 'jobs.json'),
    jobsRoot: () => join(root, 'jobs'),
    promptsPath: () => join(root, 'prompts.json'),
    probe: async () => ({ durationSec: 1 }),
    makePoster: async () => undefined,
    makeLastFrame: async () => swapped,
    renderSubtitles: async () => [],
    timing: { tickMs: 20, retryMs: 20 },
    imageTiming: { tickMs: 20, pollMs: 30 },
    prepareImage: async (call) => { calls.push(call); return await answer(call) },
    productName: async (id) => ({ p1: 'Ring', p2: 'Chain' } as Record<string, string>)[id] ?? null,
    productImages: async (id) => (id === 'p1' ? [swapped, closing, image, closing, join(root, 'gone.png')] : []),
    styleReference: async (id) => (id === 'style' ? { firstFramePath: image, lastFramePath: closing, firstLastPrompt: 'STYLE FIRST LAST', durationSec: 7.4, aspectRatio: '9:16', prompt: 'STYLE MOTION' } : null),
  })
  let service = make()
  const job = async (id: string) => (await service.listJobs()).jobs.find((item) => item.id === id)!
  const until = async (id: string, status: string) => {
    for (let i = 0; i < 200; i += 1) {
      const current = await job(id)
      if (current.status === status) return current
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`expected ${status}, got ${JSON.stringify(await job(id))}`)
  }
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const create = async (extra: object = {}) => (await service.createJobs({ imagePaths: [image], prompt: 'move', durationSec: 10, aspect: '9:16', productId: 'p1', swapProduct: true, ...extra }))[0]

  try {
    const account = await service.create({ name: 'one', proxy: 'http://u:p@h:1' })
    await service.importCookies({ id: account.id, cookieJson: JSON.stringify([{ name: 'hatch_sess', value: 's', domain: 'muse.ai' }]) })
    await service.setEnabled({ id: account.id, enabled: true })

    await assert.rejects(create({ productId: '' }), /选择商品/)
    await assert.rejects(create({ productId: 'nope' }), /商品不存在/)

    // --- swap, wait for the user, then send the swapped picture
    const first = await create()
    const review = await until(first.id, 'image_review')
    assert.equal(review.productName, 'Ring')
    assert.equal(review.image?.state, undefined, 'provider state stays out of the list')
    assert.equal(sent.length, 0, 'nothing reaches Muse before the picture is accepted')
    await service.approveImages([first.id])
    await until(first.id, 'completed')
    assert.equal(sent[0].split('|')[0], 'swapped')
    await assert.rejects(service.approveImages([first.id]), /没有可以确认/)

    // --- product detail pictures: own ones first, then the library, without repeats or missing files
    const detailed = await create({ swapProduct: false, useProductImages: true, detailImagePaths: [closingSwapped] })
    await until(detailed.id, 'completed')
    assert.deepEqual(details.pop(), ['closing swapped', 'swapped', 'closing'])
    assert.match(sent.pop()!, /4 张图片.*第 2 到第 4 张是同一个商品/)
    await assert.rejects(create({ swapProduct: false, useProductImages: true, productId: '' }), /先选择商品/)
    await assert.rejects(create({ swapProduct: false, useProductImages: true, productId: 'p2' }), /Chain.*没有可用的图片/)
    await assert.rejects(create({ swapProduct: false, detailImagePaths: [1, 2, 3, 4, 5].map((n) => join(root, `${n}.png`)) }), /细节图/)
    const batch3 = await service.createJobs({ imagePaths: [image, closing, closingSwapped], prompt: 'batch', durationSec: 5, aspect: '9:16' })
    assert.equal(batch3.length, 3, 'one video per reference picture')
    assert.ok(batch3.every((item) => !item.detailImagePaths && /第一帧/.test(item.sentPrompt)))
    for (const item of batch3) await until(item.id, 'completed')
    sent.splice(-3)
    details.splice(-3)
    await assert.rejects(create({ swapProduct: false, detailImagePaths: [join(root, 'gone.png')] }), /细节图不存在/)

    // --- without review it goes straight on
    await until((await create({ reviewImage: false })).id, 'completed')
    assert.equal(sent.length, 2)

    // --- remote image task: submitted once, then only polled with the saved task id
    calls.length = 0
    answer = async (call) => (call.state?.imageTaskId
      ? (calls.length < 4 ? { pending: true, state: call.state } : { pending: false, preparedImagePath: swapped, state: {} })
      : { pending: true, state: { imageTaskId: 't1' } })
    const remote = await create()
    await until(remote.id, 'image_review')
    assert.equal(calls.filter((call) => !call.state?.imageTaskId).length, 1, 'one paid submission')

    // --- failures: no automatic paid retry by default, then as configured
    calls.length = 0
    answer = async () => { throw new Error('provider down') }
    const failing = await create()
    assert.equal((await until(failing.id, 'image_review')).error, 'provider down')
    assert.equal(calls.length, 1)
    await service.saveSettings({ imageRetryLimit: 2 })
    calls.length = 0
    await until((await create()).id, 'image_review')
    assert.equal(calls.length, 3)
    await service.saveSettings({ imageRetryLimit: 0 })

    // --- product not found in the picture: draw the region; localisation must not run again
    answer = async () => { throw new Error('[replacement_region_required] Automatic product localization failed') }
    const region = await create()
    assert.match((await until(region.id, 'image_review')).error!, /框选/)
    await assert.rejects(service.approveImages([region.id]), /没有可以确认/)
    calls.length = 0
    answer = async (call) => ({ pending: false, preparedImagePath: swapped, state: call.state! })
    await assert.rejects(service.redoImage({ id: region.id, region: { x: 0, y: 0, width: 0, height: 0 } }), /无效/)
    await service.redoImage({ id: region.id, region: { x: 0.2, y: 0.3, width: 0.4, height: 0.4 } })
    await until(region.id, 'image_review')
    assert.equal((calls[0].state!.replacementRegion as { source: string }).source, 'manual')
    assert.ok(calls[0].state!.sceneInteraction)

    // --- stopping drops a late answer
    let release: () => void = () => undefined
    answer = async () => { await new Promise<void>((resolve) => { release = resolve }); return { pending: false, preparedImagePath: swapped, state: {} } }
    const late = await create({ reviewImage: false })
    await pause(80)
    await service.cancelJob(late.id)
    const sentBefore = sent.length
    release()
    await pause(100)
    assert.equal((await job(late.id)).status, 'cancelled')
    assert.equal(sent.length, sentBefore)

    // --- paused: no new paid swap; a restart never repeats a submission it is unsure about
    answer = async () => ({ pending: false, preparedImagePath: swapped, state: {} })
    await service.setQueuePaused(true)
    calls.length = 0
    const held = await create()
    await pause(150)
    assert.equal(calls.length, 0)
    assert.equal(await service.cancelQueuedJobs(), 1)
    const held2 = await create()
    const db = JSON.parse(await readFile(join(root, 'jobs.json'), 'utf8'))
    Object.assign(db.jobs.find((item: any) => item.id === held2.id).image, { submitting: true })
    Object.assign(db.jobs.find((item: any) => item.id === held.id), { status: 'swapping' })
    Object.assign(db.jobs.find((item: any) => item.id === held.id).image, { waiting: true, state: { imageTaskId: 't9' } })
    await service.stopJobs()
    await writeFile(join(root, 'jobs.json'), JSON.stringify(db))
    service = make()
    await service.resumeJobs()
    assert.match((await until(held2.id, 'image_review')).error!, /不确定是否已扣费/)
    await until(held.id, 'image_review')
    assert.equal(calls.length, 1, 'only the accepted task was polled')
    assert.equal((await service.listJobs()).paused, true)
    await service.setQueuePaused(false)

    // --- a Muse refusal keeps the swapped picture for the retry
    const refused = await create({ prompt: 'REFUSE', reviewImage: false })
    await until(refused.id, 'failed')
    calls.length = 0
    await service.retryJob(refused.id)
    await until(refused.id, 'queued').catch(() => undefined)
    await until(refused.id, 'failed')
    assert.equal(calls.length, 0, 'the paid picture is reused')

    // --- style reference: one video per product, always swapped, text from the clip
    const batch = await service.createJobs({ imagePaths: [], prompt: '', durationSec: 5, aspect: '1:1', styleReferenceId: 'style', productIds: ['p1', 'p2', 'p1'] })
    assert.deepEqual(batch.map((item) => [item.productName, item.durationSec, item.aspect, item.status]), [['Ring', 8, '9:16', 'swapping'], ['Chain', 8, '9:16', 'swapping']])
    assert.ok(batch[0].sentPrompt.startsWith('STYLE MOTION'))
    await assert.rejects(service.createJobs({ imagePaths: [], prompt: '', durationSec: 5, aspect: '9:16', styleReferenceId: 'style', productIds: [] }), /至少选择/)
    await assert.rejects(service.createJobs({ imagePaths: [], prompt: '', durationSec: 5, aspect: '9:16', styleReferenceId: 'gone', productIds: ['p1'] }), /不存在/)
    for (const item of batch) await until(item.id, 'image_review')
    assert.equal((await service.approveImages(batch.map((item) => item.id))).done, 2)
    for (const item of batch) await until(item.id, 'completed')

    // --- style reference with its closing frame: two swaps, one after the other
    const isClosing = async (call: Call) => (await readFile(call.referenceImagePath, 'utf8')) === 'closing'
    const swapBoth = async (call: Call) => ({ pending: false, preparedImagePath: (await isClosing(call)) ? closingSwapped : swapped, state: {} })
    const style = async (extra: object = {}) => (await service.createJobs({ imagePaths: [], prompt: '', durationSec: 5, aspect: '9:16', styleReferenceId: 'style', productIds: ['p1'], mode: 'first_last', ...extra }))[0]
    answer = swapBoth
    calls.length = 0
    const both = await style()
    assert.ok(both.sentPrompt.startsWith('STYLE FIRST LAST'))
    assert.match((await until(both.id, 'image_review')).preparedLastFramePath!, /closing-swapped/)
    assert.equal(calls.length, 2)
    assert.notEqual(calls[0].workflowId, calls[1].workflowId)
    // redoing one frame leaves the other alone
    await service.redoImage({ id: both.id, closing: true })
    await until(both.id, 'image_review')
    assert.equal(calls.length, 3)
    assert.ok(await isClosing(calls[2]))
    await service.redoImage({ id: both.id })
    await until(both.id, 'image_review')
    assert.equal(calls.length, 4, 'the finished closing frame is kept')
    await service.approveImages([both.id])
    await until(both.id, 'completed')
    assert.deepEqual(lastFrames, ['closing swapped'])

    // --- a closing frame that cannot be made falls back to the zoomed opening frame
    answer = async (call) => { if (await isClosing(call)) throw new Error('provider down'); return await swapBoth(call) }
    calls.length = 0
    const fallback = await style({ reviewImage: false })
    await until(fallback.id, 'completed')
    assert.deepEqual(lastFrames, ['closing swapped', 'swapped'])
    assert.equal(calls.length, 2, 'no second paid attempt')
    calls.length = 0
    const reviewed = await style()
    assert.match((await until(reviewed.id, 'image_review')).error!, /首帧放大/)
    await service.redoImage({ id: reviewed.id })
    await until(reviewed.id, 'image_review')
    assert.equal(calls.length, 3, 'redoing the opening frame does not pay for the failed closing frame again')
    await assert.rejects(service.redoImage({ id: region.id, closing: true }), /尾帧|待确认/)
    // --- a closing submission cut off by a restart is not repeated either
    await service.setQueuePaused(true)
    const cut = await style()
    const cutDb = JSON.parse(await readFile(join(root, 'jobs.json'), 'utf8'))
    const cutJob = cutDb.jobs.find((item: any) => item.id === cut.id)
    Object.assign(cutJob, { preparedImagePath: swapped })
    Object.assign(cutJob.image, { submitting: true })
    await service.stopJobs()
    await writeFile(join(root, 'jobs.json'), JSON.stringify(cutDb))
    service = make()
    await service.resumeJobs()
    assert.equal((await until(cut.id, 'image_review')).image?.lastFailed, true)
    await service.setQueuePaused(false)
    answer = swapBoth

    // --- the web and phone never see the proxy or an address
    const summaries = JSON.stringify(await service.listSummaries())
    assert.ok(!/proxy|exit|pinnedIp|203\.0\.113/.test(summaries), summaries)

    // --- prompt versions
    const videos = await service.listPrompts('video')
    assert.equal(videos.length, 3)
    assert.deepEqual((await service.listPrompts('video')).map((item) => item.id), videos.map((item) => item.id), 'seeded ids are stable')
    const copy = await service.copyPrompt({ kind: 'image', name: 'mine', prompt: 'SWAP IT' })
    await service.activatePrompt(copy.id)
    assert.equal((await service.listPrompts('image')).filter((item) => item.active).length, 1)
    assert.equal((await service.listPrompts('video')).filter((item) => item.active).length, 1, 'other kind untouched')
    calls.length = 0
    await until((await create()).id, 'image_review')
    assert.equal(calls[0].promptVersion.prompt, 'SWAP IT')
    const original = (await service.listPrompts('image')).find((item) => item.version === 1)!
    const back = await service.rollbackPrompt(original.id)
    assert.ok(back.active && back.prompt === original.prompt && back.version === 3)
    await assert.rejects(service.updatePrompt({ id: copy.id, prompt: ' ' }), /不能为空/)

    // --- account order
    const second = await service.create({ name: 'two', proxy: 'http://u:p@h:2' })
    await service.moveAccount({ id: second.id, step: -1 })
    assert.deepEqual((await service.list()).accounts.map((item) => item.name), ['two', 'one'])
    await service.moveAccount({ id: second.id, step: -1 })
    assert.deepEqual((await service.list()).accounts.map((item) => item.name), ['two', 'one'])
    console.log('muse-creative-images smoke passed')
  } finally {
    await service.stopJobs()
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1) })
