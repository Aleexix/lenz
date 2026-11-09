import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // lenzd runs as its own detached process (Electron in node mode).
          lenzd: resolve(__dirname, '../../packages/daemon/src/main.ts'),
        },
      },
    },
  },
  preload: {},
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        // monaco-editor only exports its JS modules; the lean entry also needs its CSS files.
        'monaco-editor-esm': resolve(__dirname, 'node_modules/monaco-editor/esm/vs'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
