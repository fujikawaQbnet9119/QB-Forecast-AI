import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProduction = mode === 'production';

  return {
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
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      // Production optimizations
      target: 'es2015',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: isProduction,
          drop_debugger: isProduction,
        },
      },
      // Code splitting
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'chart-vendor': ['recharts'],
            'ai-vendor': ['@google/genai', 'marked', 'katex'],
            'utils': ['papaparse']
          },
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
