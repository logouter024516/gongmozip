// pages/AuthCallback.jsx — 이메일 인증/OAuth 콜백 처리 화면
// Supabase가 #access_token 프래그먼트로 돌아왔을 때:
// 1) AuthProvider(getSession)가 이미 토큰을 파싱해 세션 복원을 마친다
// 2) 이 화면은 로딩이 끝나면 프래그먼트를 정리하고 홈으로 이동한다

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthCallback() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [cleaned, setCleaned] = useState(false)

  useEffect(() => {
    // 인증 프래그먼트(#access_token=...)가 남아있으면 지워 깨끗한 URL로 만든다
    if (window.location.hash && /access_token|error|type=/.test(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setCleaned(true)
  }, [])

  useEffect(() => {
    if (!loading) {
      navigate(user ? '/' : '/login', { replace: true })
    }
  }, [loading, user, navigate])

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <h1>{cleaned ? '공모집으로 이동 중…' : '확인 중…'}</h1>
      </div>
    </div>
  )
}
