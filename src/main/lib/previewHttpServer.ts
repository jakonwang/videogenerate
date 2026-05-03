import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { taskQueue } from '../modules/tasks/queue'

let server: http.Server | null = null
let boundPort: number | null = null

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  }
}

function mimeForPath(p: string) {
  const e = p.toLowerCase()
  if (e.endsWith('.mp4')) return 'video/mp4'
  if (e.endsWith('.webm')) return 'video/webm'
  if (e.endsWith('.mov')) return 'video/quicktime'
  if (e.endsWith('.mkv')) return 'video/x-matroska'
  return 'application/octet-stream'
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders())
    res.end()
    return
  }
  if (req.method !== 'GET') {
    res.writeHead(405, corsHeaders()).end()
    return
  }

  const host = req.headers.host ?? '127.0.0.1'
  const u = new URL(req.url ?? '/', `http://${host}`)
  const m = /^\/p\/([^/]+)\/?$/.exec(u.pathname)
  if (!m) {
    res.writeHead(404, corsHeaders()).end('not found')
    return
  }

  const taskId = decodeURIComponent(m[1])
  const task = taskQueue.getTask(taskId)
  if (!task || task.status !== 'done' || !task.outPath?.trim()) {
    res.writeHead(404, corsHeaders()).end('not found')
    return
  }

  let st: Awaited<ReturnType<typeof stat>>
  try {
    st = await stat(task.outPath)
  } catch {
    res.writeHead(404, corsHeaders()).end('gone')
    return
  }
  if (!st.isFile()) {
    res.writeHead(404, corsHeaders()).end()
    return
  }

  const size = st.size
  const mime = mimeForPath(task.outPath)
  const range = req.headers.range

  if (range) {
    const parts = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (parts) {
      let start = parts[1] ? parseInt(parts[1], 10) : 0
      let end = parts[2] ? parseInt(parts[2], 10) : size - 1
      if (Number.isNaN(start)) start = 0
      if (Number.isNaN(end) || end >= size) end = size - 1
      if (start > end || start >= size) {
        res.writeHead(416, { ...corsHeaders(), 'Content-Range': `bytes */${size}` }).end()
        return
      }
      const chunk = end - start + 1
      res.writeHead(206, {
        ...corsHeaders(),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunk),
        'Content-Type': mime,
      })
      createReadStream(task.outPath, { start, end }).on('error', () => res.destroy()).pipe(res)
      return
    }
  }

  res.writeHead(200, {
    ...corsHeaders(),
    'Content-Length': String(size),
    'Accept-Ranges': 'bytes',
    'Content-Type': mime,
  })
  createReadStream(task.outPath).on('error', () => res.destroy()).pipe(res)
}

const PORT_START = 47820
const PORT_TRIES = 40

/** 绑定 0.0.0.0，供局域网内手机访问 /p/<taskId> 流式播放成片 */
export async function ensurePreviewHttpServer(): Promise<number> {
  if (server && boundPort != null) return boundPort

  for (let p = PORT_START; p < PORT_START + PORT_TRIES; p++) {
    const s = http.createServer((req, res) => {
      void handle(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500, corsHeaders()).end()
        else res.destroy()
      })
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const onErr = (e: Error) => reject(e)
        s.once('error', onErr)
        s.listen(p, '0.0.0.0', () => {
          s.removeListener('error', onErr)
          resolve()
        })
      })
      server = s
      boundPort = p
      return p
    } catch {
      await new Promise<void>((r) => s.close(() => r()))
    }
  }

  throw new Error('局域网预览服务无法绑定端口（47820–47859 均被占用）')
}

export function getPreviewServerPort(): number | null {
  return boundPort
}

export function stopPreviewHttpServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      boundPort = null
      resolve()
      return
    }
    server.close(() => {
      server = null
      boundPort = null
      resolve()
    })
  })
}
