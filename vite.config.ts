import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/norikae/',
  build: { target: 'es2022', manifest: true },
})
