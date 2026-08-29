// components/RentCard.jsx — 대여 카드(당근/카루셀 스타일)
// 대표 이미지 + 상태 배지 + 물품명 + 지역 + 일일대여료/보증금 정보 + 빌려주는 이(Lender) 표시.
// 내가 등록한 물건이면 수정/삭제 버튼도 보여준다.

import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useState } from 'react'
import { MapPin, User as UserIcon, Pencil, Trash2 } from 'lucide-react'
import CardImage from './CardImage'
import Modal from './Modal'
import { toast } from '../lib/toast'

const CATEGORIES = ['공구·도구', '가전·생활', '여행·캠핑', '기타']

export default function RentCard({ rent, onChanged }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  const isLender = rent.lender_id === user?.id
  const isBorrower = rent.borrower_id === user?.id

  const statusMeta = {
    available: { label: '대여 가능', cls: 'badge-available' },
    reserved:  { label: '예약 중',  cls: 'badge-closed' },
    on_loan:   { label: '대여 중',  cls: 'badge-onloan' },
    returned:  { label: '반납됨',   cls: 'badge-closed' },
  }[rent.status] || { label: rent.status, cls: 'badge-closed' }

  async function borrow() {
    if (!user) return
    setBusy(true)
    const { error: err } = await supabase
      .from('rentals')
      .update({ borrower_id: user.id, status: 'on_loan' })
      .eq('id', rent.id)
      .eq('status', 'available')
    setBusy(false)
    if (err) { toast('대여 신청에 실패했어요', { type: 'error' }); return }
    toast('대여를 시작했어요!')
    if (onChanged) onChanged()
  }

  async function returnItem() {
    if (!user) return
    setBusy(true)
    const { error: err } = await supabase
      .from('rentals')
      .update({ borrower_id: null, status: 'available' })
      .eq('id', rent.id)
    setBusy(false)
    if (err) { toast('반납 처리에 실패했어요', { type: 'error' }); return }
    toast('반납했어요. 이용해줘서 고마워요!')
    if (onChanged) onChanged()
  }

  async function remove() {
    if (!confirm('이 대여 물품을 삭제할까요? 진행 중인 대여가 있으면 삭제할 수 없습니다.')) return
    setBusy(true)
    const { error: err } = await supabase
      .from('rentals')
      .delete()
      .eq('id', rent.id)
      .eq('lender_id', user?.id)
    setBusy(false)
    if (err) { toast('삭제하지 못했어요', { type: 'error' }); return }
    toast('삭제했어요')
    if (onChanged) onChanged()
  }

  const pricePerDay = Number(rent.price_per_day) || 0
  const deposit = Number(rent.deposit) || 0

  return (
    <article className="card l-card">
      <div className="l-card-media">
        <CardImage src={rent.image_url} label={rent.name} seed={rent.id || rent.name} />
        <span className={`badge l-badge-corner ${statusMeta.cls}`}>{statusMeta.label}</span>
        {rent.category && <span className="l-cat-chip">{rent.category}</span>}
      </div>

      <div className="l-card-body">
        <h2 className="l-title">{rent.name}</h2>
        <p className="l-region"><MapPin size={13} strokeWidth={2} /> 이웃 공유 물품</p>

        {/* 대여 특성 소형 칩 */}
        <div className="tag-row">
          <span className="chip">대여 물품</span>
          {rent.status === 'on_loan' && <span className="chip chip-muted">이용 중</span>}
        </div>

        {/* 대여 정보 박스(일일대여료/보증금) */}
        {(pricePerDay > 0 || deposit > 0) && (
          <div className="l-rent-info">
            <div className="l-rent-info-item">
              <span className="l-rent-info-label">일일 대여료</span>
              <strong>{pricePerDay > 0 ? `${pricePerDay.toLocaleString()}원` : '무료'}</strong>
            </div>
            <div className="l-rent-info-item">
              <span className="l-rent-info-label">보증금</span>
              <strong>{deposit > 0 ? `${deposit.toLocaleString()}원` : '없음'}</strong>
            </div>
          </div>
        )}

        {/* 빌려주는 이(Lender) */}
        {rent.lender_nickname && (
          <p className="l-lender"><UserIcon size={14} strokeWidth={2} /> {rent.lender_nickname} 님이 빌려드려요</p>
        )}

        {/* 동작 */}
        {isLender ? (
          <p className="l-lender l-lender-mine">내가 빌려주는 물품</p>
        ) : (
          rent.status === 'available' && (
            <button type="button" className="btn btn-secondary btn-block l-cta" onClick={borrow} disabled={busy}>
              {busy ? '처리 중…' : '대여 신청'}
            </button>
          )
        )}
        {isBorrower && rent.status === 'on_loan' && (
          <button type="button" className="btn btn-outline btn-block l-cta" onClick={returnItem} disabled={busy}>
            {busy ? '처리 중…' : '반납하기'}
          </button>
        )}
        {!isLender && rent.status !== 'available' && (
          <div className="l-closed-note">{statusMeta.label} 중이에요</div>
        )}

        {/* 등록자 전용: 수정/삭제 */}
        {isLender && (
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
      <EditRentModal open={editing} rent={rent} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); if (onChanged) onChanged() }} />
    </article>
  )
}

// 내 대여 물품 수정 모달
function EditRentModal({ open, rent, onClose, onSaved }) {
  const [name, setName] = useState(rent.name)
  const [desc, setDesc] = useState(rent.description ?? '')
  const [pricePerDay, setPricePerDay] = useState(String(rent.price_per_day ?? ''))
  const [deposit, setDeposit] = useState(String(rent.deposit ?? ''))
  const [category, setCategory] = useState(rent.category || '기타')
  const [imageUrl, setImageUrl] = useState(rent.image_url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('rentals')
      .update({
        name,
        description: desc,
        price_per_day: Number(pricePerDay) || 0,
        deposit: Number(deposit) || 0,
        category,
        image_url: imageUrl.trim(),
      })
      .eq('id', rent.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    toast('수정했어요!')
    onSaved()
  }

  return (
    <Modal open={open} title="대여 물품 수정" onClose={onClose}>
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor={`rname-${rent.id}`}>물품 이름</label>
          <input id={`rname-${rent.id}`} value={name} required onChange={(e) => setName(e.target.value)} placeholder="예: 전동 드릴" />
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor={`rprice-${rent.id}`}>일일 대여료(원)</label>
            <input id={`rprice-${rent.id}`} type="number" min="0" value={pricePerDay} onChange={(e) => setPricePerDay(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`rdep-${rent.id}`}>보증금(원)</label>
            <input id={`rdep-${rent.id}`} type="number" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`rcat-${rent.id}`}>카테고리</label>
            <select id={`rcat-${rent.id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`rimg-${rent.id}`}>대표 이미지 URL(선택)</label>
          <input id={`rimg-${rent.id}`} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://… (비우면 자동 색상 카드)" />
        </div>
        <div className="field">
          <label htmlFor={`rdesc-${rent.id}`}>설명(가능한 대여 기간 등)</label>
          <textarea id={`rdesc-${rent.id}`} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="예: 주말 대여 가능, 배터리 포함" />
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button type="submit" className="btn btn-secondary btn-block" disabled={busy}>
          {busy ? '저장 중…' : '저장하기'}
        </button>
      </form>
    </Modal>
  )
}
