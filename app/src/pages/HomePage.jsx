// pages/HomePage.jsx — 공동구매 페이지(메인)
// 히어로 배너 + 카테고리 필터 + 공동구매 카드 그리드 + 새 공동구매 등록(당근식 모달).

import { useEffect, useMemo, useState } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import ItemCard from '../components/ItemCard'
import Modal from '../components/Modal'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../lib/toast'
import ImageUpload from '../components/ImageUpload'
import { userRegion } from '../lib/location'

const CATEGORIES = ['전체', '식품·신선', '생활용품', '도서·산간', '기타']

function CreateItemForm({ user, profile, onCreated }) {
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [shipping, setShipping] = useState('')
  const [qty, setQty] = useState('1')
  const [target, setTarget] = useState('4')
  const [category, setCategory] = useState('식품·신선')
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('items')
      .insert({
        name,
        price: Number(price) || 0,
        shipping_cost: Number(shipping) || 0,
        region: userRegion(profile) || '',
        min_qty: Number(qty) || 1,
        target_count: Number(target) || 4,
        category,
        image_url: imageUrl.trim(),
        created_by: user.id,
        status: 'open',
      })
    setBusy(false)
    if (err) { setError(err.message); return }
    setName(''); setPrice(''); setShipping(''); setQty('1'); setTarget('4'); setCategory('식품·신선'); setImageUrl(''); setShow(false)
    toast('공동구매를 등록했어요!')
    if (onCreated) onCreated()
  }

  return (
    <>
      <button type="button" className="btn l-btn-mobile-hide" onClick={() => setShow(true)}>
        <Plus size={18} strokeWidth={2.4} /> 새 공동구매
      </button>
      <button type="button" className="fab" onClick={() => setShow(true)} aria-label="새 공동구매">
        <Plus size={24} strokeWidth={2.4} />
      </button>

      <Modal open={show} title="공동구매 만들기" onClose={() => setShow(false)}>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="iname">물품 이름</label>
            <input id="iname" value={name} required onChange={(e) => setName(e.target.value)} placeholder="예: 제주 감귤 5kg" />
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="iprice">총 가격(원)</label>
              <input id="iprice" type="number" min="0" value={price} required onChange={(e) => setPrice(e.target.value)} placeholder="15000" />
            </div>
            <div className="field">
              <label htmlFor="iship">배송비(원)</label>
              <input id="iship" type="number" min="0" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0 = 무료" />
            </div>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="itarget">모집 인원(명)</label>
              <input id="itarget" type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="4" />
            </div>
            <div className="field">
              <label htmlFor="icat">카테고리</label>
              <select id="icat" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.filter((c) => c !== '전체').map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>대표 이미지</label>
            <ImageUpload value={imageUrl} onChange={setImageUrl} hint="사진을 올리면 자동으로 표시돼요. 비우면 색상 카드가 나와요." />
          </div>
          <div className="field">
            <label>배송 지역</label>
            {userRegion(profile)
              ? <p className="field-hint"><strong>{userRegion(profile)}</strong> · 내 위치(설정) 기준으로 자동 등록돼요. <a href="/settings">변경</a></p>
              : <p className="field-hint"><a href="/settings">설정에서 내 위치를 확정</a>하면 배송 지역으로 자동 등록돼요.</p>}
          </div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button type="submit" className="btn btn-block" disabled={busy}>
            {busy ? '등록 중…' : '등록하기'}
          </button>
        </form>
      </Modal>
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
    if (!error) setItems(data ?? [])
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
