// pages/RentPage.jsx — 대여 연결 페이지
// 필요한 물건을 '빌리고 싶어요' 요청 중심으로 등록 → 이웃이 '빌려드릴게요' 제안 → 요청자 승인.
// 흐름: open(모집 중) → matched(매칭) → in_use(대여 중) → done(반납 완료) → 재모집 가능.

import { useEffect, useMemo, useRef, useState } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import RentCard from '../components/RentCard'
import Modal from '../components/Modal'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../lib/toast'
import ImageUpload from '../components/ImageUpload'
import { getBrowserPosition, regionCoords } from '../lib/location'
import { findProfanity } from '../lib/profanity'
import { reverseGeocode } from '../lib/geocode'

const CATEGORIES = ['전체', '공구·도구', '가전·생활', '여행·캠핑', '기타']
const FORM_CATEGORIES = CATEGORIES.filter((c) => c !== '전체')

function CreateRentForm({ user, profile, onCreated }) {
  const currentUser = user
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [pricePerDay, setPricePerDay] = useState('')
  const [deposit, setDeposit] = useState('')
  const [category, setCategory] = useState(FORM_CATEGORIES[0])
  const [imageUrl, setImageUrl] = useState('')
  const [address, setAddress] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [coords, setCoords] = useState(null)

  // 등록 시점의 브라우저 위치 → 거리 정밀도 (실패 시 프로필/동네 좌표 폴백)
  const addressRef = useRef('')
  useEffect(() => {
    let mounted = true
    getBrowserPosition().then((p) => {
      if (!mounted) return
      setCoords(p)
      reverseGeocode(p.lat, p.lng).then((addr) => { if (mounted && addr && !addressRef.current) setAddress(addr) })
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  function reset() {
    setName(''); setDesc(''); setPricePerDay(''); setDeposit('')
    setCategory(FORM_CATEGORIES[0]); setImageUrl(''); setStartsOn(''); setEndsOn(''); setAddress(''); addressRef.current = ''
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!currentUser) { setError('로그인 정보를 확인할 수 없어요. 다시 로그인해주세요.'); return }
    const bad = findProfanity(name) || findProfanity(desc) || findProfanity(address)
    if (bad) { setError(`'${bad}'는 사용하기 어려운 표현이에요. 다른 문구로 바꿔주세요.`); return }
    if (startsOn && endsOn && new Date(endsOn) < new Date(startsOn)) {
      setError('종료일이 시작일보다 이전이에요.')
      return
    }
    setBusy(true)
    setError('')
    let lat = profile?.latitude ?? null
    let lng = profile?.longitude ?? null
    if (coords) { lat = coords.lat; lng = coords.lng }
    else if (lat == null || lng == null) {
      const c = regionCoords(profile?.location)
      if (c) { lat = c.lat; lng = c.lng }
    }
    const { error: err } = await supabase
      .from('rentals')
      .insert({
        name: name.trim(),
        description: desc.trim(),
        price_per_day: Number(pricePerDay) || 0,
        deposit: Number(deposit) || 0,
        category: category || '기타',
        image_url: imageUrl.trim(),
        address: address.trim(),
        requester_id: currentUser.id,
        status: 'open',
        latitude: lat,
        longitude: lng,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
      })
    setBusy(false)
    if (err) { setError(err.message); return }
    reset()
    setShow(false)
    toast('빌리고 싶은 물건을 올렸어요!')
    if (onCreated) onCreated()
  }

  return (
    <>
      <button type="button" className="btn btn-secondary l-btn-mobile-hide" onClick={() => setShow(true)}>
        <Plus size={18} strokeWidth={2.4} /> 빌리고 싶어요
      </button>
      <button type="button" className="fab" onClick={() => setShow(true)} aria-label="빌리고 싶어요">
        <Plus size={24} strokeWidth={2.4} />
      </button>

      <Modal open={show} title="빌리고 싶어요" onClose={() => setShow(false)}>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="rname">필요한 물건 이름</label>
            <input id="rname" value={name} required onChange={(e) => setName(e.target.value)} placeholder="예: 전동 드릴" />
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="rprice">하루 이용료(원)</label>
              <input id="rprice" type="number" min="0" value={pricePerDay} onChange={(e) => setPricePerDay(e.target.value)} placeholder="5000" />
            </div>
            <div className="field">
              <label htmlFor="rdep">보증금(원)</label>
              <input id="rdep" type="number" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="10000" />
            </div>
            <div className="field">
              <label htmlFor="rcat">카테고리</label>
              <select id="rcat" value={category} onChange={(e) => setCategory(e.target.value)}>
                {FORM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="rstart">필요한 시작일(선택)</label>
              <input id="rstart" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rend">반납 예정일(선택)</label>
              <input id="rend" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>대표 이미지</label>
            <ImageUpload value={imageUrl} onChange={setImageUrl} hint="찾고 있는 물건 사진을 올리면 더 잘 매칭돼요. 비우면 색상 카드가 나와요." />
          </div>
          <div className="field">
            <label htmlFor="raddr">상세 위치(선택)</label>
            <input
              id="raddr"
              value={address}
              onChange={(e) => { setAddress(e.target.value); addressRef.current = e.target.value }}
              placeholder="예: 상암동 월드컵공원 정문 앞 / 아파트 동·호수"
            />
            <span className="field-hint">내 위치(브라우저 설정) 기준 주소가 자동으로 채워져요. 동·호수 등은 직접 보완하세요.</span>
          </div>
          <div className="field">
            <label htmlFor="rdesc">설명(언제·얼마나 필요한지, 찾아갈 수 있는 곳 등)</label>
            <textarea id="rdesc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="예: 주말 2일 동안 쓰려고요. 상암동 아파트로 직접 찾아가도 돼요." />
          </div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button type="submit" className="btn btn-secondary btn-block" disabled={busy}>
            {busy ? '올리는 중…' : '빌리고 싶어요 올리기'}
          </button>
        </form>
      </Modal>
    </>
  )
}

function RentBody() {
  const { user, profile } = useAuth()
  const [rentals, setRentals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cat, setCat] = useState('전체')

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('rentals')
      .select('*, requester:profiles!rentals_requester_id_fkey(nickname), lender:profiles!rentals_lender_id_fkey(nickname)')
      .order('created_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    const flat = (data ?? []).map((r) => ({ ...r, requester_nickname: r.requester?.nickname, lender_nickname: r.lender?.nickname }))
    setRentals(flat)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(
    () => (cat === '전체' ? rentals : rentals.filter((r) => (r.category || '기타') === cat)),
    [rentals, cat]
  )

  const displayName = profile?.nickname || user?.email?.split('@')[0] || '이웃'

  return (
    <div className="container page">
      {/* 히어로 배너(대여 연결) */}
      <section className="l-hero l-hero-rent">
        <div>
          <span className="l-hero-badge">대여 연결</span>
          <h1>일 년에 두 번 쓸 물건은 <br />이웃에게 빌려 쓰세요</h1>
          <p>{displayName}님, 필요한 물건은 '빌리고 싶어요'로, 안 쓰는 물건은 이웃에게 제안해보세요.</p>
        </div>
      </section>

      <div className="l-cat-row" role="tablist" aria-label="카테고리 필터">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cat === c}
            className={`l-cat-chip${cat === c ? ' active' : ''}`}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="action-row">
        <CreateRentForm user={user} profile={profile} onCreated={load} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>불러오는 중…</div>
      ) : error ? (
        <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-6)' }}>
          목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.
        </div>
      ) : filtered.length === 0 ? (
        <div className="search-empty">
          {cat === '전체' ? '아직 대여 요청이 없어요. 필요한 물건을 먼저 올려보세요!' : `'${cat}' 카테고리에 대여 요청이 아직 없어요.`}
        </div>
      ) : (
        <div className="grid grid-2">
          {filtered.map((r) => (
            <RentCard key={r.id} rent={r} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function RentPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <RentBody />
      </Layout>
    </ProtectedRoute>
  )
}
