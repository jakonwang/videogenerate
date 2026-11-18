import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const webSrc = fileURLToPath(new URL('./src', import.meta.url))
const desktopSrc = fileURLToPath(new URL('../../src/renderer/src', import.meta.url))
// Desktop pages reused on the web keep their own `@/…` imports (desktop renderer source), except for these
// desktop-only modules, which get web stand-ins.
const DESKTOP_SHIMS: Record<string, string> = {
  'stores/aiProducer': 'lib/desktopShims/aiProducer.ts',
  'stores/cloudAuth': 'lib/desktopShims/cloudAuth.ts',
  'lib/localMedia': 'lib/desktopShims/localMedia.ts',
}
const isDesktopFile = (importer?: string) => Boolean(importer && /[\/]src[\/]renderer[\/]src[\/]/.test(importer))

// `--mode web` builds the browser version served at https://<domain>/app/ next to the cloud API.
// The default build is the Android App (Capacitor loads it from the app bundle root).
export default defineConfig(({ mode }) => ({
  base: mode === 'web' ? '/app/' : '/',
  plugins: [vue()],
  resolve: {
    // Shared desktop components live outside this app: make them use this app's single copy of these.
    dedupe: ['vue', 'vue-router', 'lucide-vue-next', 'pinia'],
    alias: [
      {
        find: /^@\/(.*)$/,
        replacement: '$1',
        async customResolver(this: any, id: string, importer?: string) {
          const shim = isDesktopFile(importer) ? DESKTOP_SHIMS[id.replace(/\.(ts|js)$/, '')] : undefined
          const target = shim ? `${webSrc}/${shim}` : `${isDesktopFile(importer) ? desktopSrc : webSrc}/${id}`
          return await this.resolve(target, importer, { skipSelf: true })
        },
      },
      { find: '@shared', replacement: fileURLToPath(new URL('../../src/shared', import.meta.url)) },
      { find: '@design', replacement: fileURLToPath(new URL('../../src/renderer/src/design-system', import.meta.url)) },
      // Desktop pages reused as-is on the web (e.g. 选品方案), backed by web stand-ins for window.api.
      { find: '@desktop-views', replacement: fileURLToPath(new URL('../../src/renderer/src/ui/views', import.meta.url)) },
      { find: '@desktop-src', replacement: fileURLToPath(new URL('../../src/renderer/src', import.meta.url)) },
    ],
  },
  server: {
    port: 18290,
    fs: { allow: [repoRoot] },
    // Local web version talks to the local cloud service as if it were the same domain.
    proxy: { '/api': { target: process.env.CLOUD_DEV_TARGET || 'http://127.0.0.1:18300', changeOrigin: true } },
  },
  build: { outDir: mode === 'web' ? 'dist-web' : 'dist', emptyOutDir: true, target: 'es2020' },
}))
