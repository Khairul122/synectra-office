import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', 'APP_');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/health': `http://${env.APP_HOST || '127.0.0.1'}:${env.APP_PORT || '3000'}`,
        '/whatsapp': `http://${env.APP_HOST || '127.0.0.1'}:${env.APP_PORT || '3000'}`
      }
    }
  };
});
