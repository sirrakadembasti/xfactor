import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const monacoEsmPath = fileURLToPath(new URL('./node_modules/monaco-editor/esm', import.meta.url))


export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'monaco-editor/esm': monacoEsmPath
    }
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['monaco-editor']
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true
      }
    }
  }
})
