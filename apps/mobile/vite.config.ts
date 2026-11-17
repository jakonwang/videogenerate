import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../../src/shared', import.meta.url)),
      '@design': fileURLToPath(new URL('../../src/renderer/src/design-system', import.meta.url)),
    },
  },
  server: { port: 18290, fs: { allow: [repoRoot] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
})
