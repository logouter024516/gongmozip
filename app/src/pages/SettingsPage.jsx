// pages/SettingsPage.jsx — 사용자 설정 페이지
// 프로필 요약, 계정 정보, 화면 테마, 로그아웃을 그룹화해 보여준다.

import { useState } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getBrowserPosition, nearestRegion } from '../lib/location'

function Avatar({ name }) {
  // 이름의 첫 글자를 브랜드 배경 원에 표시
  const initial = (name || '?').trim().charAt(0) || '?'
  return (
    <div className="avatar" aria-hidden="true">{initial}</div>
  )
}

function SettingsBody() {
  const { user, profile, signOut } = useAuth()
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [location, setLocation] = useState(profile?.location ?? '')
  const [lat, setLat] = useState(profile?.latitude ?? null)
  const [lng, setLng] = useState(profile?.longitude ?? null)
  const [locBusy, setLocBusy] = useState(false)
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 브라우저 위치(geolocation)로 동네 자동 설정: 좌표 저장 + 인접 동네 라벨 표시
  async function detectLocation() {
    if (!('geolocation' in navigator)) {
      setError('이 브라우저는 위치정보를 지원하지 않아요. 동네를 직접 입력해주세요.')
      return
    }
    setLocBusy(true)
    setError('')
    try {
      const pos = await getBrowserPosition()
      setLat(pos.lat)
      setLng(pos.lng)
      const near = nearestRegion(pos.lat, pos.lng)
      if (near) setLocation(near)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.message)
    }
    setLocBusy(false)
  }

  // 닉네임/동네 저장 (수동으로 동네를 고치면 좌표는 무효화)
  async function saveProfile(e) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError('')
    const patch = { nickname, location }
    if (lat != null && lng != null) { patch.latitude = lat; patch.longitude = lng }
    const { error: err } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', user.id)
    setBusy(false)
    if (err) setError(err.message)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  // 테마 토글
  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('gmz-theme', next) } catch (e) { /* 무시 */ }
  }

  const displayName = profile?.nickname || user?.email?.split('@')[0] || '사용자'
  const email = user?.email ?? ''

  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1>사용자 설정</h1>
        <p>내 정보와 앱 환경을 관리해요.</p>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {saved && <div className="alert alert-success" role="status">변경 사항을 저장했어요!</div>}

      {/* 프로필 헤더 카드 */}
      <section className="card profile-card">
        <Avatar name={displayName} />
        <div className="profile-meta">
          <div className="profile-name">{displayName}</div>
          {email && <div className="profile-email">{email}</div>}
        </div>
      </section>

      {/* 계정 정보 */}
      <section className="settings-group">
        <h2 className="settings-group-title">계정 정보</h2>
        <div className="card settings-card">
          <div className="settings-row">
            <span className="settings-label">아이디(이메일)</span>
            <span className="settings-value">{email || '—'}</span>
          </div>
          <div className="settings-row row-form">
            <span className="settings-label">닉네임</span>
            <form onSubmit={saveProfile} className="nick-form">
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} required aria-label="닉네임" className="nick-input" />
            </form>
          </div>
          <div className="settings-row row-form">
            <span className="settings-label">동네(위치)</span>
            <div className="nick-form">
              <input
                value={location}
                onChange={(e) => { setLocation(e.target.value); setLat(null); setLng(null) }}
                aria-label="동네"
                className="nick-input"
                placeholder="예: 제주시"
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={detectLocation}
                disabled={locBusy}
                title="브라우저 위치로 동네 자동 설정"
              >
                {locBusy ? '확인 중…' : '내 위치로 자동 설정'}
              </button>
            </div>
            <div className="settings-desc">
              {lat != null && lng != null
                ? '지금 계신 곳(브라우저 위치)의 좌표로 설정돼요. 직접 고치면 좌표는 해제돼요.'
                : '버튼을 누르면 브라우저 위치(geolocation)로 가까운 동네를 자동 설정해요.'}
            </div>
          </div>
          <div className="settings-row">
            <button type="button" className="btn btn-sm" onClick={saveProfile} disabled={busy}>{busy ? '저장 중…' : '변경 사항 저장'}</button>
          </div>
        </div>
      </section>

      {/* 화면 설정 */}
      <section className="settings-group">
        <h2 className="settings-group-title">화면 설정</h2>
        <div className="card settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-label">화면 테마</div>
              <div className="settings-desc">밝은 화면 또는 어두운 화면을 선택해요.</div>
            </div>
            {/* 세그먼트 토글 */}
            <div className="theme-seg" role="radiogroup" aria-label="화면 테마">
              <button type="button" className={theme === 'light' ? 'seg active' : 'seg'} onClick={() => theme !== 'light' && toggleTheme()}>라이트</button>
              <button type="button" className={theme === 'dark' ? 'seg active' : 'seg'} onClick={() => theme !== 'dark' && toggleTheme()}>다크</button>
            </div>
          </div>
        </div>
      </section>

      {/* 계정 관리 */}
      <section className="settings-group">
        <h2 className="settings-group-title">계정 관리</h2>
        <div className="card settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-label">로그아웃</div>
              <div className="settings-desc">이 기기에서 공모집을 로그아웃해요.</div>
            </div>
            <button type="button" className="btn btn-sm btn-danger" onClick={signOut}>로그아웃</button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <SettingsBody />
      </Layout>
    </ProtectedRoute>
  )
}
