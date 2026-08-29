// pages/SignupPage.jsx — 회원가입 화면
// 이메일/비밀번호/닉네임을 받아 Supabase Auth 계정과 profiles(닉네임)을 함께 만든다.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffect } from 'react'

export default function SignupPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // 이미 로그인한 상태면 홈으로
  useEffect(() => { if (user) navigate('/', { replace: true }) }, [user, navigate])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')

    // 1) Supabase Auth에 사용자 생성 (이메일/비밀번호)
    const { data, error: authErr } = await supabase.auth.signUp({ email, password })
    if (authErr) {
      setError(authErr.message)
      setBusy(false)
      return
    }

    // 2) profiles 테이블에 닉네임 기록 생성 (auth.users.id 와 연결)
    if (data?.user) {
      const { error: profileErr } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, nickname })
      if (profileErr) setError(`계정은 생성됐지만 닉네임 저장에 실패: ${profileErr.message}`)
    }

    setBusy(false)
    // 이메일 확인이 필요하면 안내, 아니면 자동으로 홈 이동
    // (Supabase 설정이 이메일 확인 끔이면 session이 바로 생겨 홈으로 간다)
    if (data?.session) navigate('/', { replace: true })
    else setError('가입 완료! 이메일 인증 후 로그인해주세요.')
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>회원가입</h1>
        <p className="auth-sub">공모집에서 함께 나누는 이웃이 되어보세요</p>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="nickname">닉네임</label>
            <input id="nickname" value={nickname} required onChange={(e) => setNickname(e.target.value)} placeholder="예: 동네 이웃" />
          </div>
          <div className="field">
            <label htmlFor="email">아이디(이메일)</label>
            <input id="email" type="email" value={email} required autoComplete="email" onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input id="password" type="password" value={password} required minLength={6} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} placeholder="6자 이상" />
          </div>
          <button type="submit" className="btn btn-block" disabled={busy}>{busy ? '만드는 중…' : '가입하기'}</button>
        </form>

        <p className="auth-foot">이미 계정이 있나요? <Link to="/login">로그인</Link></p>
      </div>
    </div>
  )
}
