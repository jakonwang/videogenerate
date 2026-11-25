// -*- coding: utf-8 -*-
// Muse image-to-video against a fake chat page behind a local proxy. Never contacts muse.ai.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import http from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import net, { type AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createMuseAccounts } from '../src/main/modules/muse-creative-studio/accounts'
import { createMuseService } from '../src/main/modules/muse-creative-studio/service'
import { checkMuseExit, checkMuseSession } from '../src/main/modules/muse-creative-studio/browser'
import { museQuotaUsedUp, museResetAt, parseMuseQuota, readMuseQuota } from '../src/main/modules/muse-creative-studio/quota'
import { runMuseVideo } from '../src/main/modules/muse-creative-studio/generate'
import { classifyMuseReply } from '../src/main/modules/muse-creative-studio/musePage'
import { probeMedia } from '../src/main/modules/ffmpeg/probe'

const ffmpeg = createRequire(__filename)('ffmpeg-static') as string

/** Chat page: an old video in history, upload via file input, send posts once, state lives on the server. */
const PAGE = `<!doctype html><meta charset="utf-8"><main><div id="chat"></div>
<aside><button aria-label="Send">Send</button></aside>
<div><button data-testid="hatch-dock-more" onclick="document.getElementById('menu').hidden=false">more</button><div id="menu" role="menu" hidden><div role="menuitem" onclick="openUsage()"><span>Settings</span><kbd>Ctrl+,</kbd></div></div><div id="att"></div><div><input type="file"><textarea></textarea><button id="send" aria-label="Send message" disabled>→</button></div></div></main>
<script>
const ta=document.querySelector('textarea'),fi=document.querySelector('input'),send=document.getElementById('send'),att=document.getElementById('att'),chat=document.getElementById('chat');
let file=null;
const upd=()=>{send.disabled=!ta.value||!file};ta.oninput=upd;
let sizes=[];fi.onchange=()=>{file=fi.files[0];sizes.push(file.size);att.innerHTML+='<button aria-label="Remove attachment">x</button>';upd()};
const el=(cls,html)=>'<div class="hatch-chat-groupable-bubble '+cls+'">'+html+'</div>';
const esc=s=>s.replace(/</g,'&lt;').replace(/\\n/g,'<br>');
const vid=u=>'<div data-testid="hatch-chat-attachment-presentation-video"><video muted src="'+u+'"></video></div>';
const image=()=>'<div data-testid="hatch-chat-attachment-presentation-video"><img src="/poster.png"></div>';
async function openUsage(){const t=await (await fetch('/usage')).text();const d=document.createElement('div');d.setAttribute('role','dialog');d.style.whiteSpace='pre';d.textContent=t;document.body.append(d)}
let shown='';
async function render(){
  const last=location.pathname.split('/').pop(),id=last==='new'?window.__id||last:last;
  const s=await (await fetch('/state?id='+id)).json();
  const html=vid('/old.mp4')+(s.prompt?el('chat-user-bubble',esc(s.prompt)+'<video src="/upload.mp4"></video>'):'')
    +(s.reply?el('hatch-agent-bubble-bg',esc(s.reply)):'')+(s.poster?image():'')+(s.video?vid(s.blob?await blob(s.video):s.video):'');
  if(s.undelivered&&!document.getElementById('ud')){const u=document.createElement('p');u.id='ud';u.textContent='Delivery not confirmed';document.body.append(u)}
  if(!s.undelivered)document.getElementById('ud')?.remove();
  if(html!==shown){shown=html;chat.innerHTML=html}
  let b=document.querySelector('[data-testid=hatch-composer-stop-button]');
  if(s.stop&&!b){b=document.createElement('button');b.dataset.testid='hatch-composer-stop-button';document.body.append(b)}
  if(!s.stop&&b)b.remove();
}
let cache;async function blob(u){return cache||(cache=URL.createObjectURL(await (await fetch(u)).blob()))}
setInterval(render,150);render();
send.onclick=async()=>{
  if(ta.value.includes('MODE_UNSENT'))return;
  const r=await (await fetch('/send',{method:'POST',body:JSON.stringify({prompt:ta.value,sizes})})).json();
  if(ta.value.includes('MODE_VANISH')){location.href='/blank';return}
  ta.value='';att.innerHTML='';file=null;upd();window.__id=r.id;history.pushState({},'',r.nothread?'/thread/new':'/thread/'+r.id);render();
};
</script>`

