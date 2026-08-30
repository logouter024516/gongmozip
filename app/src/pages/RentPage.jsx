// pages/RentPage.jsx — 대여 연결 페이지
// 필요한 물건을 '빌리고 싶어요' 요청 중심으로 등록 → 이웃이 '빌려드릴게요' 제안 → 요청자 승인.
// 흐름: open(모집 중) → matched(매칭) → in_use(대여 중) → done(반납 완료) → 재모집 가능.
// 등록/수정 폼은 RentFormModal을 공용으로 쓴다.

import { useEffect, useMemo, useState } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import RentCard from '../components/RentCard'
import RentFormModal from '../components/RentFormModal'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const CATEGORIES = ['전체', '공구·도구', '가전·생활', '여행·캠핑', '기타']

function CreateRentForm({ user, profile, onCreated }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-secondary l-btn-mobile-hide" onClick={() => setShow(true)}>
        <Plus size={18} strokeWidth={2.4} /> 빌리고 싶어요
      </button>
      <button type="button" className="fab" onClick={() => setShow(true)} aria-label="빌리고 싶어요">
        <Plus size={24} strokeWidth={2.4} />
      </button>

      <RentFormModal
        open={show}
        user={user}
        profile={profile}
        onClose={() => setShow(false)}
        onSaved={() => { setShow(false); if (onCreated) onCreated() }}
      />
    </>
  )
}

function RentBody() {
  const { user, profile } = useAuth()
  const [rentals, setRentals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cat, setCat] = useState('전체')

  async function load(silent = false) {
    if (!silent) setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('rentals')
      .select('*, requester:profiles!rentals_requester_id_fkey(nickname), lender:profiles!rentals_lender_id_fkey(nickname)')
      .order('created_at', { ascending: false })
    if (err) { if (!silent) setError(err.message); if (!silent) setLoading(false); return }
    const flat = (data ?? []).map((r) => ({ ...r, requester_nickname: r.requester?.nickname, lender_nickname: r.lender?.nickname }))
    setRentals(flat)
    if (!silent) setLoading(false)
  }

  // 최초 로드 후 10초마다 갱신 (F5 없이 새 요청/매칭 상태 반영)
  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 10000)
    return () => clearInterval(id)
  }, [])

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
        <CreateRentForm user={user} profile={profile} onCreated={() => load(true)} />
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
            <RentCard key={r.id} rent={r} onChanged={() => load(true)} />
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