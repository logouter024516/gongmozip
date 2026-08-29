// pages/RentPage.jsx — 대여 연결 페이지
// 장기 보유가 필요 없는 물건을 이웃끼리 단기 대여하는 시스템.
// 등록 → 대여 신청(reserved) → 승인(on_loan) → 반납 확인(returned) → 재등록 흐름.

import { useEffect, useMemo, useState } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import RentCard from '../components/RentCard'
import Modal from '../components/Modal'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../lib/toast'
import ImageUpload from '../components/ImageUpload'

const CATEGORIES = ['전체', '공구·도구', '가전·생활', '여행·캠핑', '기타']
const FORM_CATEGORIES = CATEGORIES.filter((c) => c !== '전체')

function CreateRentForm({ user, onCreated }) {
  const currentUser = user
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [pricePerDay, setPricePerDay] = useState('')
  const [deposit, setDeposit] = useState('')
  const [category, setCategory] = useState(FORM_CATEGORIES[0])
  const [imageUrl, setImageUrl] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setName(''); setDesc(''); setPricePerDay(''); setDeposit('')
    setCategory(FORM_CATEGORIES[0]); setImageUrl(''); setStartsOn(''); setEndsOn('')
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!currentUser) { setError('로그인 정보를 확인할 수 없어요. 다시 로그인해주세요.'); return }
    if (startsOn && endsOn && new Date(endsOn) < new Date(startsOn)) {
      setError('종료일이 시작일보다 이전이에요.')
      return
    }
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('rentals')
      .insert({
        name: name.trim(),
        description: desc.trim(),
        price_per_day: Number(pricePerDay) || 0,
        deposit: Number(deposit) || 0,
        category: category || '기타',
        image_url: imageUrl.trim(),
        lender_id: currentUser.id,
        status: 'available',
        starts_on: startsOn || null,
        ends_on: endsOn || null,
      })
    setBusy(false)
    if (err) { setError(err.message); return }
    reset()
    setShow(false)
    toast('물건을 등록했어요!')
    if (onCreated) onCreated()
  }

  return (
    <>
      <button type="button" className="btn btn-secondary l-btn-mobile-hide" onClick={() => setShow(true)}>
        <Plus size={18} strokeWidth={2.4} /> 물건 빌려주기
      </button>
      <button type="button" className="fab" onClick={() => setShow(true)} aria-label="물건 빌려주기">
        <Plus size={24} strokeWidth={2.4} />
      </button>

      <Modal open={show} title="물건 빌려주기" onClose={() => setShow(false)}>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="rname">물품 이름</label>
            <input id="rname" value={name} required onChange={(e) => setName(e.target.value)} placeholder="예: 전동 드릴" />
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="rprice">일일 대여료(원)</label>
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
              <label htmlFor="rstart">대여 가능 시작일(선택)</label>
              <input id="rstart" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rend">종료일(선택)</label>
              <input id="rend" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>대표 이미지</label>
            <ImageUpload value={imageUrl} onChange={setImageUrl} hint="사진을 올리면 자동으로 표시돼요. 비우면 색상 카드가 나와요." />
          </div>
          <div className="field">
            <label htmlFor="rdesc">설명(대여 조건 등)</label>
            <textarea id="rdesc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="예: 주말 대여 가능, 배터리 포함, 사용 전 점검 필요" />
          </div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button type="submit" className="btn btn-secondary btn-block" disabled={busy}>
            {busy ? '등록 중…' : '등록하기'}
          </button>
        </form>
      </Modal>
    </>
  )
}

function RentBody() {
  const { user } = useAuth()
  const [rentals, setRentals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cat, setCat] = useState('전체')

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('rentals')
      .select('*, lender:profiles!rentals_lender_id_fkey(nickname)')
      .order('created_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    const flat = (data ?? []).map((r) => ({ ...r, lender_nickname: r.lender?.nickname }))
    setRentals(flat)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(
    () => (cat === '전체' ? rentals : rentals.filter((r) => (r.category || '기타') === cat)),
    [rentals, cat]
  )

  return (
    <div className="container page">
      <div className="page-header">
        <h1>대여 연결</h1>
        <p>잠깐만 필요한 물건, 사지 말고 이웃에게 빌리세요. 쓰지 않는 물건은 빌려주고 이웃과 나누세요.</p>
      </div>

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
        <CreateRentForm user={user} onCreated={load} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>불러오는 중…</div>
      ) : error ? (
        <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-6)' }}>
          목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.
        </div>
      ) : filtered.length === 0 ? (
        <div className="search-empty">
          {cat === '전체' ? '아직 대여 가능한 물건이 없어요. 처음으로 빌려주는 이웃이 되어보세요!' : `'${cat}' 카테고리에 물건이 아직 없어요.`}
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
