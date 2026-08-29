// context/AuthContext.jsx — 로그인 상태를 앱 전체에 제공하는 컨텍스트
// 로그인 여부와 현재 사용자 정보를 어느 컴포넌트에서든 useAuth()로 꺼내 쓴다.

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// 1) 컨텍스트 생성 (기본값 null)
const AuthContext = createContext(null)

// 2) Provider 컴포넌트: App의 최상단에서 <AuthProvider>로 감싼다
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)   // 로그인한 사용자(없으면 null)
  const [profile, setProfile] = useState(null) // profiles 테이블의 닉네임 등
  const [loading, setLoading] = useState(true) // 초기 로드가 끝났는지

  // 닉네임 프로필 가져오기
  async function loadProfile(id) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    setProfile(data)
  }

  // 3) 페이지 시작 시 로그인 상태 확인 + 세션 변경 감지 구독
  useEffect(() => {
    // 현재 세션(로그인 유지 여부) 조회
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      setLoading(false)
    })

    // 로그인/로그아웃 등 인증 상태가 바뀔 때마다 실행되는 구독
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      setProfile(null)
    })

    // 컴포넌트가 사라질 때 구독 정리
    return () => sub.subscription.unsubscribe()
  }, [])

  // 4) 로그아웃 함수: Supabase 세션 종료 + 화면 상태 초기화
  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  // 5) 다른 컴포넌트에 공유할 값 묶음
  const value = { user, profile, loading, signOut }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// 6) 훅: 컴포넌트에서 const { user, profile } = useAuth() 로 사용
// 컨텍스트 밖에서 쓰면 명확히 에러를 낸다
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 <AuthProvider> 안에서만 사용하세요')
  return ctx
}
