// pages/LoginPage.jsx — 로그인 화면
// 아이디(이메일)와 비밀번호로 로그인한다. 성공하면 홈으로 이동.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, getAuthRedirectTo } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffect } from 'react'

export default function LoginPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // 이미 로그인한 상태면 홈으로
  useEffect(() => { if (user) navigate('/', { replace: true }) }, [user, navigate])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (err) setError('로그인에 실패했습니다. 아이디와 비밀번호를 확인하세요.')
  }

  async function handleGoogle() {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getAuthRedirectTo() },
    })
    setBusy(false)
    if (error) setError('Google 로그인 연결에 실패했습니다. 잠시 후 다시 시도하세요.')
  }

  async function handleKakao() {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: getAuthRedirectTo() },
    })
    setBusy(false)
    if (error) setError('카카오 로그인 연결에 실패했습니다. 잠시 후 다시 시도하세요.')
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <Link to="/" className="auth-logo"><img src="/logo.svg" alt="공모집" className="auth-logo-img" />공모집</Link>
        <h1>공모집 로그인</h1>
        <p className="auth-sub">소규모 가구의 똑똑한 공동구매 시작하기</p>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <button type="button" className="btn btn-outline btn-block" onClick={handleGoogle} disabled={busy}>
          <svg className="g-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Google로 로그인
        </button>

        <button type="button" className="btn btn-outline btn-block btn-kakao" onClick={handleKakao} disabled={busy}>
          <svg className="g-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#381E1F" d="M12 3C6.48 3 2 6.58 2 11c0 2.52 1.42 4.75 3.64 6.2L5 20.6l2.9-1.57c.66.16 1.37.25 2.1.25 5.52 0 10-3.58 10-8S17.52 3 12 3z"/>
          </svg>
          카카오로 로그인
        </button>

        <div className="auth-divider"><span>또는 이메일로</span></div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">아이디(이메일)</label>
            <input
              id="email" type="email" value={email} required autoComplete="email"
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password" type="password" value={password} required autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn btn-block" disabled={busy}>
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <p className="auth-foot">
          공모집을 처음 이용하나요? <Link to="/signup">회원가입</Link>
        </p>
      </div>
    </div>
  )
}
