import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 9512,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:9532',
        changeOrigin: true,
      },
    },
    // p12.sumzip.com 으로 프록시될 때 HMR 차단 방지
    allowedHosts: ['p12.sumzip.com', 'localhost'],
  },
  preview: {
    host: '0.0.0.0',
    port: 9512,
    strictPort: true,
    // 운영(p12.sumzip.com)에서는 호스트 nginx 가 /api 를 구분하지 않고 9512 로만 보내므로
    // preview 서버가 직접 /api 를 백엔드(9532)로 프록시한다.
    proxy: {
      '/api': {
        target: 'http://localhost:9532',
        changeOrigin: true,
      },
    },
    allowedHosts: ['p12.sumzip.com', 'localhost'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
