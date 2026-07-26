import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-hermes-runtime-'))
  const upstreamBodies: Record<string, unknown>[] = []
  const upstream = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404).end()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    upstreamBodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({
      id: 'chatcmpl-hermes-smoke',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4.1-mini',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'VG_HERMES_OK' },
        finish_reason: 'stop',
      }],
    }))
  })
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject)
    upstream.listen(0, '127.0.0.1', resolve)
  })
  const upstreamAddress = upstream.address()
  assert.ok(upstreamAddress && typeof upstreamAddress !== 'string')
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  const { agentOsService } = await import('../src/main/modules/agent-os/service')
  const { hermesRuntime } = await import('../src/main/modules/hermes/runtime')
  const { hermesAgentService } = await import('../src/main/modules/hermes/service')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
  let liveSessionId = ''
  let storedSessionId = ''
  try {
    await agentOsService.initialize()
    const { cloneService } = await import('../src/main/modules/clone/service')
    await cloneService.setModelCredentials({
      allowMockWhenNoKey: false,
      chatProviderPrimary: 'apifox_hub',
      chatApifoxHubProfile: 'vectorengine',
      vectorEngineHub: {
        enabled: true,
        baseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
        apiKey: 'hermes-smoke-key',
        chatProvider: 'openai',
        chatModel: 'gpt-4.1-mini',
        chatEndpointStyle: 'openai_chat',
        imageProvider: 'openai',
        imageModel: 'unused',
        imageEndpointStyle: 'openai_images',
        videoProvider: 'openai_video',
        videoEndpointStyle: 'openai_video',
        defaultPollIntervalMs: 1_000,
        defaultTimeoutMs: 60_000,
      },
    })
    const status = await hermesRuntime.start()
    assert.equal(status.state, 'ready')
    assert.equal(status.version, '0.17.0')
    const delegation = await hermesAgentService.getDelegationStatus()
    assert.ok(Array.isArray(delegation.active))
    assert.equal(typeof delegation.paused, 'boolean')
    const created = await hermesAgentService.createSession({ employeeId: 'employee.supervisor', channel: 'desktop' })
    liveSessionId = created.sessionId
    storedSessionId = created.storedSessionId
    assert.ok(created.storedSessionId)
    const browserStatus = await hermesAgentService.manageBrowser({ action: 'status', sessionId: liveSessionId })
    assert.equal(typeof browserStatus.connected, 'boolean')
    const backgroundStatus = await hermesAgentService.listBackgroundProcesses(liveSessionId)
    assert.ok(Array.isArray(backgroundStatus.processes))

    const completed = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error('Hermes did not complete the smoke prompt.'))
      }, 180_000)
      const unsubscribe = hermesAgentService.subscribe((events) => {
        const error = events.find((event) => event.sessionId === liveSessionId && event.type === 'error')
        if (error) {
          clearTimeout(timer)
          unsubscribe()
          reject(new Error(String(error.payload.message || 'Hermes generation failed')))
          return
        }
        const event = events.find((item) => item.sessionId === liveSessionId && item.type === 'message.complete')
        if (!event) return
        clearTimeout(timer)
        unsubscribe()
        resolve(String(event.payload.text || ''))
      })
    })
    await hermesAgentService.sendPrompt({
      sessionId: liveSessionId,
      text: 'Reply with exactly VG_HERMES_OK. Do not use tools.',
    })
    assert.match(await completed, /VG_HERMES_OK/)
    const titleDeadline = Date.now() + 30_000
    let generatedTitle = ''
    while (Date.now() < titleDeadline) {
      generatedTitle = String((await hermesAgentService.listSessions()).find((session) => session.id === storedSessionId)?.title || '')
      if (generatedTitle) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    assert.equal(generatedTitle, 'VG_HERMES_OK')
    const firstRequestTools = Array.isArray(upstreamBodies[0]?.tools)
      ? upstreamBodies[0].tools as Array<{ function?: { name?: string }; name?: string }>
      : []
    const firstRequestToolNames = firstRequestTools.map((tool) => String(tool.function?.name || tool.name || ''))
    assert.ok(firstRequestTools.length > 0)
    assert.ok(firstRequestTools.length <= 128, `Hermes submitted ${firstRequestTools.length} tools.`)
    assert.ok(firstRequestToolNames.some((name) => name.startsWith('mcp_videogenerate_')))
    assert.equal(firstRequestToolNames.some((name) => name.startsWith('mcp_hermes_studio_')), false)

    const editedCompleted = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error('Hermes did not complete the edited prompt.'))
      }, 180_000)
      const unsubscribe = hermesAgentService.subscribe((events) => {
        const error = events.find((event) => event.sessionId === liveSessionId && event.type === 'error')
        if (error) {
          clearTimeout(timer)
          unsubscribe()
          reject(new Error(String(error.payload.message || 'Hermes edited generation failed')))
          return
        }
        const event = events.find((item) => item.sessionId === liveSessionId && item.type === 'message.complete')
        if (!event) return
        clearTimeout(timer)
        unsubscribe()
        resolve(String(event.payload.text || ''))
      })
    })
    const editedPrompt = 'This is the edited user instruction. Reply with exactly VG_HERMES_OK.'
    await hermesAgentService.sendPrompt({
      sessionId: liveSessionId,
      text: editedPrompt,
      regenerateUserOrdinal: 0,
    })
    assert.match(await editedCompleted, /VG_HERMES_OK/)
    const editedRequest = JSON.stringify([...upstreamBodies]
      .reverse()
      .find((body) => JSON.stringify(body).includes('This is the edited user instruction')) || {})
    assert.match(editedRequest, /This is the edited user instruction/)
    assert.doesNotMatch(editedRequest, /Reply with exactly VG_HERMES_OK\. Do not use tools\./)

    const imagePath = path.join(root, 'hermes-native-attachment.png')
    const filePath = path.join(root, 'hermes-native-attachment.txt')
    await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
    await writeFile(filePath, 'VideoGenerate Hermes native file attachment.', 'utf8')
    const attachmentCompleted = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error('Hermes did not complete the attachment prompt.'))
      }, 180_000)
      const unsubscribe = hermesAgentService.subscribe((events) => {
        const error = events.find((event) => event.sessionId === liveSessionId && event.type === 'error')
        if (error) {
          clearTimeout(timer)
          unsubscribe()
          reject(new Error(String(error.payload.message || 'Hermes attachment generation failed')))
          return
        }
        const event = events.find((item) => item.sessionId === liveSessionId && item.type === 'message.complete')
        if (!event) return
        clearTimeout(timer)
        unsubscribe()
        resolve(String(event.payload.text || ''))
      })
    })
    await hermesAgentService.sendPrompt({
      sessionId: liveSessionId,
      text: 'Reply with exactly VG_HERMES_OK. Do not use tools.',
      attachments: [
        { path: imagePath, name: path.basename(imagePath), mediaType: 'image' },
        { path: filePath, name: path.basename(filePath), mediaType: 'file' },
      ],
    })
    assert.match(await attachmentCompleted, /VG_HERMES_OK/)
    assert.ok(upstreamBodies.some((body) => JSON.stringify(body).includes('image_url')))
    const attachmentHistory = await hermesAgentService.getHistory(liveSessionId)
    assert.match(JSON.stringify(attachmentHistory), /@file:/)

    await hermesRuntime.restart()
    const resumed = await hermesAgentService.resumeSession(storedSessionId)
    liveSessionId = resumed.sessionId
    assert.ok(liveSessionId)
    const restartedCompleted = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error('Hermes did not complete the prompt after a runtime restart.'))
      }, 180_000)
      const unsubscribe = hermesAgentService.subscribe((events) => {
        const error = events.find((event) => event.sessionId === liveSessionId && event.type === 'error')
        if (error) {
          clearTimeout(timer)
          unsubscribe()
          reject(new Error(String(error.payload.message || 'Hermes restart recovery failed')))
          return
        }
        const event = events.find((item) => item.sessionId === liveSessionId && item.type === 'message.complete')
        if (!event) return
        clearTimeout(timer)
        unsubscribe()
        resolve(String(event.payload.text || ''))
      })
    })
    await hermesAgentService.sendPrompt({
      sessionId: liveSessionId,
      text: 'Reply with exactly VG_HERMES_OK. Do not use tools.',
    })
    assert.match(await restartedCompleted, /VG_HERMES_OK/)

    const renamedTitle = 'VideoGenerate session management smoke'
    await hermesAgentService.renameSession({ sessionId: storedSessionId, title: renamedTitle })
    assert.equal((await hermesAgentService.listSessions()).find((session) => session.id === storedSessionId)?.title, renamedTitle)
    await hermesAgentService.deleteSession(storedSessionId)
    liveSessionId = ''
    assert.equal((await hermesAgentService.listSessions()).some((session) => session.id === storedSessionId), false)
    console.log('hermes-agent-runtime.smoke: ok')
  } finally {
    if (liveSessionId) await hermesAgentService.closeSession(liveSessionId).catch(() => undefined)
    await hermesRuntime.stop()
    closeCloneSqlite()
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}

void main()