async function main() {
  assert.equal(classifyMuseReply('You have reached your weekly limit, try again later'), 'quota')
  assert.equal(classifyMuseReply('视频服务那边暂时过载了（503）'), 'busy')
  assert.equal(classifyMuseReply('I can’t generate this video because it violates our policy'), 'refused')
  assert.equal(classifyMuseReply('视频没生成成功，你所在的国家不支持'), 'refused')
  assert.equal(classifyMuseReply('Working on your video, it will be ready in a few minutes.'), 'other')

  // Anything unclear must be "other": a wrong "quota" sends again, a wrong "refused" invites a paid retry.
  for (const text of [
    '我会注意你的 usage limit 并开始生成', '视频正在生成，暂时无法提供预览，请稍候', '视频还没有生成完成，请稍等', '视频已生成，没有使用额外素材完成',
    '如果额度不足，我会告诉你', '没有使用额外素材完成', '未能保证完成效果', '额度不足时会自动停止', '你还没有达到上限', '我不能保证完全一致，会尽量生成', '服务繁忙，正在重试生成',
    'It is still rendering. I can’t provide a preview yet', 'I can’t generate it right away, but I’ll start now', 'I will keep an eye on your weekly limit',
    'If you are out of credits, I will tell you', "You haven't reached your weekly limit", 'Your video is ready. You have now reached your weekly limit.', "I can't guarantee the generated video matches exactly",
  ]) assert.equal(classifyMuseReply(text), 'other', text)
  for (const text of ['你的额度不足，无法生成视频', '本周额度已用完。', '你已达到本周使用上限', 'You are out of credits', "You've hit your daily limit.", "Quota exceeded. I can't generate this video.", 'You’ve run out of tokens', 'You have used up your weekly limit. If you upgrade, I can continue.']) assert.equal(classifyMuseReply(text), 'quota', text)
  for (const text of ['视频没生成成功', '抱歉，我无法生成这个视频', '视频生成失败', '未能完成视频制作', "I couldn't create that video", 'I am unable to generate this']) assert.equal(classifyMuseReply(text), 'refused', text)
  for (const text of ['服务繁忙，请稍后再试', '服务暂时不可用，请稍候重试', 'Service unavailable']) assert.equal(classifyMuseReply(text), 'busy', text)

  const zh = parseMuseQuota('设置\n用量\n免费计划\n每周上限将于 10月22日重置\n已使用 12.5%\n额外令牌\n永不过期\n已使用 0%（剩余 20 亿令牌）\n语言')!
  assert.ok(zh.lines!.includes('已使用 12.5%'))
  assert.ok(!parseMuseQuota('Usage\nme@example.com\n3% used')!.lines!.some((line) => line.includes('@')))
  assert.deepEqual({ ...zh, lines: undefined }, { lines: undefined, plan: '免费计划', weeklyUsedPct: 12.5, weeklyReset: '10月22日', extraUsedPct: 0, extraLeft: '剩余 20 亿令牌' })
  assert.equal(parseMuseQuota('設定\n用量\n免費計劃\n每星期上限會於 10月30日重設\n已用 ７%\n額外的符元\n已使用 0%')!.weeklyUsedPct, 7)
  assert.equal(parseMuseQuota('Profile\n99% used\nUsage\nFree plan\n0% used\nLanguage\n88% used')!.weeklyUsedPct, 0)
  for (const text of ['', 'Free plan', '101% used', 'Upgrade\n100% discount', 'Usage\nFree plan\nAdditional tokens\n0% used (2B tokens left)']) assert.equal(parseMuseQuota(text), null, text)
  assert.equal(museQuotaUsedUp({ weeklyUsedPct: 100, extraUsedPct: 0 }), false, 'extra tokens still usable')
  assert.equal(museQuotaUsedUp({ weeklyUsedPct: 100, extraUsedPct: 100 }), true)
  assert.equal(museQuotaUsedUp({ weeklyUsedPct: 100 }), true)

  const day = (y: number, mo: number, d: number, h = 0) => new Date(y, mo - 1, d, h).getTime()
  for (const [label, now, expected] of [
    ['10月22日', day(2026, 10, 20, 9), day(2026, 10, 22)], ['Oct 22', day(2026, 10, 20, 9), day(2026, 10, 22)], ['October 22, 2026', day(2026, 10, 20, 9), day(2026, 10, 22)],
    ['22 October', day(2026, 10, 20, 9), day(2026, 10, 22)], ['1月2日', day(2026, 12, 30, 9), day(2027, 1, 2)],
    ['10月22日', day(2026, 10, 22, 9), undefined], ['10月10日', day(2026, 10, 20), undefined], ['12月25日', day(2026, 10, 20), undefined], ['2月31日', day(2026, 2, 26), undefined], ['Monday', day(2026, 10, 20), undefined], [undefined, day(2026, 10, 20), undefined],
  ] as Array<[string | undefined, number, number | undefined]>) assert.equal(museResetAt(label, now), expected, String(label))

  const root = await mkdtemp(join(tmpdir(), 'muse-generate-'))
  const clip = (name: string, color: string) => {
    const path = join(root, name)
    const run = spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', `color=${color}:s=180x320:d=2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path])
    assert.equal(run.status, 0, String(run.stderr).slice(-300))
    return readFile(path)
  }
  const files: Record<string, Buffer> = { '/old.mp4': await clip('old.mp4', 'red'), '/upload.mp4': await clip('upload.mp4', 'green'), '/new.mp4': await clip('new.mp4', 'blue'), '/broken.mp4': Buffer.from('not a video') }
  const image = join(root, 'ref.png')
  await sharp({ create: { width: 90, height: 160, channels: 3, background: '#445566' } }).png().toFile(image)

  type Thread = { prompt: string; at: number; extra?: Record<string, unknown> }
  const threads = new Map<string, Thread>()
  let sends = 0
  let direct = 0
  let quotaOk = false
  let usage = ''
  let sentSizes: number[] = []
  let proxyDown = false
  const state = (thread?: Thread) => {
    if (!thread) return {}
    const t = Date.now() - thread.at
    const base = { prompt: thread.prompt }
    if (thread.extra) return { ...base, ...thread.extra }
    if (/MODE_BUSY/.test(thread.prompt)) return { ...base, reply: '视频服务那边暂时过载了（503）' }
    if (/MODE_QUOTA/.test(thread.prompt) && !quotaOk) return { ...base, reply: 'You are out of credits' }
    if (/MODE_UNDELIVERED/.test(thread.prompt)) return { ...base, stop: true, undelivered: true }
    if (/MODE_FLICKER/.test(thread.prompt)) return t < 600 ? { ...base, undelivered: true } : { ...base, reply: '已生成视频', video: t > 2500 ? '/new.mp4' : undefined }
    if (/MODE_NOTHREAD/.test(thread.prompt)) return base
    if (/MODE_PENDING/.test(thread.prompt)) return { ...base, reply: '视频正在生成，暂时无法提供预览，请稍候' }
    if (/MODE_LIMIT/.test(thread.prompt)) return { ...base, reply: '我会注意你的 usage limit 并开始生成' }
    if (/MODE_TEXT/.test(thread.prompt)) return { ...base, reply: 'Here are some ideas instead.' }
    if (/MODE_SLOW/.test(thread.prompt)) return { ...base, reply: 'Working on it' , stop: true }
    if (/MODE_BROKEN/.test(thread.prompt)) return { ...base, video: '/broken.mp4' }
    const done = t > 2500
    return { ...base, reply: t > 300 ? '已生成视频' : '', stop: t < 1200, poster: t > 1200 && !done, video: done ? '/new.mp4' : undefined, blob: /MODE_BLOB/.test(thread.prompt) }
  }
  const site = http.createServer((req, res) => {
    if (req.headers['x-via'] !== '1') direct += 1
    const url = new URL(req.url!, 'http://x')
    const json = (value: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)) }
    if (url.pathname === '/json') return json({ ip: '203.0.113.7', country: 'US' })
    if (url.pathname === '/api/session') { res.setHeader('set-cookie', 'hatch_sess=s1; Path=/'); return json({ status: 'assigned' }) }
    if (url.pathname === '/usage') return void res.end(usage)
    if (url.pathname === '/state') return json(state(threads.get(url.searchParams.get('id')!)))
    if (url.pathname === '/send') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        sends += 1
        const id = `t${sends}`
        sentSizes = JSON.parse(body).sizes
        threads.set(id, { prompt: JSON.parse(body).prompt, at: Date.now() })
        json({ id, nothread: /MODE_NOTHREAD/.test(JSON.parse(body).prompt) })
      })
      return
    }
    if (files[url.pathname]) {
      const data = files[url.pathname]
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '')
      res.setHeader('content-type', 'video/mp4')
      res.setHeader('accept-ranges', 'bytes')
      if (range) {
        const from = Number(range[1])
        const to = range[2] ? Number(range[2]) : data.length - 1
        res.writeHead(206, { 'content-range': `bytes ${from}-${to}/${data.length}` })
        return void res.end(data.subarray(from, to + 1))
      }
      return void res.end(data)
    }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(url.pathname === '/blank' ? '<p>blank</p>' : PAGE)
  })
  const sitePort = await new Promise<number>((resolve) => site.listen(0, '127.0.0.1', () => resolve((site.address() as AddressInfo).port)))
  const forward = (req: http.IncomingMessage, res: http.ServerResponse, path: string) => {
    const upstream = http.request({ host: '127.0.0.1', port: sitePort, path, method: req.method, headers: { ...req.headers, 'x-via': '1' } }, (answer) => {
      res.writeHead(answer.statusCode!, answer.headers)
      answer.pipe(res)
    })
    upstream.on('error', () => res.destroy())
    req.pipe(upstream)
  }
  const proxyServer = http.createServer((req, res) => { if (proxyDown) return void req.socket.destroy(); const u = new URL(req.url!); forward(req, res, u.pathname + u.search) })
  proxyServer.on('connect', (req, socket: net.Socket, head) => {
    socket.on('error', () => undefined)
    if (proxyDown) return void socket.destroy()
    if (!String(req.url).endsWith(':80')) { socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); return }
    socket.write('HTTP/1.1 200 OK\r\n\r\n')
    http.createServer((inner, res) => forward(inner, res, inner.url!)).emit('connection', socket)
    if (head.length) socket.unshift(head)
  })
  const proxyPort = await new Promise<number>((resolve) => proxyServer.listen(0, '127.0.0.1', () => resolve((proxyServer.address() as AddressInfo).port)))

  const museUrl = 'http://muse.ai/'
  const vault = { encrypt: (v: string) => Buffer.from(v).toString('base64'), decrypt: (v: string) => Buffer.from(v, 'base64').toString() }
  const accounts = createMuseAccounts({ path: () => join(root, 'accounts.json'), vault })
  const rendered: Array<{ ids: string[]; canvas: string }> = []
  const renderSubtitles: Parameters<typeof createMuseService>[0]['renderSubtitles'] = async (input) => {
    rendered.push({ ids: input.items.map((item) => item.id), canvas: `${input.canvas.width}x${input.canvas.height}` })
    if (input.titleConfig.singleText === 'FAIL') throw new Error('render broke')
    return await Promise.all(input.items.map(async (item) => {
      const videoPath = join(root, `sub-${item.id}-${rendered.length}.mp4`)
      await writeFile(videoPath, `subtitled ${input.titleConfig.singleText}`)
      return { id: item.id, videoPath }
    }))
  }
  const make = () => createMuseService({
    accounts,
    checkExit: (p) => checkMuseExit(p, { exitServices: ['http://exit.test/json'], museUrl }),
    checkSession: (p, c) => checkMuseSession(p, c, museUrl),
    login: async () => [],
    generate: runMuseVideo,
    readQuota: (p, c) => readMuseQuota(p, c, { museUrl, headless: true, readyMs: 8000, stepMs: 4000 }),
    makeLastFrame: async (first, dir, zoom) => { const path = join(dir, `last-${zoom}.png`); await writeFile(path, Buffer.concat([await readFile(first), Buffer.from([zoom])])); return path },
    makePoster: async (_video, poster) => { await writeFile(poster, 'jpg') },
    renderSubtitles,
    promptsPath: () => join(root, 'prompts.json'), prepareImage: async () => { throw new Error('not used') }, productName: async () => null, productImages: async () => [], styleReference: async () => null,
    probe: probeMedia,
    jobsPath: () => join(root, 'jobs.json'),
    jobsRoot: () => join(root, 'jobs'),
    timing: { tickMs: 100, retryMs: 150, recheckMs: 300 },
    generateOptions: { museUrl, headless: true, pollMs: 150, readyMs: 8000, sendConfirmMs: 2500, resultMs: 12_000, replySettleMs: 800, unknownReplyMs: 2000, undeliveredMs: 1500, noThreadMs: 2500 },
  })
  let service = make()
  const job = async (id: string) => (await service.listJobs()).jobs.find((item) => item.id === id)!
  const until = async (id: string, done: (j: Awaited<ReturnType<typeof job>>) => boolean) => {
    for (let i = 0; i < 400; i += 1) {
      const current = await job(id)
      if (done(current)) return current
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('job did not settle')
  }
  const settled = (id: string) => until(id, (j) => j.status !== 'running' && j.status !== 'queued')
  const create = async (prompt: string, accountId?: string) => (await service.createJobs({ accountId, imagePaths: [image], prompt, durationSec: 5, aspect: '9:16' }))[0]

  const account = await service.create({ name: 'one', proxy: `http://127.0.0.1:${proxyPort}` })
  try {
    // No usable account: the job waits and nothing is sent.
    const blocked = await create('MODE_OK blocked')
    await new Promise((resolve) => setTimeout(resolve, 500))
    assert.equal((await job(blocked.id)).status, 'queued')
    assert.equal(sends, 0)
    await service.cancelJob(blocked.id)
    assert.equal((await job(blocked.id)).status, 'cancelled')

    await service.importCookies({ id: account.id, cookieJson: JSON.stringify([{ name: 'hatch_sess', value: 's1', domain: 'muse.ai', path: '/', secure: false }]) })
    await service.setEnabled({ id: account.id, enabled: true })

    // --- success: the new video, not the history one, the poster or the uploaded clip
    const first = await create('MODE_OK push in')
    const ok = await settled(first.id)
    assert.equal(ok.status, 'completed', ok.error)
    assert.deepEqual(await readFile(ok.result!.videoPath), files['/new.mp4'])
    assert.equal(ok.threadPath, '/thread/t1')
    assert.equal(sends, 1)

    const blob = await settled((await create('MODE_BLOB')).id)
    assert.equal(blob.status, 'completed', blob.error)
    assert.deepEqual(await readFile(blob.result!.videoPath), files['/new.mp4'])

    // --- first/last frame: both pictures, in order, with matching wording
    const [frames] = await service.createJobs({ imagePaths: [image], prompt: 'MODE_OK frames', durationSec: 5, aspect: '9:16', mode: 'first_last', zoomPercent: 30 })
    const framed = await settled(frames.id)
    assert.equal(framed.status, 'completed', framed.error)
    const bytes = (await readFile(image)).length
    assert.deepEqual(sentSizes, [bytes, bytes + 1])
    // Detail pictures follow the frames, in order.
    const extra = [join(root, 'd1.png'), join(root, 'd2.png')]
    for (const [index, path] of extra.entries()) await sharp({ create: { width: 200 + index * 400, height: 300, channels: 3, background: '#aa3311' } }).png().toFile(path)
    const extraSizes = await Promise.all(extra.map(async (path) => (await readFile(path)).length))
    const [detailed] = await service.createJobs({ imagePaths: [image], prompt: 'MODE_OK details', durationSec: 5, aspect: '9:16', mode: 'first_last', zoomPercent: 30, detailImagePaths: extra })
    assert.equal((await settled(detailed.id)).status, 'completed')
    assert.deepEqual(sentSizes, [bytes, bytes + 1, ...extraSizes])
    assert.match(framed.sentPrompt, /第二张作为结束画面/)

    // --- a reply that only mentions limits or progress: never sent again, never offered as failed
    for (const mode of ['MODE_PENDING', 'MODE_LIMIT']) {
      const before = sends
      const unclear = await settled((await create(`${mode} unclear`)).id)
      assert.equal(unclear.status, 'needs_review', unclear.error)
      assert.ok(unclear.threadPath, 'can be collected')
      assert.equal(sends, before + 1)
      assert.equal(unclear.quotaSwitches ?? 0, 0)
    }
    assert.ok(!(await service.list()).accounts[0].quotaUntil)

    // --- nothing arrives: noticed early, left to a person, never sent again
    for (const [mode, text] of [['MODE_UNDELIVERED', /没有送达/], ['MODE_NOTHREAD', /没有建立对话/]] as const) {
      const before = sends
      const since = Date.now()
      const lost = await settled((await create(`${mode} lost`)).id)
      assert.equal(lost.status, 'needs_review', lost.error)
      assert.match(lost.error!, text)
      assert.ok(Date.now() - since < 11_000, 'before the overall time limit')
      assert.equal(sends, before + 1)
    }
    const flicker = await settled((await create('MODE_FLICKER recovers')).id)
    assert.equal(flicker.status, 'completed', flicker.error)
    const words = await settled((await create('MODE_OK\nStill sending flowers\n正在发送礼物')).id)
    assert.equal(words.status, 'completed', words.error)

    // --- Muse says no
    for (const [mode, text] of [['MODE_BUSY', /繁忙/]] as const) {
      const before = sends
      const failed = await settled((await create(mode)).id)
      assert.equal(failed.status, 'failed')
      assert.match(failed.error!, text)
      assert.equal(sends, before + 1, 'sent once, never resent')
    }

    // --- nothing sent
    const beforeUnsent = sends
    const unsent = await settled((await create('MODE_UNSENT')).id)
    assert.equal(unsent.status, 'failed')
    assert.equal(unsent.submitted, false)
    assert.equal(sends, beforeUnsent)

    // --- unclear outcomes wait for a person
    for (const mode of ['MODE_TEXT', 'MODE_VANISH', 'MODE_BROKEN']) {
      const before = sends
      const review = await settled((await create(mode)).id)
      assert.equal(review.status, 'needs_review', `${mode}: ${review.error}`)
      assert.equal(sends, before + 1)
      if (mode === 'MODE_VANISH') await assert.rejects(service.collectJob(review.id), /对话地址/)
    }

    // --- stop while waiting, then collect without sending again
    const slow = await create('MODE_SLOW')
    await until(slow.id, (j) => Boolean(j.threadPath))
    await service.cancelJob(slow.id)
    const stoppedJob = await job(slow.id)
    assert.equal(stoppedJob.status, 'needs_review', stoppedJob.error)
    const thread = threads.get(stoppedJob.threadPath!.split('/').pop()!)!
    thread.extra = { reply: '已生成视频', video: '/new.mp4' }
    const beforeCollect = sends
    await service.collectJob(slow.id)
    const collected = await settled(slow.id)
    assert.equal(collected.status, 'completed', collected.error)
    assert.deepEqual(await readFile(collected.result!.videoPath), files['/new.mp4'])
    assert.equal(sends, beforeCollect)

    // Collecting a conversation without our message must not pick up the old video.
    const lost = await create('MODE_SLOW again')
    const lostThread = (await until(lost.id, (j) => Boolean(j.threadPath))).threadPath!.split('/').pop()!
    await service.cancelJob(lost.id)
    threads.delete(lostThread)
    await service.collectJob(lost.id)
    assert.equal((await settled(lost.id)).status, 'needs_review')

    // --- restart in the middle
    const db = JSON.parse(await readFile(join(root, 'jobs.json'), 'utf8'))
    Object.assign(db.jobs.find((j: any) => j.id === first.id), { status: 'running', submitted: true })
    Object.assign(db.jobs.find((j: any) => j.id === blocked.id), { status: 'running', submitted: false })
    await writeFile(join(root, 'jobs.json'), JSON.stringify(db))
    const beforeRestart = sends
    await service.stopJobs()
    service = make()
    await service.resumeJobs()
    assert.equal((await settled(first.id)).status, 'completed', 'sent job is collected by itself')
    assert.equal((await service.listJobs()).paused, true, 'sending is held after a restart')
    assert.equal((await job(blocked.id)).status, 'queued')
    assert.equal(sends, beforeRestart, 'a restart never sends')
    await service.setQueuePaused(false)
    assert.equal((await settled(blocked.id)).status, 'completed')
    assert.equal(sends, beforeRestart + 1)

    // --- quota: the account rests, the job moves to the other account and is sent there once
    const other = await service.create({ name: 'two', proxy: `http://127.0.0.1:${proxyPort}` })
    await service.importCookies({ id: other.id, cookieJson: JSON.stringify([{ name: 'hatch_sess', value: 's1', domain: 'muse.ai', path: '/', secure: false }]) })
    const beforeQuota = sends
    const resetDay = new Date(); resetDay.setHours(0, 0, 0, 0); resetDay.setDate(resetDay.getDate() + 3)
    usage = `Settings\nUsage\nFree plan\nWeekly limit resets on ${resetDay.toLocaleString('en-US', { month: 'short' })} ${resetDay.getDate()}\n100% used\nLanguage`
    const quota = await create('MODE_QUOTA')
    await until(quota.id, (j) => (j.quotaSwitches ?? 0) === 1)
    assert.ok(Number((await accounts.get(account.id)).quotaUntil) > Date.now())
    for (let i = 0; i < 100 && (await accounts.get(account.id)).quotaUntil !== resetDay.getTime(); i += 1) await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal((await accounts.get(account.id)).quotaUntil, resetDay.getTime(), 'paused until the day Muse names')
    await new Promise((resolve) => setTimeout(resolve, 1500))
    quotaOk = true
    await service.setEnabled({ id: other.id, enabled: true })
    const moved = await settled(quota.id)
    assert.equal(moved.status, 'completed', moved.error)
    assert.equal(moved.accountId, other.id)
    assert.equal(sends, beforeQuota + 2)
    await service.test(account.id)
    assert.equal((await accounts.get(account.id)).quotaUntil, undefined)

    // --- quota query: read only, pauses a used-up account, keeps old numbers on failure
    const beforeUsage = sends
    usage = 'Settings\nUsage\nFree plan\nWeekly limit resets on Sep 30\n41% used\nLanguage'
    const read = await service.queryQuota(account.id)
    assert.deepEqual([read.quota?.plan, read.quota?.weeklyUsedPct, read.quota?.weeklyReset, read.quotaUntil], ['Free plan', 41, 'Sep 30', undefined])
    usage = 'Settings\nUsage\nFree plan\n100% used\nLanguage'
    assert.ok(Number((await service.queryQuota(account.id)).quotaUntil) > Date.now())
    usage = 'Settings\nUsage\nFree plan\nLanguage'
    await assert.rejects(service.queryQuota(account.id), /没有读到用量/)
    assert.equal((await accounts.get(account.id)).quota?.weeklyUsedPct, 100)
    usage = 'Settings\nUsage\nFree plan\n5% used\nLanguage'
    assert.equal((await service.queryQuota(account.id)).quotaUntil, undefined, 'usable again')
    proxyDown = true
    await assert.rejects(service.queryQuota(account.id), /代理/)
    proxyDown = false
    await service.test(account.id)
    assert.equal(sends, beforeUsage)

    // --- batch over two accounts: at most one per account, everything sent exactly once
    const images: string[] = []
    for (let i = 0; i < 5; i += 1) {
      images.push(join(root, `b${i}.png`))
      await writeFile(images[i], await readFile(image))
    }
    const beforeBatch = sends
    const batch = await service.createJobs({ imagePaths: images, prompt: 'MODE_OK batch', durationSec: 5, aspect: '9:16' })
    let peak = 0
    for (;;) {
      const now = (await service.listJobs()).jobs.filter((j) => batch.some((b) => b.id === j.id))
      const active = now.filter((j) => j.status === 'running')
      peak = Math.max(peak, active.length)
      assert.equal(new Set(active.map((j) => j.accountId)).size, active.length, 'one job per account')
      if (now.every((j) => j.status === 'completed')) break
      assert.ok(now.every((j) => ['queued', 'running', 'completed'].includes(j.status)), JSON.stringify(now.map((j) => [j.status, j.error])))
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(peak, 2)
    assert.equal(sends, beforeBatch + 5)

    // --- pause holds new sends; cancelling the queue leaves the running one alone
    const held = await service.createJobs({ imagePaths: images.slice(0, 3), prompt: 'MODE_OK held', durationSec: 5, aspect: '9:16', accountId: account.id })
    await until(held[0].id, (j) => j.status === 'running')
    await service.setQueuePaused(true)
    assert.equal(await service.cancelQueuedJobs(), 2)
    assert.equal((await settled(held[0].id)).status, 'completed')
    await assert.rejects(service.retryJob(held[0].id), /失败或已取消/)
    await service.setQueuePaused(false)

    // --- a page that never sends is tried 3 times, then fails
    const never = await settled((await create('MODE_UNSENT again')).id)
    assert.equal(never.attempts, 3)

    // --- dismiss, remove
    const reviewed = (await service.listJobs()).jobs.find((j) => j.status === 'needs_review')!
    await assert.rejects(service.retryJob(reviewed.id), /失败或已取消/)
    await service.dismissJob(reviewed.id)
    assert.equal((await job(reviewed.id)).status, 'failed')
    await service.removeJobs([reviewed.id])
    assert.equal(await job(reviewed.id), undefined)

    // --- finished videos: cover, subtitles, export, logs, batch delete
    await service.listJobs()
    await until(batch[0].id, (j) => Boolean(j.posterPath))
    const [one, two] = [batch[0].id, batch[1].id]
    const source = (await job(one)).result!.videoPath
    await assert.rejects(service.addSubtitles({ ids: [one], titleConfig: { singleText: ' ' } }), /标题/)
    await assert.rejects(service.addSubtitles({ ids: [never.id], titleConfig: { singleText: 'x' } }), /已完成/)
    await assert.rejects(service.addSubtitles({ ids: [one], titleConfig: { singleText: 'FAIL' } }), /render broke/)
    assert.equal((await job(one)).subtitleVideoPath, undefined)
    assert.deepEqual(await service.addSubtitles({ ids: [one, two, never.id], titleConfig: { singleText: 'A' } }), { done: 2, failed: 0 })
    assert.equal(rendered[rendered.length - 1].canvas, '1080x1920')
    const firstSubtitle = (await job(one)).subtitleVideoPath!
    const concurrent = await Promise.allSettled([service.addSubtitles({ ids: [one], titleConfig: { singleText: 'B' } }), service.addSubtitles({ ids: [one], titleConfig: { singleText: 'C' } })])
    assert.equal(concurrent.filter((item) => item.status === 'fulfilled').length, 1, 'one render per video at a time')
    assert.notEqual((await job(one)).subtitleVideoPath, firstSubtitle)
    assert.equal(existsSync(firstSubtitle), false, 'the replaced version is removed')
    assert.ok(existsSync(source), 'the original stays')

    const out = join(root, 'out')
    assert.equal((await service.exportJobs({ ids: [one, two], outputDir: out })).done, 2)
    assert.match(await readFile((await job(one)).exportedVideoPath!, 'utf8'), /^subtitled/)
    await service.exportJobs({ ids: [one], outputDir: out })
    assert.equal((await readdir(out)).length, 3, 'exports never overwrite')
    assert.equal((await service.revertSubtitles([one, two])).done, 2)
    assert.equal((await job(one)).subtitleVideoPath, undefined)
    assert.ok((await job(one)).exportedAt === undefined)

    assert.equal((await job(one)).logs, undefined, 'logs are not in the list')
    const logs = (await service.getJob(one)).logs!.map((item) => item.message)
    for (const text of ['任务已创建', '点击发送', '视频已下载', '已添加字幕', '已撤销字幕']) assert.ok(logs.includes(text), text)

    assert.deepEqual(await service.removeJobs([one, two, 'missing']), { done: 2, skipped: 1 })
    assert.equal(existsSync(source), false)
    assert.equal((await readdir(out)).length, 3, 'exported copies stay')

    // --- proxy down: paused without sending, then picked up again by itself
    const beforeDown = sends
    proxyDown = true
    const waiting = await create('MODE_OK after outage', account.id)
    await until(waiting.id, (j) => j.status === 'queued' && Boolean(j.error))
    assert.equal((await accounts.get(account.id)).state, 'proxy_error')
    proxyDown = false
    assert.equal((await settled(waiting.id)).status, 'completed')
    assert.equal(sends, beforeDown + 1)

    assert.equal(direct, 0, 'everything went through the proxy')
    console.log(`muse-creative-generate smoke passed (${sends} sends, ${direct} direct)`)
  } finally {
    await service.stopJobs()
    for (const server of [site, proxyServer]) { server.closeAllConnections(); server.close() }
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1) })
