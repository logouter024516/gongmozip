// components/RentCard.jsx — 대여 카드(당근/카루셀 스타일)
// 대표 이미지 + 상태 배지 + 물품명 + 지역 + 일일대여료/보증금 정보 + 빌려주는 이(Lender) 표시.

import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useState } from 'react'
import { MapPin, User as UserIcon } from 'lucide-react'
import CardImage from './CardImage'
import { toast } from '../lib/toast'

export default function RentCard({ rent, onChanged }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)

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
      </div>
    </article>
  )
}
