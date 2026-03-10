import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

/**
 * Vite config that builds the app as a single self-contained HTML file.
 * Used as the template for "Export as Interactive HTML" — the viewer-template.html
 * is fetched at export time, injected with data, and downloaded.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-viewer',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});
