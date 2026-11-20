/** The cloud server serves the web version at /app/: redirects, shell fallback, caching, no path traversal. */
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWebApp } from '../services/cloud/src/webApp'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-web-app-'))
  const dist = join(root, 'dist-web')
  await mkdir(join(dist, 'assets'), { recursive: true })
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Vidloom</title>')
  await writeFile(join(dist, 'assets', 'index-abc.js'), 'console.log(1)')
  await writeFile(join(dist, 'brand-logo.png'), 'png')
  await writeFile(join(root, 'secret.txt'), 'secret')

  const webApp = createWebApp(dist)
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://x').pathname
    if (!(await webApp(req, res, pathname))) {
      res.statusCode = 418
      res.end('api')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const get = (path: string, method = 'GET') => new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })

  try {
    const redirect = await get('/app')
    assert.equal(redirect.status, 301)
    assert.equal(redirect.headers.location, '/app/')

    const index = await get('/app/')
    assert.equal(index.status, 200)
    assert.match(String(index.headers['content-type']), /text\/html/)
    assert.equal(index.headers['cache-control'], 'no-cache')

    const asset = await get('/app/assets/index-abc.js')
    assert.equal(asset.status, 200)
    assert.match(String(asset.headers['cache-control']), /immutable/)
    assert.equal((await get('/app/assets/missing.js')).status, 404, 'missing hashed asset is a real 404')

    assert.equal((await get('/app/brand-logo.png')).headers['content-type'], 'image/png')
    assert.match((await get('/app/some/deep/link')).body, /Vidloom/, 'unknown paths fall back to the app shell')
    assert.equal((await get('/app/', 'HEAD')).body, '')

    for (const path of ['/app/../secret.txt', '/app/%2e%2e/secret.txt', '/app/..%2fsecret.txt', '/app/%2e%2e%5csecret.txt']) {
      const res = await get(path)
      assert.ok(!res.body.includes('secret'), `traversal blocked: ${path}`)
    }

    assert.equal((await get('/api/v1/health')).status, 418, 'API paths are left to the API router')
    assert.equal((await get('/application')).status, 418, 'only /app and /app/* belong to the web app')
    assert.equal((await get('/app/', 'POST')).status, 418, 'non-GET requests are not handled')

    const empty = createWebApp(join(root, 'not-built'))
    const res = { statusCode: 0, headers: {} as Record<string, string>, body: '', setHeader(k: string, v: string) { this.headers[k] = v }, end(b?: string) { this.body = b || '' } }
    assert.equal(await empty({ method: 'GET' } as any, res as any, '/app/'), true)
    assert.equal(res.statusCode, 404)
    assert.match(res.body, /build:web/, 'explains how to build when dist-web is missing')

    console.log('cloud-web-app smoke: ok')
  } finally {
    server.close()
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
