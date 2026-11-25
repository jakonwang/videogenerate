// -*- coding: utf-8 -*-
// Muse accounts + proxy. Uses a local authenticated proxy and a local fake site; never contacts muse.ai.
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net, { type AddressInfo } from 'node:net'
import { createMuseAccounts } from '../src/main/modules/muse-creative-studio/accounts'
import { checkMuseExit, checkMuseSession, launchMuseBrowser, loginMuse, MuseProxyError } from '../src/main/modules/muse-creative-studio/browser'
import { parseMuseProxy, type MuseProxy } from '../src/main/modules/muse-creative-studio/proxy'
import { normalizeMuseCookies } from '../src/main/modules/muse-creative-studio/session'
import { openProxyEndpoint } from '../src/main/modules/muse-creative-studio/socksRelay'
import { createMuseService } from '../src/main/modules/muse-creative-studio/service'

const listen = (server: http.Server) => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
const cookie = (value = 's1') => ({ name: 'hatch_sess', value, domain: 'muse.ai', path: '/', secure: false, httpOnly: true })

async function main() {
  // --- parsing
  const expected: MuseProxy = { protocol: 'http', host: 'p.example.com', port: 8000, username: 'u', password: 'p@:1' }
  assert.deepEqual(parseMuseProxy('http://u:p%40%3A1@p.example.com:8000'), expected)
  assert.deepEqual(parseMuseProxy('p.example.com:8000:u:p@:1'), expected)
  for (const text of ['socks5://p.example.com:8000:u:p@:1', 'socks5h://u:p%40%3A1@p.example.com:8000']) assert.deepEqual(parseMuseProxy(text), { ...expected, protocol: 'socks5' })
  assert.deepEqual(parseMuseProxy('http://p.example.com:80'), { protocol: 'http', host: 'p.example.com', port: 80, username: '', password: '' })
  for (const bad of ['', 'socks4://u:secret@h:1', 'https://u:secret@h:1', 'http://u:secret@h', 'http://u:secret@h:99999', 'http://u:%zzsecret@h:1', 'http://u:sec/ret@h:1']) {
    assert.throws(() => parseMuseProxy(bad), (error: Error) => !/secret|sec\/ret/.test(error.message), bad)
  }

  // --- cookies
  assert.equal(normalizeMuseCookies([cookie(), { name: 'x', value: 'y', domain: '.google.com' }, { name: 'z', value: 'y', domain: 'evilmuse.ai' }]).length, 1)
  assert.throws(() => normalizeMuseCookies([{ name: 'other', value: '1', domain: 'muse.ai' }]))

  // --- fake upstream reached only through the proxy
  let country = 'US'
  let ip = '203.0.113.7'
  let sessionStatus = 200
  let directHits = 0
  const proxied: string[] = []
  const site = http.createServer((req, res) => {
    if (req.headers['x-via-test-proxy'] !== '1') directHits += 1
    const path = new URL(req.url!, 'http://x').pathname
    if (path === '/json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ip, country })); return }
    if (path === '/api/session') {
      const loggedIn = /hatch_sess=s[12]/.test(req.headers.cookie || '')
      res.statusCode = loggedIn ? sessionStatus : 401
      if (loggedIn) res.setHeader('set-cookie', 'hatch_sess=s2; Path=/; HttpOnly')
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ status: 'assigned' }))
      return
    }
    if (path === '/') res.setHeader('set-cookie', 'hatch_sess=s1; Path=/; HttpOnly')
    res.end('<h1>ok</h1>')
  })
  const sitePort = await listen(site)
  const authorization = `Basic ${Buffer.from('u:p').toString('base64')}`
  const proxyServer = http.createServer((req, res) => {
    if (req.headers['proxy-authorization'] !== authorization) { res.writeHead(407, { 'proxy-authenticate': 'Basic realm="t"' }); res.end(); return }
    proxied.push(req.url!)
    const target = new URL(req.url!)
    const upstream = http.request({ host: '127.0.0.1', port: sitePort, path: target.pathname + target.search, method: req.method, headers: { ...req.headers, 'x-via-test-proxy': '1' } }, (answer) => {
      res.writeHead(answer.statusCode!, answer.headers)
      answer.pipe(res)
    })
    req.pipe(upstream)
  })
  // Playwright's request client may tunnel plain http too.
  proxyServer.on('connect', (req, socket: net.Socket, head) => {
    if (req.headers['proxy-authorization'] !== authorization) { socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="t"\r\n\r\n'); return }
    proxied.push(`CONNECT ${req.url}`)
    const hop = http.createServer((inner, res) => {
      const upstream = http.request({ host: '127.0.0.1', port: sitePort, path: inner.url, method: inner.method, headers: { ...inner.headers, 'x-via-test-proxy': '1' } }, (answer) => {
        res.writeHead(answer.statusCode!, answer.headers)
        answer.pipe(res)
      })
      inner.pipe(upstream)
    })
    if (!String(req.url).endsWith(':80')) { socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); return }
    socket.on('error', () => undefined)
    socket.write('HTTP/1.1 200 OK\r\n\r\n')
    hop.emit('connection', socket)
    if (head.length) socket.unshift(head)
  })
  const proxyPort = await listen(proxyServer)
  const proxy: MuseProxy = { protocol: 'http', host: '127.0.0.1', port: proxyPort, username: 'u', password: 'p' }
  const wrong = { ...proxy, password: 'bad-secret' }
  const dead = { ...proxy, port: 1 }
  const museUrl = 'http://muse.ai/'
  const exitOptions = { exitServices: ['http://exit.test/json'], museUrl }

  const root = await mkdtemp(join(tmpdir(), 'muse-accounts-'))
  try {
    const exit = await checkMuseExit(proxy, exitOptions)
    assert.equal(exit.ip, ip)
    assert.equal(exit.museReachable, true)
    await assert.rejects(checkMuseExit(wrong, exitOptions), (error: Error) => error instanceof MuseProxyError && /用户名或密码/.test(error.message) && !error.message.includes('bad-secret'))
    await assert.rejects(checkMuseExit(dead, exitOptions), MuseProxyError)

    const session = await checkMuseSession(proxy, normalizeMuseCookies([cookie()]), museUrl)
    assert.equal(session.state, 'ready')
    assert.equal(session.cookies?.find((item) => item.name === 'hatch_sess')?.value, 's2', 'rotated cookie kept')
    assert.equal((await checkMuseSession(proxy, [], museUrl)).state, 'expired')

    // --- browser: everything via the proxy, loopback included, and no fallback when it is down
    const before = proxied.length
    const browser = await launchMuseBrowser(proxy, { headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(`http://127.0.0.1:${sitePort}/page`)
      assert.ok(proxied.length > before, 'loopback also goes through the proxy')
    } finally {
      await browser.close()
    }
    const broken = await launchMuseBrowser(dead, { headless: true })
    try {
      await assert.rejects((await broken.newPage()).goto(`http://127.0.0.1:${sitePort}/page`))
    } finally {
      await broken.close()
    }
    assert.equal(directHits, 0, 'nothing reached the site without the proxy')

    // --- SOCKS5 with a password: same guarantees through the local relay
    let socksNames: string[] = []
    const socks = net.createServer((client) => {
      client.on('error', () => undefined)
      let stage = 0
      client.on('data', (data) => {
        if (stage === 0) { stage = 1; client.write(Buffer.from([5, data.subarray(2).includes(2) ? 2 : 255])) }
        else if (stage === 1) {
          const userLength = data[1]
          const user = data.subarray(2, 2 + userLength).toString()
          const pass = data.subarray(3 + userLength).toString()
          const ok = user === 'su' && pass === 'sp'
          stage = 2
          client.write(Buffer.from([1, ok ? 0 : 1]))
          if (!ok) client.end()
        } else if (stage === 2) {
          stage = 3
          socksNames.push(data.subarray(5, 5 + data[4]).toString())
          client.removeAllListeners('data')
          const hop = http.createServer((inner, res) => {
            const upstream = http.request({ host: '127.0.0.1', port: sitePort, path: inner.url, method: inner.method, headers: { ...inner.headers, 'x-via-test-proxy': '1' } }, (answer) => {
              res.writeHead(answer.statusCode!, answer.headers)
              answer.pipe(res)
            })
            inner.pipe(upstream)
          })
          // Split reply: the client must cope with partial reads.
          client.write(Buffer.from([5, 0, 0]))
          setTimeout(() => { hop.emit('connection', client); client.write(Buffer.from([1, 0, 0, 0, 0, 0, 0])) }, 30)
        }
      })
    })
    const socksPort = await new Promise<number>((resolve) => socks.listen(0, '127.0.0.1', () => resolve((socks.address() as AddressInfo).port)))
    const socksProxy: MuseProxy = { protocol: 'socks5', host: '127.0.0.1', port: socksPort, username: 'su', password: 'sp' }
    const deadSocks = { ...socksProxy, port: 1 }
    assert.equal((await checkMuseExit(socksProxy, exitOptions)).ip, ip)
    assert.ok(socksNames.includes('exit.test') && socksNames.includes('muse.ai'), 'names are resolved by the proxy')
    await assert.rejects(checkMuseExit({ ...socksProxy, password: 'bad-secret' }, exitOptions), (error: Error) => error instanceof MuseProxyError && /用户名或密码/.test(error.message))
    await assert.rejects(checkMuseExit(deadSocks, exitOptions), MuseProxyError)
    assert.equal((await checkMuseSession(socksProxy, normalizeMuseCookies([cookie()]), museUrl)).state, 'ready')
    socksNames = []
    const viaSocks = await launchMuseBrowser(socksProxy, { headless: true })
    try {
      const page = await viaSocks.newPage()
      await page.goto('http://browser.test/page')
      await page.goto(`http://127.0.0.1:${sitePort}/page`)
      assert.ok(socksNames.includes('browser.test') && socksNames.includes('127.0.0.1'))
    } finally {
      await viaSocks.close()
    }
    const brokenSocks = await launchMuseBrowser(deadSocks, { headless: true })
    try {
      await assert.rejects((await brokenSocks.newPage()).goto(`http://127.0.0.1:${sitePort}/page`))
    } finally {
      await brokenSocks.close()
    }
    assert.ok((await loginMuse('s', socksProxy, [], { museUrl, headless: true, timeoutMs: 20_000, pollMs: 200 })).length)
    assert.equal(directHits, 0, 'socks: nothing reached the site directly')
    const relay = await openProxyEndpoint(socksProxy)
    const open = await new Promise<number>((resolve) => http.get({ host: '127.0.0.1', port: Number(new URL(relay.server).port), path: 'http://muse.ai/' }, (res) => { res.resume(); resolve(res.statusCode!) }))
    assert.equal(open, 407, 'other programs cannot use the relay')
    relay.close()
    socks.close()

    // --- login window
    const loggedIn = await loginMuse('a', proxy, [], { museUrl, headless: true, timeoutMs: 20_000, pollMs: 200 })
    assert.ok(loggedIn.some((item) => item.name === 'hatch_sess'))
    await assert.rejects(loginMuse('a', dead, [], { museUrl, headless: true }), MuseProxyError)
    assert.equal(directHits, 0)

    // --- store + service rules
    const path = join(root, 'accounts.json')
    const vault = { encrypt: (v: string) => Buffer.from(v).reverse().toString('base64'), decrypt: (v: string) => Buffer.from(v, 'base64').reverse().toString() }
    const accounts = createMuseAccounts({ path: () => path, vault })
    const jobDeps = { readQuota: async () => { throw new Error('not used') }, generate: async () => { throw new Error('not used') }, probe: async () => ({ durationSec: 0 }), jobsPath: () => join(root, 'jobs.json'), jobsRoot: () => root, makePoster: async () => undefined, makeLastFrame: async () => '', renderSubtitles: async () => [], promptsPath: () => join(root, 'prompts.json'), prepareImage: async () => { throw new Error('not used') }, productName: async () => null, styleReference: async () => null }
    const service = createMuseService({
      ...jobDeps,
      accounts,
      checkExit: (p) => checkMuseExit(p, exitOptions),
      checkSession: (p, c) => checkMuseSession(p, c, museUrl),
      login: (id, p, c) => loginMuse(id, p, c, { museUrl, headless: true, timeoutMs: 20_000, pollMs: 200 }),
    })
    const created = await service.create({ name: 'one', proxy: `http://u:p@127.0.0.1:${proxyPort}` })
    assert.equal('encryptedProxy' in created, false)
    await assert.rejects(service.setEnabled({ id: created.id, enabled: true }))
    assert.equal((await service.test(created.id)).state, 'login_required')
    assert.equal((await service.login(created.id)).state, 'disabled')
    assert.equal((await service.setEnabled({ id: created.id, enabled: true })).state, 'ready')
    assert.equal((await service.test(created.id)).state, 'ready')

    // Survives a restart: a fresh store reads the same file.
    assert.ok((await createMuseAccounts({ path: () => path, vault }).getCookies(created.id)).length)
    const onDisk = await readFile(path, 'utf8')
    assert.ok(!/hatch_sess|"password"/.test(onDisk), 'secrets are not stored in the clear')

    ip = '203.0.113.8'
    assert.equal((await service.test(created.id)).state, 'ip_changed')
    await assert.rejects(service.setEnabled({ id: created.id, enabled: true }))
    assert.equal((await service.acceptExit(created.id)).state, 'ready')
    country = 'VN'
    let opened = false
    const guarded = createMuseService({ ...jobDeps, accounts, checkExit: (p) => checkMuseExit(p, exitOptions), checkSession: checkMuseSession, login: async () => { opened = true; return [] } })
    assert.equal((await guarded.login(created.id)).state, 'region_blocked')
    assert.equal(opened, false, 'no Muse access from a non-US exit')
    country = 'US'
    sessionStatus = 401
    assert.equal((await service.test(created.id)).state, 'expired')
    sessionStatus = 403
    assert.equal((await service.test(created.id)).state, 'region_blocked')
    sessionStatus = 200

    const changed = await service.update({ id: created.id, proxy: `http://u:p@127.0.0.1:1` })
    assert.equal(changed.enabled, false)
    assert.equal(changed.pinnedIp, undefined)
    assert.equal((await service.test(created.id)).state, 'proxy_error')
    assert.equal(directHits, 0)

    const locked = createMuseAccounts({ path: () => join(root, 'locked.json'), vault: { encrypt: () => null, decrypt: () => null } })
    await assert.rejects(locked.create({ name: 'x', proxy: 'http://u:p@h:1' }), /安全存储/)
    await service.remove(created.id)
    assert.equal((await accounts.list()).length, 0)
    console.log(`muse-creative-accounts smoke passed (${proxied.length} proxied, ${directHits} direct)`)
  } finally {
    for (const server of [site, proxyServer]) { server.closeAllConnections(); server.close() }
    await rm(root, { recursive: true, force: true })
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1) })
