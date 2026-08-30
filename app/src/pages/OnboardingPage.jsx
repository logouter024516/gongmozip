// pages/OnboardingPage.jsx — 신규 가입자 온보딩
// 첫 가입 사용자가 앱에 진입하기 전, 브라우저 위치(geolocation)로 동네를 설정한다.
// 1) "내 위치 사용하기" → 브라우저 좌표 획득 → 가장 가까운 동네 라벨 저장
// 2) 실패/거부 시 동네 직접 입력 폴백
// 3) "나중에" → 위치 없이 온보딩 통과 (onboarded=true)
// 완료 시 refreshProfile()로 프로필 갱신 후 홈 이동.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getBrowserPosition, nearestRegion, REGION_COORDS } from '../lib/location'
import { reverseGeocode } from '../lib/geocode'

const REGION_KEYS = Object.keys(REGION_COORDS)

function OnboardBody() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [locating, setLocating] = useState(false)
  const [pos, setPos] = useState(null)        // { lat, lng } 브라우저 좌표
  const [label, setLabel] = useState('')      // 파싱된 동네 라벨 (좌표 or 수동)
  const [manual, setManual] = useState(false) // 위치 획득 실패 → 수동 입력 모드
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 온보딩을 이미 마쳤으면 홈으로
  useEffect(() => {
    if (profile?.onboarded) navigate('/', { replace: true })
  }, [profile, navigate])

  const displayName = profile?.nickname || user?.email?.split('@')[0] || '이웃'

  // 브라우저 위치로 동네 캐치: 버튼 클릭 시 호출
  async function useMyLocation() {
    setLocating(true)
    setError('')
    setManual(false)
    try {
      const p = await getBrowserPosition()
      setPos(p)
      // 동 단위까지 뒤져오고, 실패하면 기존 시/도 근방 라벨로 폴백
      const addr = await reverseGeocode(p.lat, p.lng)
      setLabel(addr || (nearestRegion(p.lat, p.lng) ?? ''))
    } catch (e) {
      setError(e.message)
      setManual(true)
    }
    setLocating(false)
  }

  // 좌표 + 동네 라벨을 프로필에 저장 후 온보딩 마무리
  async function finish(extra = {}) {
    if (!user) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({ ...extra, onboarded: true })
      .eq('id', user.id)
    if (err) { setBusy(false); setError(err.message); return }
    // 저장이 실제 반영됐는지 프로필로 재확인 (안 되면 로그인 세션 문제 → 무한 루프 방지)
    const p = await refreshProfile()
    setBusy(false)
    if (!p?.onboarded) { setError('프로필을 저장하지 못했어요. 잠시 후 다시 시도해주세요.'); return }
    navigate('/', { replace: true })
  }

  const confirmDisabled = busy || locating

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <span className="l-hero-badge">환영합니다</span>
        <h1>반가워요, {displayName}님!</h1>
        <p className="auth-sub">공모집은 이웃과 같이 사고, 같이 배송받고, 서로 빌려요. 먼저 내 동네를 알려주세요.</p>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        {/* 위치 설정 (브라우저 좌표 기반) */}
        {!manual && (
          <div className="field" style={{ marginTop: 'var(--space-6)' }}>
            <label htmlFor="onb-loc">내 동네(위치) 설정</label>
            <button
              type="button"
              id="onb-loc"
              className="btn btn-block"
              disabled={locating || busy}
              onClick={useMyLocation}
            >
              {locating ? '위치 확인 중…' : '내 위치 사용하기'}
            </button>
            <p className="field-hint">브라우저 위치 권한을 허용하면 지금 계신 곳을 동 단위(예: 경기도 부천시 중동)로 찾아 자동 설정해요. 가까운 이웃과 매칭에 쓰여요.</p>
          </div>
        )}

        {/* 좌표 획득 성공 → 확인 */}
        {pos && (
          <div className="field" style={{ marginTop: 'var(--space-4)' }}>
            <div className="onb-loc-preview">
              {label ? `내 동네: ${label}` : '좌표 확인 완료 (주소를 자동으로 찾지 못했어요)'}
            </div>
            <button
              type="button"
              className="btn btn-block"
              disabled={confirmDisabled}
              onClick={() => finish(label ? { location: label, latitude: pos.lat, longitude: pos.lng } : { latitude: pos.lat, longitude: pos.lng })}
            >
              {busy ? '저장 중…' : '이 동네로 시작하기'}
            </button>
          </div>
        )}

        {/* 수동 입력 폴백 (위치 거부/실패) */}
        {manual && (
          <div className="field" style={{ marginTop: 'var(--space-4)' }}>
            <label htmlFor="onb-manual-loc">동네를 직접 입력해도 좋아요</label>
            <input
              id="onb-manual-loc"
              list="onb-regions"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 경기도 부천시 중동"
            />
            <datalist id="onb-regions">
              {REGION_KEYS.map((r) => <option key={r} value={r} />)}
            </datalist>
            <button
              type="button"
              className="btn btn-block"
              disabled={busy}
              onClick={() => finish(label ? { location: label.trim() } : {})}
            >
              {busy ? '저장 중…' : label.trim() ? '이 동네로 시작하기' : '동네 없이 시작하기'}
            </button>
          </div>
        )}

        {/* 나중에 설정 */}
        <div style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy || locating}
            onClick={() => finish({})}
          >
            나중에 설정할게요
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const { loading, user } = useAuth()
  if (loading) return <div style={{ padding: 'var(--space-16)', textAlign: 'center' }}>불러오는 중…</div>
  if (!user) return null
  return (
    <Layout>
      <OnboardBody />
    </Layout>
  )
}