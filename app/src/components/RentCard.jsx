// components/RentCard.jsx — 대여 물품 카드
// 상태 머신: available → reserved(대여 신청) → on_loan(승인) → returned(반납 확인) → 재등록.
// 대여자와 빌리는 이(대여자)가 어떤 상태에서 어떤 행동을 할 수 있는지 상태별로 명확히 구분한다.

import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useState } from 'react'
import { MapPin, User as UserIcon, Pencil, Trash2, CalendarDays } from 'lucide-react'
import CardImage from './CardImage'
import Modal from './Modal'
import { toast } from '../lib/toast'
import ImageUpload from './ImageUpload'

const CATEGORIES = ['공구·도구', '가전·생활', '여행·캠핑', '기타']

const STATUS = {
  available: { label: '대여 가능', cls: 'badge-available' },
  reserved:  { label: '예약 신청', cls: 'badge-reserved' },
  on_loan:   { label: '대여 중',  cls: 'badge-onloan' },
  returned:  { label: '반납 완료', cls: 'badge-returned' },
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function Period({ startsOn, endsOn }) {
  if (!startsOn && !endsOn) return null
  const s = fmtDate(startsOn)
  const e = fmtDate(endsOn)
  let text = ''
  if (s && e) text = `${s} ~ ${e}`
  else if (s) text = `${s}부터`
  else if (e) text = `${e}까지`
  return (
    <p className="l-lender l-period">
      <CalendarDays size={14} strokeWidth={2} />
      {text}
    </p>
  )
}

export default function RentCard({ rent, onChanged }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  const myId = user?.id
  const isLender = rent.lender_id === myId
  const isApplicant = rent.borrower_id === myId && rent.status === 'reserved'
  const isBorrower = rent.borrower_id === myId && rent.status === 'on_loan'
  const meta = STATUS[rent.status] || { label: rent.status, cls: 'badge-closed' }

  const pricePerDay = Number(rent.price_per_day) || 0
  const deposit = Number(rent.deposit) || 0

  async function transition(patch, successMsg) {
    setBusy(true)
    const { error: err } = await supabase.from('rentals').update(patch).eq('id', rent.id)
    setBusy(false)
    if (err) { toast(err.message || '처리하지 못했어요', { type: 'error' }); return }
    toast(successMsg)
    if (onChanged) onChanged()
  }

  function apply() {
    transition({ borrower_id: myId, status: 'reserved' }, '대여를 신청했어요! 빌려주는 이웃의 승인을 기다려요.')
  }
  function cancelApply() {
    transition({ borrower_id: null, status: 'available' }, '대여 신청을 취소했어요.')
  }
  function approve() {
    transition({ status: 'on_loan' }, '대여를 승인했어요!')
  }
  function reject() {
    transition({ borrower_id: null, status: 'available' }, '신청을 거절했어요.')
  }
  function markReturned() {
    transition({ status: 'returned' }, '반납 처리했어요. 이웃과 나눠서 고마워요!')
  }
  function relist() {
    transition({ borrower_id: null, status: 'available' }, '다시 대여 가능하게 했어요.')
  }

  async function remove() {
    if (!confirm('이 대여 물품을 삭제할까요?')) return
    setBusy(true)
    const { error: err } = await supabase.from('rentals').delete().eq('id', rent.id).eq('lender_id', myId)
    setBusy(false)
    if (err) { toast(err.message || '삭제하지 못했어요', { type: 'error' }); return }
    toast('삭제했어요')
    if (onChanged) onChanged()
  }

  let action = null
  if (isLender) {
    if (rent.status === 'available') {
      action = <p className="l-status-note l-mine">내가 빌려주는 물품</p>
    } else if (rent.status === 'reserved') {
      action = (
        <div className="l-action-stack">
          <p className="l-status-note">대여 신청이 도착했어요. 승인하면 대여가 시작돼요.</p>
          <div className="l-action-row">
            <button type="button" className="btn btn-block l-cta" onClick={approve} disabled={busy}>{busy ? '처리 중…' : '대여 승인'}</button>
            <button type="button" className="btn btn-outline btn-block l-cta" onClick={reject} disabled={busy}>{busy ? '…' : '거절'}</button>
          </div>
        </div>
      )
    } else if (rent.status === 'on_loan') {
      action = (
        <div className="l-action-stack">
          <p className="l-status-note">내 물품이 대여 중이에요. 반납을 확인하면 완료돼요.</p>
          <button type="button" className="btn btn-secondary btn-block l-cta" onClick={markReturned} disabled={busy}>{busy ? '처리 중…' : '반납 확인'}</button>
        </div>
      )
    } else if (rent.status === 'returned') {
      action = (
        <div className="l-action-stack">
          <p className="l-status-note">반납이 확인됐어요.</p>
          <button type="button" className="btn btn-outline btn-block l-cta" onClick={relist} disabled={busy}>{busy ? '…' : '다시 대여 가능하게'}</button>
        </div>
      )
    }
  } else if (isApplicant) {
    action = (
      <div className="l-action-stack">
        <p className="l-status-note">승인을 기다리는 중이에요.</p>
        <button type="button" className="btn btn-outline btn-block l-cta" onClick={cancelApply} disabled={busy}>{busy ? '…' : '신청 취소'}</button>
      </div>
    )
  } else if (isBorrower) {
    action = (
      <div className="l-action-stack">
        <p className="l-status-note">내가 빌려 쓰는 중이에요. 반납하면 완료돼요.</p>
        <button type="button" className="btn btn-secondary btn-block l-cta" onClick={markReturned} disabled={busy}>{busy ? '처리 중…' : '반납하기'}</button>
      </div>
    )
  } else if (rent.status === 'available') {
    if (!user) {
      action = <p className="l-status-note">로그인하면 대여 신청할 수 있어요.</p>
    } else {
      action = <button type="button" className="btn btn-secondary btn-block l-cta" onClick={apply} disabled={busy}>{busy ? '처리 중…' : '대여 신청'}</button>
    }
  } else {
    action = <p className="l-status-note">{meta.label} 중이에요.</p>
  }

  return (
    <article className="card l-card">
      <div className="l-card-media">
        <CardImage src={rent.image_url} label={rent.name} seed={rent.id || rent.name} />
        <span className={`badge l-badge-corner ${meta.cls}`}>{meta.label}</span>
        {rent.category && <span className="l-cat-chip">{rent.category}</span>}
      </div>

      <div className="l-card-body">
        <h2 className="l-title">{rent.name}</h2>
        <p className="l-region"><MapPin size={13} strokeWidth={2} /> 이웃 공유 물품</p>
        <Period startsOn={rent.starts_on} endsOn={rent.ends_on} />

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

        {rent.lender_nickname && (
          <p className="l-lender"><UserIcon size={14} strokeWidth={2} /> {rent.lender_nickname} 님이 빌려드려요</p>
        )}

        {action}

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

      <EditRentModal open={editing} rent={rent} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); if (onChanged) onChanged() }} />
    </article>
  )
}

