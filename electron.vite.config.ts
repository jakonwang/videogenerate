import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
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
})

