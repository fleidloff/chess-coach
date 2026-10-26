import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works on Vercel and on a GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
})
