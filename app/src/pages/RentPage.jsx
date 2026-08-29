// pages/RentPage.jsx — 대여 연결 페이지
// 잠깐 필요한 물건을 이웃에게 빌리는 시스템. 물품 등록 + 목록 + 대여 신청.

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

function CreateRentForm({ user, onCreated }) {
  const currentUser = user
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [pricePerDay, setPricePerDay] = useState('')
  const [deposit, setDeposit] = useState('')
  const [category, setCategory] = useState('공구·도구')
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('rentals')
      .insert({
        name,
        description: desc,
        price_per_day: Number(pricePerDay) || 0,
        deposit: Number(deposit) || 0,
        category,
        image_url: imageUrl.trim(),
        lender_id: currentUser.id,
        status: 'available',
      })
    setBusy(false)
    if (err) { setError(err.message); return }
    setName(''); setDesc(''); setPricePerDay(''); setDeposit(''); setCategory('공구·도구'); setImageUrl(''); setShow(false)
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
                {CATEGORIES.filter((c) => c !== '전체').map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>대표 이미지</label>
            <ImageUpload value={imageUrl} onChange={setImageUrl} hint="사진을 올리면 자동으로 표시돼요. 비우면 색상 카드가 나와요." />
          </div>
          <div className="field">
            <label htmlFor="rdesc">설명(가능한 대여 기간 등)</label>
            <textarea id="rdesc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="예: 주말 대여 가능, 배터리 포함" />
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
  const [rentals, setRentals] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('전체')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('rentals')
      .select('*, lender:profiles!rentals_lender_id_fkey(nickname)')
      .order('created_at', { ascending: false })
    if (!error) {
      const flat = (data ?? []).map((r) => ({ ...r, lender_nickname: r.lender?.nickname }))
      setRentals(flat)
    }
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
        <CreateRentForm onCreated={load} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>불러오는 중…</div>
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
