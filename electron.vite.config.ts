import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

/**
 * 授权模式（编译期写死，用户无法在运行时修改）：
 *   - npm run dev：默认 off（不限制），可用 VG_LICENSE_MODE=enforced 本地验证商业版
 *   - npm run build / dist：默认 enforced（商业版，必须登录且会员有效）
 *   - npm run dist:internal：off（内部不限制版）
 */
export default defineConfig(({ command }) => {
  const licenseMode = process.env.VG_LICENSE_MODE === 'off' || process.env.VG_LICENSE_MODE === 'enforced' ? process.env.VG_LICENSE_MODE : command === 'build' ? 'enforced' : 'off'
  const cloudApiBase = (process.env.VG_CLOUD_API_BASE || 'http://127.0.0.1:18300').trim()
  if (command === 'build') {
    console.log(`[build] license mode: ${licenseMode}, cloud api: ${cloudApiBase}`)
    if (licenseMode === 'enforced' && /127\.0\.0\.1|localhost/.test(cloudApiBase)) {
      console.warn('[build] 警告：商业版的云端地址仍是本机地址，发布前请设置 VG_CLOUD_API_BASE=https://你的云端域名')
    }
  }
  return {
  main: {
    define: {
      __VG_LICENSE_MODE__: JSON.stringify(licenseMode),
      __VG_CLOUD_API_BASE__: JSON.stringify(cloudApiBase),
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          backgroundRecordStoreWorker: resolve(__dirname, 'src/main/workers/backgroundRecordStoreWorker.ts'),
          gmvMaxWorker: resolve(__dirname, 'src/main/workers/gmvMaxWorker.ts'),
        },
        // 这些包依赖自身 __dirname 计算二进制路径；打包进 main bundle 会导致路径错误（ENOENT）
        external: [
          'ffmpeg-static',
          'ffprobe-static',
          '@remotion/bundler',
          '@remotion/renderer',
          'remotion',
          'sharp',
          '@img/sharp-win32-x64',
          '@img/sharp-wasm32',
        ],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
    plugins: [vue()],
  },
}
})
