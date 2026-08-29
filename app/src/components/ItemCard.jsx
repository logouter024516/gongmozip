// components/ItemCard.jsx — 공동구매 카드(당근/카루셀 스타일)
// 대표 이미지 + 상태 배지 + 물품명 + 지역 + 1인당 가격(취소선 총액) + 집합 현황 진행바 + 참여 버튼.
// 내가 만든 모집이면 수정/삭제 버튼도 보여준다.

import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import { MapPin, Users, Pencil, Trash2 } from 'lucide-react'
import CardImage from './CardImage'
import Modal from './Modal'
import { toast } from '../lib/toast'
import ImageUpload from './ImageUpload'

// 카테고리 표시명
const CAT = { '식품·신선': '식품·신선', '생활용품': '생활용품', '도서·산간': '도서·산간', '기타': '기타' }
const CATEGORIES = Object.keys(CAT)

export default function ItemCard({ item, onChanged }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  // 참여자 수 + 목표 인원(진행률 계산)
  const participantCount = item.participants?.length ?? 0
  const target = Number(item.target_count) || 0
  const percent = target > 0 ? Math.min(100, Math.round((participantCount / target) * 100)) : 0

  // 이미 참여했는지 확인
  const isParticipant = !!item.participants?.some((p) => p.user_id === user?.id)
  // 1인당 가격 = 총액 / 만든 이가 기록한 1인 실부담(min_qty 기준) 혹은 참여자 수
  const totalPrice = Number(item.price) || 0
  const shipping = Number(item.shipping_cost) || 0
  const perHead = Math.round(totalPrice / Math.max(1, Number(item.min_qty) || 1))

  const category = CAT[item.category] || '기타'
  const isOwner = !!user && item.created_by === user.id

  async function join() {
    if (!user) { navigate('/login'); return }
    setBusy(true)
    const { error: err } = await supabase
      .from('item_participants')
      .insert({ item_id: item.id, user_id: user.id, qty: 1 })
    setBusy(false)
    if (err) { toast('참여하지 못했어요', { type: 'error' }); return }
    toast('공동구매에 참여했어요!')
    if (onChanged) onChanged()
  }

  async function leave() {
    if (!user) return
    setBusy(true)
    const { error: err } = await supabase
      .from('item_participants')
      .delete()
      .eq('item_id', item.id)
      .eq('user_id', user.id)
    setBusy(false)
    if (err) { toast('처리하지 못했어요', { type: 'error' }); return }
    toast('참여를 취소했어요')
    if (onChanged) onChanged()
  }

  async function remove() {
    if (!confirm('이 공동구매를 삭제할까요? 참여 기록도 함께 지워집니다.')) return
    setBusy(true)
    const { error: err } = await supabase.from('items').delete().eq('id', item.id)
    setBusy(false)
    if (err) { toast('삭제하지 못했어요', { type: 'error' }); return }
    toast('삭제했어요')
    if (onChanged) onChanged()
  }

  const open = item.status === 'open'

  return (
    <article className={`card l-card${open ? '' : ' l-card-closed'}`}>
      {/* 이미지 헤더 + 상태 배지 오버레이 */}
      <div className="l-card-media">
        <CardImage src={item.image_url} label={item.name} seed={item.id || item.name} />
        <span className={`badge l-badge-corner ${open ? 'badge-open' : 'badge-closed'}`}>
          {open ? '모집중' : '모집완료'}
        </span>
        {item.category && <span className="l-cat-chip">{category}</span>}
      </div>

      {/* 물품명 + 지역 */}
      <div className="l-card-body">
        <h2 className="l-title">{item.name}</h2>
        <p className="l-region">
          <MapPin size={13} strokeWidth={2} />
          {item.region || '지역 미지정'}
        </p>

        {/* 집합 현황 진행바 */}
        <div className="l-progress">
          <div className="l-progress-top">
            <span><Users size={13} strokeWidth={2} /> 집합 현황</span>
            <strong>{participantCount}명 / {target > 0 ? `${target}명` : '—'}</strong>
          </div>
          {target > 0 && (
            <div className="l-progress-bar">
              <div className="l-progress-fill" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>

        {/* 가격: 1인당 + 배송비 */}
        <div className="l-price-row">
          <span className="l-price-label">1인당</span>
          <div>
            <div className="l-price-main">{perHead.toLocaleString()}원</div>
            <div className="l-price-total-line">
              <span>총 {totalPrice.toLocaleString()}원</span>
              {shipping > 0
                ? <span className="l-ship">+배송비 {shipping.toLocaleString()}원</span>
                : <span className="l-ship l-ship-free">배송비 무료</span>}
            </div>
          </div>
        </div>

        {/* 참여 버튼 */}
        {open && (
          isParticipant ? (
            <button type="button" className="btn btn-outline btn-block l-cta" onClick={leave} disabled={busy}>
              {busy ? '처리 중…' : '참여 취소'}
            </button>
          ) : (
            <button type="button" className="btn btn-block l-cta" onClick={join} disabled={busy}>
              {busy ? '처리 중…' : `참여하기 · ${participantCount}명`}
            </button>
          )
        )}
        {!open && (
          <div className="l-closed-note">이번 모집은 마감됐어요</div>
        )}

        {/* 만든 이 전용: 수정/삭제 */}
        {isOwner && (
          <div className="owner-actions">
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditing(true)}>
              <Pencil size={14} strokeWidth={2.2} /> 수정
            </button>
            <button type="button" className="btn btn-sm btn-outline btn-danger" onClick={remove} disabled={busy}>
              <Trash2 size={14} strokeWidth={2.2} /> 삭제
            </button>
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      <EditItemModal open={editing} item={item} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); if (onChanged) onChanged() }} />
    </article>
  )
}

