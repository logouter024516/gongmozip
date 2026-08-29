// lib/supabase.js — Supabase 클라이언트 생성 + 사이트 URL 헬퍼
// 앱 전체에서 이 하나의 supabase 인스턴스를 import해서 사용한다.
// 연결 정보는 .env에서 읽는다(비밀정보를 코드에 직접 쓰지 않도록).

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase 설정이 없습니다. .env 파일에 VITE_SUPABASE_URL과 ' +
    'VITE_SUPABASE_PUBLISHABLE_KEY를 채워주세요 (.env.example 참고).'
  )
}

// 인증 헬퍼를 명시적으로 켠다:
// - flowType 'pkce': PKCE 코드 플로우(리프레시/보안 강화)
// - detectSessionInUrl: 이메일 확인/OAuth 콜백으로 돌아올 때
//   URL의 #access_token 프래그먼트를 자동으로 파싱해 세션 복원
// - autoRefreshToken / persistSession: 토큰 자동 갱신 + 브라우저 유지
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    autoRefreshToken: true,
    persistSession: true,
    storageKey: 'gongmozip.auth.token',
  },
})

// 배포 사이트의 절대 URL(Scheme 포함)을 돌려준다.
// VITE_SITE_URL이 있으면(배포) 그걸 쓰고, 없으면 현재 브라우저 origin을 사용한다.
export function getSiteUrl() {
  const envUrl = import.meta.env.VITE_SITE_URL
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/+$/, '')
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin
  }
  return envUrl || ''
}

// OAuth / 이메일 인증 후 돌아올 콜백 경로(전체 URL).
// 이메일 확인 완료 후 이 주소로 와서 AuthContext가 토큰 프래그먼트를 처리하고
// /auth/callback 라우트가 프래그먼트를 정리한다.
export function getAuthRedirectTo() {
  return getSiteUrl() + '/auth/callback'
}
