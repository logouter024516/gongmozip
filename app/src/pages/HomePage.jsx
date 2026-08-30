// pages/HomePage.jsx — 공동구매 페이지(메인)
// 히어로 배너 + 카테고리 필터 + 공동구매 카드 그리드 + 새 공동구매 등록(당근식 모달).
// 등록/수정 폼은 ItemFormModal(토스식 마법사)을 공용으로 쓴다.

import { useEffect, useMemo, useState } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import ItemCard from '../components/ItemCard'
import ItemFormModal from '../components/ItemFormModal'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const CATEGORIES = ['식품·신선', '생활용품', '도서·산간', '기타']

function CreateItemForm({ user, profile, onCreated }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <button type="button" className="btn l-btn-mobile-hide" onClick={() => setShow(true)}>
        <Plus size={18} strokeWidth={2.4} /> 새 공동구매
      </button>
      <button type="button" className="fab" onClick={() => setShow(true)} aria-label="새 공동구매">
        <Plus size={24} strokeWidth={2.4} />
      </button>

      <ItemFormModal
        open={show}
        user={user}
        profile={profile}
        onClose={() => setShow(false)}
        onSaved={() => { setShow(false); if (onCreated) onCreated() }}
      />
    </>
  )
}

function HomeBody() {
  const { user, profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('전체')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('items')
      .select('*, participants:item_participants(user_id)')
      .order('created_at', { ascending: false })
    if (error) { setLoading(false); return }
    const items = data ?? []
    // 집결 명단(닉네임/도착) 병합
    const itemIds = items.map((i) => i.id).filter(Boolean)
    const { data: roster } = await supabase
      .from('item_participant_list')
      .select('*')
      .in('item_id', itemIds.length ? itemIds : ['00000000-0000-0000-0000-000000000000'])
    const byItem = {}
    for (const r of roster ?? []) {
      if (!byItem[r.item_id]) byItem[r.item_id] = []
      byItem[r.item_id].push(r)
    }
    setItems(items.map((i) => ({ ...i, participants: byItem[i.id] ?? i.participants ?? [] })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(
    () => (cat === '전체' ? items : items.filter((i) => (i.category || '기타') === cat)),
    [items, cat]
  )

  const displayName = profile?.nickname || user?.email?.split('@')[0] || '이웃'

  return (
    <div className="container page">
      {/* 히어로 배너(공지) */}
      <section className="l-hero">
        <div>
          <span className="l-hero-badge">함께배송 매칭</span>
          <h1>같은 물건이 필요한 <br />이웃끼리 모여 사요</h1>
          <p>{displayName}님, 필요한 것만 공동구매하고 안 쓰는 물건은 이웃과 나눠요.</p>
        </div>
      </section>

      {/* 카테고리 필터 칩 */}
      <div className="l-cat-row" role="tablist" aria-label="카테고리 필터">
        {['전체', ...CATEGORIES].map((c) => (
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
        <CreateItemForm user={user} profile={profile} onCreated={load} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="search-empty">
          {cat === '전체' ? '아직 공동구매가 없어요. 첫 모임을 열어보세요!' : `'${cat}' 카테고리의 모집이 아직 없어요.`}
        </div>
      ) : (
        <div className="grid">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <Layout>
        <HomeBody />
      </Layout>
    </ProtectedRoute>
  )
}