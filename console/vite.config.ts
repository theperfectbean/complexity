import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
        target: 'http://192.168.0.105:3000',
        changeOrigin: true,
      }
    }
  }
})
