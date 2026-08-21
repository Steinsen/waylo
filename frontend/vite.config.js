import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bygger den fristående sajten (karta + chatt) för Cloudflare Pages.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
