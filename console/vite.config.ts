import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxyTarget = process.env.CONSOLE_API_PROXY_TARGET ?? 'http://192.168.0.105:3002'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      }
    }
  }
})
