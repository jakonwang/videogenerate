import WebSocket from 'ws'
import type { HermesGatewayEvent } from './types'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

type RawFrame = {
  id?: string | number | null
  method?: string
  params?: { type?: string; session_id?: string; payload?: Record<string, unknown> }
  result?: unknown
  error?: { message?: string }
}

export class HermesGatewayClient {
  private socket: WebSocket | null = null
  private nextRequestId = 0
  private nextSequence = 0
  private pending = new Map<string | number, PendingRequest>()
  private listeners = new Set<(event: HermesGatewayEvent) => void>()

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  async connect(url: string, timeoutMs = 15_000) {
    if (this.connected) return
    await this.close()
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url)
      const timer = setTimeout(() => {
        socket.terminate()
        reject(new Error('Timed out connecting to Hermes'))
      }, timeoutMs)
      const fail = (error: Error) => {
        clearTimeout(timer)
        reject(error)
      }
      socket.once('open', () => {
        clearTimeout(timer)
        this.socket = socket
        resolve()
      })
      socket.once('error', fail)
      socket.on('message', (data) => this.handleFrame(String(data)))
      socket.on('close', () => {
        if (this.socket === socket) this.socket = null
        this.rejectPending(new Error('Hermes connection closed'))
      })
    })
  }

  async close() {
    const socket = this.socket
    this.socket = null
    if (!socket) return
    await new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) return resolve()
      const timer = setTimeout(() => {
        socket.terminate()
        resolve()
      }, 1_500)
      socket.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.close()
    })
  }

  subscribe(listener: (event: HermesGatewayEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<T> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Hermes is not connected'))
    }
    const id = `vg-${++this.nextRequestId}`
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Hermes request timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer })
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }), (error) => {
        if (!error) return
        const pending = this.pending.get(id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(id)
        reject(error)
      })
    })
  }

  private handleFrame(raw: string) {
    let frame: RawFrame
    try {
      frame = JSON.parse(raw) as RawFrame
    } catch {
      return
    }
    if (frame.id !== undefined && frame.id !== null) {
      const pending = this.pending.get(frame.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(frame.id)
      if (frame.error) pending.reject(new Error(frame.error.message || 'Hermes request failed'))
      else pending.resolve(frame.result)
      return
    }
    if (frame.method !== 'event' || !frame.params?.type) return
    const event: HermesGatewayEvent = {
      sequence: ++this.nextSequence,
      type: frame.params.type,
      sessionId: frame.params.session_id,
      payload: frame.params.payload || {},
      createdAt: Date.now(),
    }
    for (const listener of this.listeners) listener(event)
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}
