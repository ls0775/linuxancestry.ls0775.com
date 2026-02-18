import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'd3-vendor': ['d3'],
          'animation-vendor': ['framer-motion'],
        }
      }
    }
  }
})
