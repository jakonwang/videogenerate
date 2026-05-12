import http from 'node:http'
import { configureAppPathRuntime, ensureAppDirs } from '../../src/main/lib/paths'
import { webPlatformRepo } from '../../src/main/modules/web-platform/repo'
import { handleWebApiRequest } from '../../src/main/modules/web-platform/webApiRouter'

const port = Number(process.env.VIDEOGENERATE_WEB_API_PORT || 18080)
const host = process.env.VIDEOGENERATE_WEB_API_HOST || '0.0.0.0'
const cwdDataDir = process.env.VIDEOGENERATE_DATA_DIR || `${process.cwd()}\\.videogenerate`

async function bootstrap() {
  configureAppPathRuntime({
    dataDir: cwdDataDir,
  })
  await ensureAppDirs()
  await webPlatformRepo.ensureSeed()

  const server = http.createServer((req, res) => {
    void handleWebApiRequest(req, res)
  })

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve())
  })

  console.log(`[videogen-web-api] listening on http://${host}:${port}`)
  console.log(`[videogen-web-api] data dir: ${cwdDataDir}`)
}

void bootstrap().catch((error) => {
  console.error('[videogen-web-api] bootstrap failed', error)
  process.exitCode = 1
})
