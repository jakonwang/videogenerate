import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import postcss from 'postcss'
import { defineConfig, type Plugin } from 'vite'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const webSrc = fileURLToPath(new URL('./src', import.meta.url))
const desktopSrc = fileURLToPath(new URL('../../src/renderer/src', import.meta.url))
// Desktop pages reused on the web keep their own `@/…` imports (desktop renderer source), except for these
// desktop-only modules, which get web stand-ins.
const DESKTOP_SHIMS: Record<string, string> = {
  'stores/aiProducer': 'lib/desktopShims/aiProducer.ts',
  'stores/cloudAuth': 'lib/desktopShims/cloudAuth.ts',
  'lib/localMedia': 'lib/desktopShims/localMedia.ts',
  // 电脑端本机 Web API 客户端 → 交给服务器引擎（批量字幕）
  'lib/webApiClient': 'lib/desktopShims/webApiClient.ts',
  // 电脑端文案包只带中文（网页版界面固定中文），省掉英文 / 越南文约 2/3 的下载量
  i18n: 'lib/desktopShims/i18n.ts',
}
const isDesktopFile = (importer?: string) => Boolean(importer && /[\/]src[\/]renderer[\/]src[\/]/.test(importer))

/**
 * Desktop pages reused on the web keep part of their theme rules (light / mono colour fixes, layout) in the desktop's
 * global styles.css, which the web does not load. This virtual stylesheet is built from styles.css at build time and
 * keeps only the rules that target these legacy page roots (original order, `.app-shell` also matching `.web-shell`),
 * so the rules stay in one place and the desktop is untouched.
 */
const LEGACY_PAGE_ROOTS = ['.live-photo-page', '.listing-page']
const PAGE_THEMES_ID = 'virtual:desktop-page-themes.css'
function desktopPageThemes(): Plugin {
  const stylesPath = fileURLToPath(new URL('../../src/renderer/src/styles.css', import.meta.url))
  return {
    name: 'desktop-page-themes',
    resolveId: (id) => (id === PAGE_THEMES_ID ? `\0${PAGE_THEMES_ID}` : undefined),
    load(id) {
      if (id !== `\0${PAGE_THEMES_ID}`) return undefined
      this.addWatchFile(stylesPath)
      const root = postcss.parse(readFileSync(stylesPath, 'utf8'))
      root.walkComments((comment) => void comment.remove())
      root.walkRules((rule) => {
        if (rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as postcss.AtRule).name)) return
        const kept = rule.selectors.filter((selector) => LEGACY_PAGE_ROOTS.some((cls) => new RegExp(`\\.${cls.slice(1)}(?![\\w-])`).test(selector)))
        if (!kept.length) rule.remove()
        else rule.selectors = kept.map((selector) => selector.replace(/\.app-shell(?![\w-])/g, ':is(.app-shell, .web-shell)'))
      })
      // Drop at-rules left empty (media queries whose rules were all removed); keep keyframes / font-face.
      root.walkAtRules((atRule) => {
        if (!/keyframes$|font-face/i.test(atRule.name) && !atRule.nodes?.some((node) => node.type === 'rule' || node.type === 'atrule')) atRule.remove()
      })
      return root.toString()
    },
  }
}

// `--mode web` builds the browser version served at https://<domain>/app/ next to the cloud API.
// The default build is the Android App (Capacitor loads it from the app bundle root).
export default defineConfig(({ mode }) => ({
  base: mode === 'web' ? '/app/' : '/',
  plugins: [vue(), desktopPageThemes()],
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
      { find: /^@desktop-src\/i18n$/, replacement: fileURLToPath(new URL('./src/lib/desktopShims/i18n.ts', import.meta.url)) },
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