function EditRentModal({ open, rent, onClose, onSaved }) {
  const [name, setName] = useState(rent.name)
  const [desc, setDesc] = useState(rent.description ?? '')
  const [pricePerDay, setPricePerDay] = useState(String(rent.price_per_day ?? ''))
  const [deposit, setDeposit] = useState(String(rent.deposit ?? ''))
  const [category, setCategory] = useState(rent.category || '기타')
  const [imageUrl, setImageUrl] = useState(rent.image_url ?? '')
  const [startsOn, setStartsOn] = useState(rent.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(rent.ends_on ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    if (startsOn && endsOn && new Date(endsOn) < new Date(startsOn)) {
      setError('종료일이 시작일보다 이전이에요.')
      return
    }
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('rentals')
      .update({
        name: name.trim(),
        description: desc.trim(),
        price_per_day: Number(pricePerDay) || 0,
        deposit: Number(deposit) || 0,
        category: category || '기타',
        image_url: imageUrl.trim(),
        starts_on: startsOn || null,
        ends_on: endsOn || null,
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
        <div className="field-grid">
          <div className="field">
            <label htmlFor={`rstart-${rent.id}`}>대여 가능 시작일(선택)</label>
            <input id={`rstart-${rent.id}`} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`rend-${rent.id}`}>종료일(선택)</label>
            <input id={`rend-${rent.id}`} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>대표 이미지</label>
          <ImageUpload value={imageUrl} onChange={setImageUrl} hint="사진을 올리거나 제거할 수 있어요." />
        </div>
        <div className="field">
          <label htmlFor={`rdesc-${rent.id}`}>설명(대여 조건 등)</label>
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
