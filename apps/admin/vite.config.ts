import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:8090';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      '/api': apiProxyTarget,
      '/health': apiProxyTarget,
    },
  },
});
