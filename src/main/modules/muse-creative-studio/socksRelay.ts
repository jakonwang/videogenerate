import { randomBytes } from 'node:crypto'
import http from 'node:http'
import net, { type AddressInfo } from 'node:net'
import type { MuseProxy } from './proxy'

const CONNECT_TIMEOUT_MS = 20_000

class SocksAuthError extends Error {}

/** Opens `host:port` through a SOCKS5 proxy. The name is resolved by the proxy, never locally. */
function socksConnect(proxy: MuseProxy, host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.host)
    let buffered = Buffer.alloc(0)
    let stage: 'greeting' | 'auth' | 'reply' = 'greeting'
    const fail = (error: Error) => {
      clearTimeout(timer)
      socket.destroy()
      reject(error)
    }
    const timer = setTimeout(() => fail(new Error('socks timeout')), CONNECT_TIMEOUT_MS)
    const take = (size: number) => {
      const chunk = buffered.subarray(0, size)
      buffered = buffered.subarray(size)
      return chunk
    }
    const sendTarget = () => {
      stage = 'reply'
      const name = Buffer.from(host)
      const portBytes = Buffer.alloc(2)
      portBytes.writeUInt16BE(port)
      socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, portBytes]))
    }
    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      if (stage === 'greeting' && buffered.length >= 2) {
        const [version, method] = take(2)
        if (version !== 5) return fail(new Error('not a socks5 proxy'))
        if (method === 0) sendTarget()
        else if (method === 2) {
          stage = 'auth'
          const user = Buffer.from(proxy.username)
          const password = Buffer.from(proxy.password)
          socket.write(Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([password.length]), password]))
        } else return fail(new SocksAuthError())
      }
      if (stage === 'auth' && buffered.length >= 2) {
        if (take(2)[1] !== 0) return fail(new SocksAuthError())
        sendTarget()
      }
      if (stage === 'reply' && buffered.length >= 5) {
        if (buffered[0] !== 5 || buffered[1] !== 0) return fail(new Error('socks target refused'))
        const addressLength = buffered[3] === 1 ? 4 : buffered[3] === 4 ? 16 : buffered[4] + 1
        if (buffered.length < 6 + addressLength) return
        take(6 + addressLength)
        clearTimeout(timer)
        socket.off('data', onData)
        socket.off('error', fail)
        socket.off('close', onClose)
        socket.pause()
        if (buffered.length) socket.unshift(buffered)
        resolve(socket)
      }
    }
    const onClose = () => fail(new Error('socks closed'))
    socket.on('error', fail)
    socket.on('close', onClose)
    socket.on('data', onData)
    socket.on('connect', () => socket.write(proxy.username ? Buffer.from([5, 1, 2]) : Buffer.from([5, 1, 0])))
  })
}

export type ProxyEndpoint = {
  server: string
  username?: string
  password?: string
  /** True once the upstream proxy rejected the credentials. */
  authFailed(): boolean
  close(): void
}

/**
 * Chromium cannot sign in to SOCKS5 proxies. This exposes one as an HTTP proxy on 127.0.0.1, protected by a
 * random password. A failed upstream connection closes the request; nothing is ever sent directly.
 */
export async function openProxyEndpoint(proxy: MuseProxy): Promise<ProxyEndpoint> {
  if (proxy.protocol === 'http') {
    return {
      server: `http://${proxy.host}:${proxy.port}`,
      username: proxy.username || undefined,
      password: proxy.password || undefined,
      authFailed: () => false,
      close: () => undefined,
    }
  }
  const username = 'muse'
  const password = randomBytes(24).toString('hex')
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  const allowed = (req: http.IncomingMessage) => req.headers['proxy-authorization'] === authorization
  let authFailed = false
  const open = new Set<net.Socket>()
  const track = (socket: net.Socket) => {
    open.add(socket)
    socket.on('close', () => open.delete(socket))
  }
  const dial = async (host: string, port: number) => {
    try {
      const socket = await socksConnect(proxy, host, port)
      track(socket)
      return socket
    } catch (error) {
      if (error instanceof SocksAuthError) authFailed = true
      throw error
    }
  }

  const server = http.createServer(async (req, res) => {
    if (!allowed(req)) {
      res.writeHead(407, { 'proxy-authenticate': 'Basic realm="muse"' }).end()
      return
    }
    try {
      const target = new URL(req.url || '')
      if (target.protocol !== 'http:') throw new Error('unsupported')
      const upstream = await dial(target.hostname, Number(target.port || 80))
      const headers: http.OutgoingHttpHeaders = { ...req.headers, connection: 'close' }
      delete headers['proxy-authorization']
      delete headers['proxy-connection']
      const forward = http.request({ createConnection: () => upstream, host: target.hostname, path: target.pathname + target.search, method: req.method, headers }, (answer) => {
        res.writeHead(answer.statusCode || 502, answer.headers)
        answer.pipe(res)
      })
      // The dialled socket is paused and the HTTP client does not resume it by itself.
      forward.on('socket', (socket) => socket.resume())
      forward.on('error', () => res.destroy())
      res.on('close', () => upstream.destroy())
      req.pipe(forward)
    } catch {
      res.destroy()
    }
  })
  server.on('connect', async (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
    track(client)
    client.on('error', () => client.destroy())
    if (!allowed(req)) {
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="muse"\r\nContent-Length: 0\r\n\r\n')
      return
    }
    try {
      const target = new URL(`http://${req.url}`)
      const upstream = await dial(target.hostname, Number(target.port || 80))
      upstream.on('error', () => client.destroy())
      upstream.on('close', () => client.destroy())
      client.on('close', () => upstream.destroy())
      if (client.destroyed) { upstream.destroy(); return }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      client.pipe(upstream)
      upstream.pipe(client)
    } catch {
      client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n')
    }
  })
  server.on('clientError', (_error, socket) => socket.destroy())
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    server: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    username,
    password,
    authFailed: () => authFailed,
    close: () => {
      server.close()
      server.closeAllConnections()
      for (const socket of open) socket.destroy()
    },
  }
}
