import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProduction = mode === 'production';

  return {
    base: '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, '.'),
      }
    },
    build: {
      // Production optimizations
      target: 'es2015',
      // Minify using default esbuild (no terser needed)
      minify: 'esbuild',

      // Code splitting configuration
      rollupOptions: {
        output: {
          manualChunks: undefined // Let Vite handle chunking automatically
        },
      },

      // Chunk size warnings
      chunkSizeWarningLimit: 1000,

      // Source maps for debugging (disable in production for smaller builds)
      sourcemap: !isProduction,
    },
    // Optimize dependencies
    optimizeDeps: {
      include: ['react', 'react-dom', 'recharts', '@google/genai', 'marked', 'katex', 'papaparse'],
    },
  };
});
