// pages/SignupPage.jsx — 회원가입 화면
// 이메일/비밀번호/닉네임을 받아 Supabase Auth 계정과 profiles(닉네임)을 함께 만든다.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, getAuthRedirectTo } from '../lib/supabase'
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

  function isValidEmailFormat(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
  }

  async function hasMailDomain(email) {
    const domain = email.split('@')[1] || ''
    if (domain.includes('..') || /[^a-z0-9.\-]/i.test(domain) || !domain.includes('.')) return false
    try {
      const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`)
      if (!res.ok) return true
      const json = await res.json()
      if (json && (json.Answer || []).some((a) => a.type === 15)) return true
      return !!json && (json.Answer || []).length > 0
    } catch {
      return true
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')

    if (!isValidEmailFormat(email)) {
      setError('올바른 이메일 형식이 아니에요. 예: you@example.com')
      setBusy(false)
      return
    }
    const domainOk = await hasMailDomain(email)
    if (!domainOk) {
      setError('이메일의 도메인이 존재하지 않거나 메일을 받을 수 없는 주소예요. 확인 후 다시 입력해주세요.')
      setBusy(false)
      return
    }

    // 1) Supabase Auth에 사용자 생성 (이메일/비밀번호)
    // emailRedirectTo: 확인 메일의 링크를 클릭하면 이 주소로 돌아와 세션을 복원한다.
    const { data, error: authErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectTo(),
        data: { nickname },
      },
    })
    if (authErr) {
      setError(authErr.message)
      setBusy(false)
      return
    }

    // 2) profiles 테이블에 닉네임 기록(이미 있으면 유지)
    if (data?.user && nickname) {
      await supabase.from('profiles').upsert(
        { id: data.user.id, nickname },
        { onConflict: 'id' }
      )
    }

    setBusy(false)
    // 이메일 확인이 꺼져 있으면 세션이 바로 생겨 홈으로,
    // 켜져 있으면 확인 메일을 보냈다고 안내한다.
    if (data?.session) navigate('/', { replace: true })
    else setError('가입 확인 메일을 보냈어요. 메일함을 확인하고 링크를 눌러 인증을 완료해주세요.')
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
