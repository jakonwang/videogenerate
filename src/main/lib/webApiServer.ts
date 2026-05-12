import http from 'node:http'
import { handleWebApiRequest } from '../modules/web-platform/webApiRouter'

let server: http.Server | null = null
let boundPort: number | null = null

const PORT_START = 47960
const PORT_TRIES = 30

export async function ensureWebApiServer() {
  if (server && boundPort != null) return boundPort
  for (let p = PORT_START; p < PORT_START + PORT_TRIES; p++) {
    const candidate = http.createServer((req, res) => {
      void handleWebApiRequest(req, res)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const onErr = (error: Error) => reject(error)
        candidate.once('error', onErr)
        candidate.listen(p, '127.0.0.1', () => {
          candidate.removeListener('error', onErr)
          resolve()
        })
      })
      server = candidate
      boundPort = p
      return p
    } catch {
      await new Promise<void>((resolve) => candidate.close(() => resolve()))
    }
  }
  throw new Error('Web API 服务无法绑定端口')
}

export function getWebApiServerPort() {
  return boundPort
}

export async function stopWebApiServer() {
  await new Promise<void>((resolve) => {
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
