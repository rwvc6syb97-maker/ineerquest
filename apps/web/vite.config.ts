import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// InnerQuest 前端开发服务器配置
// 代理 /api 到后端 NestJS（默认 3000 端口）
export default defineConfig({
  plugins: [react()],
  base: '/ineerquest/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});