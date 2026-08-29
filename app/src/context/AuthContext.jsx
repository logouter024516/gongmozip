// context/AuthContext.jsx — 로그인 상태를 앱 전체에 제공하는 컨텍스트
// 로그인 여부와 사용자/프로필 정보를 useAuth()로 꺼내 쓴다.
// 이메일 확인·OAuth 콜백 뒤 돌아온 프래그먼트 토큰도 여기서 처리한다.

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// profiles 테이블에서 프로필을 불러온다(없으면 null).
async function fetchProfile(id) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data
}

// 프로필이 없으면 자동 생성한다(트리거가 없는 환경에서도 FK 깨짐 방지).
async function ensureProfile(id, email) {
  const existing = await fetchProfile(id)
  if (existing) return existing

  const nickname =
    (email || '').split('@')[0] ||
    '동네 이웃'

  const { data, error } = await supabase
    .from('profiles')
    .insert({ id, nickname })
    .select('*')
    .maybeSingle()

  if (error || !data) return { id, nickname }
  return data
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const syncingRef = useRef(false)

  // 세션/사용자 상태를 한 곳에서 동기화
  async function sync(session) {
    const u = session?.user ?? null
    setUser(u)
    if (!u) {
      setProfile(null)
      return
    }
    // 같은 사용자면 중복 fetch 방지
    if (syncingRef.current === u.id) return
    syncingRef.current = u.id
    const p = await ensureProfile(u.id, u.email)
    setProfile(p)
  }

  useEffect(() => {
    let active = true

    async function init() {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      await sync(data.session)
      if (active) setLoading(false)
    }

    init()

    // 인증 이벤트 처리: 로그인/로그아웃/토큰 갱신 등
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      sync(session)
      if (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION') {
        if (active) setLoading(false)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const value = { user, profile, loading, signOut }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 <AuthProvider> 안에서만 사용하세요')
  return ctx
}
