const assert = require('node:assert/strict')
const { mkdtemp, rm } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-hermes-gateway-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIDEOGENERATE_DATA_DIR: dataDir,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 60_000,
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.hermes-workspace', { timeout: 60_000 })

    const automaticallyStarted = await page.evaluate(() => window.api.hermes.getGatewayStatus())
    assert.equal(automaticallyStarted.running, true)
    assert.ok(Number(automaticallyStarted.pid || 0) > 0)

    const stopped = await page.evaluate(() => window.api.hermes.stopGateway())
    assert.equal(stopped.running, false)

    const started = await page.evaluate(() => window.api.hermes.startGateway())
    assert.equal(started.running, true)
    assert.ok(Number(started.pid || 0) > 0)

    const restarted = await page.evaluate(() => window.api.hermes.restartGateway())
    assert.equal(restarted.running, true)
    assert.ok(Number(restarted.pid || 0) > 0)

    const finalStopped = await page.evaluate(() => window.api.hermes.stopGateway())
    assert.equal(finalStopped.running, false)

    console.log(JSON.stringify({ automaticallyStarted, started, restarted, finalStopped }))
    console.log('hermes-gateway-lifecycle.e2e: ok')
  } finally {
    await app.close().catch(() => undefined)
    await rm(dataDir, { recursive: true, force: true })
  }
}

void main()
