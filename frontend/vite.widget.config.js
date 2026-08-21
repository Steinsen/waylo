import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bygger den inbäddningsbara widgeten till dist/widget.js.
// All CSS injiceras från JS så att en enda script-tagg räcker i WordPress.
export default defineConfig({
  plugins: [react()],
  // Lib-läget ersätter inte process.env automatiskt — utan detta hamnar
  // Reacts utvecklingsbygge i bundlen och sidan kraschar på "process is
  // not defined".
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: 'src/widget.jsx',
      name: 'WayLoWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
  },
});
