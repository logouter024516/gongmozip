// components/ItemCard.jsx — 공동구매 카드(당근/카루셀 스타일)
// 대표 이미지 + 상태 배지 + 물품명 + 지역 + 1인당 가격(취소선 총액) + 집합 현황 진행바 + 참여 버튼.

import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import { MapPin, Users } from 'lucide-react'
import CardImage from './CardImage'
import { toast } from '../lib/toast'

// 카테고리 표시명
const CAT = { '식품·신선': '식품·신선', '생활용품': '생활용품', '도서·산간': '도서·산간', '기타': '기타' }

export default function ItemCard({ item, onChanged }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  // 참여자 수 + 목표 인원(진행률 계산)
  const participantCount = item.participants?.length ?? 0
  const target = Number(item.target_count) || 0
  const percent = target > 0 ? Math.min(100, Math.round((participantCount / target) * 100)) : 0

  // 이미 참여했는지 확인
  const isParticipant = !!item.participants?.some((p) => p.user_id === user?.id)
  // 1인당 가격 = 총액 / max(1, 참여자(나 포함 미리 친절 계산))
  const totalPrice = Number(item.price) || 0
  const shipping = Number(item.shipping_cost) || 0

  const category = CAT[item.category] || '기타'

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

        {/* 가격: 1인당 + 취소선 총액 + 배송비 */}
        <div className="l-price-row">
          <span className="l-price-label">1인당</span>
          <div>
            <div className="l-price-main">{totalPrice.toLocaleString()}원</div>
            <div className="l-price-total-line">
              <s>{totalPrice.toLocaleString()}원</s>
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
      </div>
    </article>
  )
}