// 내 공동구매 수정 모달
function EditItemModal({ open, item, onClose, onSaved }) {
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(String(item.price ?? ''))
  const [shipping, setShipping] = useState(String(item.shipping_cost ?? ''))
  const [minQty, setMinQty] = useState(String(item.min_qty ?? '1'))
  const [target, setTarget] = useState(String(item.target_count ?? '4'))
  const [region, setRegion] = useState(item.region ?? '')
  const [category, setCategory] = useState(item.category || '기타')
  const [imageUrl, setImageUrl] = useState(item.image_url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('items')
      .update({
        name,
        price: Number(price) || 0,
        shipping_cost: Number(shipping) || 0,
        region,
        min_qty: Number(minQty) || 1,
        target_count: Number(target) || 4,
        category,
        image_url: imageUrl.trim(),
      })
      .eq('id', item.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    toast('수정했어요!')
    onSaved()
  }

  return (
    <Modal open={open} title="공동구매 수정" onClose={onClose}>
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor={`iname-${item.id}`}>물품 이름</label>
          <input id={`iname-${item.id}`} value={name} required onChange={(e) => setName(e.target.value)} placeholder="예: 제주 감귤 5kg" />
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor={`iprice-${item.id}`}>총 가격(원)</label>
            <input id={`iprice-${item.id}`} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`iship-${item.id}`}>배송비(원)</label>
            <input id={`iship-${item.id}`} type="number" min="0" value={shipping} onChange={(e) => setShipping(e.target.value)} />
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor={`imin-${item.id}`}>최소 구매 수량</label>
            <input id={`imin-${item.id}`} type="number" min="1" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`itarget-${item.id}`}>모집 인원(명)</label>
            <input id={`itarget-${item.id}`} type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`icat-${item.id}`}>카테고리</label>
          <select id={`icat-${item.id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>대표 이미지</label>
          <ImageUpload value={imageUrl} onChange={setImageUrl} hint="사진을 올리거나 제거할 수 있어요." />
        </div>
        <div className="field">
          <label htmlFor={`iregion-${item.id}`}>배송 지역(도서산간 함께배송)</label>
          <input id={`iregion-${item.id}`} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="예: 제주 / 강원 산간" />
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button type="submit" className="btn btn-block" disabled={busy}>
          {busy ? '저장 중…' : '저장하기'}
        </button>
      </form>
    </Modal>
  )
}
