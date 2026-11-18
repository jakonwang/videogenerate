import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type http from 'node:http'

/**
 * Serves the web version (apps/mobile built with `npm run build:web`) at /app/ from the same
 * process and domain as the API, so the browser needs no CORS and no second server.
 * Hashed assets are cached forever; index.html is always revalidated so a deploy shows up at once.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

export const WEB_APP_PREFIX = '/app'

export function createWebApp(dir: string) {
  const root = resolve(dir)

  async function send(res: http.ServerResponse, file: string, method: string) {
    const body = await readFile(file)
    const isIndex = file.endsWith(`${sep}index.html`)
    res.statusCode = 200
    res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] || 'application/octet-stream')
    res.setHeader('Cache-Control', isIndex ? 'no-cache' : file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')
    res.setHeader('Content-Length', String(body.length))
    if (isIndex) {
      res.setHeader('X-Frame-Options', 'DENY')
      res.setHeader('Referrer-Policy', 'same-origin')
    }
    res.end(method === 'HEAD' ? undefined : body)
  }

  async function isFile(path: string) {
    try {
      return (await stat(path)).isFile()
    } catch {
      return false
    }
  }

  /** Returns true when the request was for the web app (handled here). */
  return async function handle(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
    if (pathname !== WEB_APP_PREFIX && !pathname.startsWith(`${WEB_APP_PREFIX}/`)) return false
    const method = String(req.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return false
    if (pathname === WEB_APP_PREFIX) {
      res.statusCode = 301
      res.setHeader('Location', `${WEB_APP_PREFIX}/`)
      res.end()
      return true
    }
    let relative: string
    try {
      relative = decodeURIComponent(pathname.slice(WEB_APP_PREFIX.length + 1))
    } catch {
      relative = ''
    }
    const target = normalize(join(root, relative || 'index.html'))
    // Never serve anything outside the build folder.
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      res.statusCode = 404
      res.end()
      return true
    }
    if (await isFile(target)) {
      await send(res, target, method)
      return true
    }
    // Missing hashed asset → real 404; anything else falls back to the app shell (hash routing).
    const index = join(root, 'index.html')
    if (relative.startsWith('assets/') || !(await isFile(index))) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end((await isFile(index)) ? 'Not found' : '网页版还没有构建：在 apps/mobile 运行 npm run build:web')
      return true
    }
    await send(res, index, method)
    return true
  }
}
