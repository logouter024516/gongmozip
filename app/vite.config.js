// vite.config.js — Vite 빌드 설정
// 별도 플러그인 없이도 React JSX를 자동으로 처리한다(esbuild).
import { defineConfig } from 'vite'

export default defineConfig({
  // 서버 시작 시 자동으로 브라우저를 열어주는 편의 옵션
  server: {
    open: true,
  },
})
