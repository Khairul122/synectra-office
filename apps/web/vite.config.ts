import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', 'APP_');
  return {
    envDir: '../..',
    plugins: [react()],
    server: {
      proxy: {
        '/auth': { target: `http://${env.APP_HOST || '127.0.0.1'}:${env.APP_PORT || '3000'}`, changeOrigin: true },
        '/api': { target: `http://${env.APP_HOST || '127.0.0.1'}:${env.APP_PORT || '3000'}`, changeOrigin: true },
        '/health': { target: `http://${env.APP_HOST || '127.0.0.1'}:${env.APP_PORT || '3000'}`, changeOrigin: true },
        '/whatsapp': { target: `http://${env.APP_HOST || '127.0.0.1'}:${env.APP_PORT || '3000'}`, changeOrigin: true }
      }
    }
  };
});
