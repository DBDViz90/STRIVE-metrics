import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
<<<<<<< HEAD
  base: '/STRIVE-metrics/',
=======
  base: '/dashboard-responsiveness/',
>>>>>>> b500cfacd90762921c86c39fd98b38001ee79978
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
