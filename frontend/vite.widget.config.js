import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bygger den inbäddningsbara widgeten till dist/widget.js.
// All CSS injiceras från JS så att en enda script-tagg räcker i WordPress.
// Widgeten bäddas in på arcticlodge.nu och måste därför peka på en
// absolut URL tillbaka till workern. Sätts vid bygget:
//   VITE_API_URL=https://waylo.<konto>.workers.dev npm run build:widget
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
