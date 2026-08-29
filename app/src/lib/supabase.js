// lib/supabase.js — Supabase 클라이언트 생성
// 앱 전체에서 이 하나의 supabase 인스턴스를 import해서 사용한다.
// 연결 정보는 .env 파일에서 읽는다(비밀정보를 코드에 직접 쓰지 않도록).

import { createClient } from '@supabase/supabase-js'

// Vite는 .env의 VITE_ 로 시작하는 변수를 import.meta.env로 노출한다
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// 설정값이 없으면 명확한 에러를 내서 개발자가 .env를 만들도록 안내한다
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase 설정이 없습니다. .env 파일에 VITE_SUPABASE_URL과 ' +
    'VITE_SUPABASE_PUBLISHABLE_KEY를 채워주세요 (.env.example 참고).'
  )
}

// Supabase 인스턴스 생성
// publishable key(공개 키)는 브라우저에서 사용해도 안전하다
export const supabase = createClient(supabaseUrl, supabaseKey)
