import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../back/public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/');

          if (normalizedId.includes('highlight.js/lib/languages/')) {
            return 'code-languages';
          }

          if (
            normalizedId.includes('/node_modules/@tiptap/') ||
            normalizedId.includes('/node_modules/prosemirror-') ||
            normalizedId.includes('/node_modules/prosemirror/') ||
            normalizedId.includes('/node_modules/lowlight/') ||
            normalizedId.includes('/node_modules/highlight.js/')
          ) {
            return 'editor-vendor';
          }

          if (normalizedId.includes('/node_modules/lucide-react/')) {
            return 'icons';
          }

          if (normalizedId.includes('/node_modules/')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
