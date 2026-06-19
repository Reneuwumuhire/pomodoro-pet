import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Web build for the Tauri shell (separate from electron.vite.config.ts). Reuses the
// SAME React renderer; outputs the multi-page bundle Tauri serves from `dist-web/`.
// Referenced by tauri.conf.json: beforeDevCommand `pnpm dev:web`, beforeBuildCommand `pnpm build:web`.
export default defineConfig({
  root: 'src/renderer',
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve('src/renderer/index.html'),
        mini: resolve('src/renderer/mini.html'),
        strict: resolve('src/renderer/strict.html'),
        blocked: resolve('src/renderer/blocked.html')
      }
    }
  }
})
