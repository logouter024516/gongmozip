// pages/SignupPage.jsx — 회원가입 화면
// 이메일/비밀번호/닉네임을 받아 Supabase Auth 계정과 profiles(닉네임)을 함께 만든다.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, getAuthRedirectTo } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffect } from 'react'
import { findProfanity } from '../lib/profanity'

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
  const [pendingEmail, setPendingEmail] = useState(null)

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
    const bad = findProfanity(nickname)
    if (bad) {
      setError(`'${bad}'는 사용하기 어려운 표현이에요. 닉네임을 바꿔주세요.`)
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
      // 이미 가입된 이메일은 로그인 안내로 친절하게 처리
      if (/already registered|이미 등록|already exists/i.test(authErr.message)) {
        setError('이미 가입한 이메일이에요. 로그인 페이지에서 로그인해주세요.')
      } else {
        setError(authErr.message)
      }
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
    else {
      setPendingEmail(email)
      setError('가입 확인 메일을 보냈어요. 메일함(스팸함 포함)을 확인하고 링크를 눌러 인증을 완료해주세요. 메일이 안 오면 아래 버튼으로 다시 보내드려요.')
    }
  }

  async function resendEmail() {
    if (!pendingEmail) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: pendingEmail,
      options: { emailRedirectTo: getAuthRedirectTo() },
    })
    setBusy(false)
    if (error) {
      if (/already confirmed|이미 인증/i.test(error.message)) {
        setError('이미 인증된 이메일이에요. 로그인 페이지에서 바로 로그인해주세요.')
        setPendingEmail(null)
      } else {
        setError(`다시 보내는데 실패했어요. 잠시 후 시도해주세요. (${error.message})`)
      }
    } else {
      setError('확인 메일을 다시 보냈어요. 스팸함도 확인해주세요.')
    }
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
        <h1>회원가입</h1>
        <p className="auth-sub">공모집에서 함께 나누는 이웃이 되어보세요</p>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        {pendingEmail && (
          <div className="auth-resend">
            <button type="button" className="btn btn-outline btn-block" onClick={resendEmail} disabled={busy}>
              {busy ? '보내는 중…' : '확인 메일 다시 보내기'}
            </button>
            <p className="auth-sub">인증 후 자동으로 홈으로 이동해요. 안 오면 스팸/프로모션 폴더를 확인해주세요.</p>
          </div>
        )}

        <button type="button" className="btn btn-outline btn-block" onClick={handleGoogle} disabled={busy}>
          <svg className="g-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Google로 시작하기
        </button>

        <button type="button" className="btn btn-outline btn-block btn-kakao" onClick={handleKakao} disabled={busy}>
          <svg className="g-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#381E1F" d="M12 3C6.48 3 2 6.58 2 11c0 2.52 1.42 4.75 3.64 6.2L5 20.6l2.9-1.57c.66.16 1.37.25 2.1.25 5.52 0 10-3.58 10-8S17.52 3 12 3z"/>
          </svg>
          카카오로 시작하기
        </button>

        <div className="auth-divider"><span>또는 이메일로 가입</span></div>

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
