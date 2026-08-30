// components/ItemCard.jsx — 공동구매 카드(당근/카루셀 스타일)
// 대표 이미지 + 상태 배지 + 물품명 + 지역 + 1인당 가격(취소선 총액) + 집합 현황 진행바 + 참여 버튼.
// 내가 만든 모집이면 수정/삭제 버튼도 보여준다.

import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import { MapPin, Users, Pencil, Trash2, CheckCircle2, MapPinOff, Clock } from 'lucide-react'
import CardImage from './CardImage'
import ItemFormModal from './ItemFormModal'
import { toast } from '../lib/toast'
import { joinItemChat, leaveItemChat } from '../lib/chat'

// 카테고리 표시명
const CAT = { '식품·신선': '식품·신선', '생활용품': '생활용품', '도서·산간': '도서·산간', '기타': '기타' }
const CATEGORIES = Object.keys(CAT)

// 'YYYY-MM-DDTHH:mm' (datetime-local) → 표시 문자열
function fmtPickup(value, spot) {
  if (!value) return spot ? `집결 장소: ${spot}` : null
  const d = new Date(value)
  const date = `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return spot ? `${date} · ${spot}` : `${date}에 집결`
}

// 모집 마감 시각 표시 (기간 기준/영구)
function fmtDeadline(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ItemCard({ item, onChanged }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [arriving, setArriving] = useState(false)

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
    if (err) { setBusy(false); toast('참여하지 못했어요', { type: 'error' }); return }
    // 참여 즉시 참여자(＋등록자) 그룹채팅으로 이동
    try {
      const thread = await joinItemChat(item.id)
      setBusy(false)
      toast('공동구매에 참여했어요. 참여자와 대화를 시작해요!')
      if (onChanged) onChanged()
      navigate(`/chat/${thread.id}`)
    } catch (e) {
      setBusy(false)
      toast('참여했어요!')
      if (onChanged) onChanged()
    }
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
    try { await leaveItemChat(item.id) } catch (e) { /* 그룹채팅 탈퇴는 실패해도 참여 취소는 유지 */ }
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

  // 주최자가 모집 마감 (목표 미달이라도 일찍 마감 가능)
  async function closeItem() {
    if (!confirm('모집을 마감할까요? 더 이상 참여할 수 없고 함께배송 단계로 넘어갑니다.')) return
    setClosing(true)
    const { error: err } = await supabase
      .from('items')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('created_by', user.id)
    setClosing(false)
    if (err) { toast('마감하지 못했어요', { type: 'error' }); return }
    toast('모집을 마감했어요!')
    if (onChanged) onChanged()
  }

  // 참여자 도착 체크
  async function markArrival() {
    if (!user) return
    setArriving(true)
    await supabase
      .from('item_participants')
      .update({ arrived_at: new Date().toISOString() })
      .eq('item_id', item.id)
      .eq('user_id', user.id)
    setArriving(false)
    toast('도착을 기록했어요. 주최자에게 알림이 가요.')
    if (onChanged) onChanged()
  }

  // 주최자 도착 체크
  async function markOrganizerArrival() {
    if (!user) return
    setArriving(true)
    await supabase
      .from('items')
      .update({ organizer_arrived_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('created_by', user.id)
    setArriving(false)
    toast('도착을 기록했어요.')
    if (onChanged) onChanged()
  }

  const open = item.status === 'open' && !(item.close_at && new Date(item.close_at) <= Date.now())
  const closed = !open
  const myParticipant = item.participants?.find?.((p) => p.user_id === user?.id)
  const arrivedCount = (item.participants ?? []).filter((p) => p.arrived_at).length

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
        {item.address && (
          <p className="l-region l-region-sub"><MapPin size={13} strokeWidth={2} /> {item.address}</p>
        )}

        {/* 집합 현황 진행바 */}
        <div className="l-progress">
          <div className="l-progress-top">
            <span><Users size={13} strokeWidth={2} /> 집합 현황</span>
            <strong>{participantCount}명 / {target > 0 ? `${target}명` : '무제한'}</strong>
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

        {/* 모집 기한 (기간 기준) */}
        {open && item.close_at && (
          <span className="l-deadline"><Clock size={12} strokeWidth={2.2} /> {fmtDeadline(item.close_at)}까지 모집</span>
        )}

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
          <div className="l-closed-note">
            <strong>모집 완료 · 함께배송 단계</strong>
            {fmtPickup(item.pickup_at, item.pickup_spot) && (
              <span className="l-pickup-line"><MapPin size={13} strokeWidth={2} /> {fmtPickup(item.pickup_at, item.pickup_spot)}</span>
            )}
            {!item.pickup_spot && isOwner && (
              <span className="l-pickup-hint">잊지 말고 집결 장소·시각을 정해주세요. (수정)</span>
            )}
          </div>
        )}

        {/* 함께배송 집결 현황 (마감 후) */}
        {closed && participantCount > 0 && (
          <div className="l-roster">
            <div className="l-roster-head">
              <span><CheckCircle2 size={13} strokeWidth={2} /> 집결 현황</span>
              <strong>{arrivedCount}명 / {participantCount}명 도착</strong>
            </div>
            <div className="l-roster-list">
              {item.participants.map((p, i) => (
                <span key={p.user_id ?? i} className={`l-roster-item${p.arrived_at ? ' arrived' : ''}`}>
                  <span className="l-roster-name">{p.nickname || '이웃'}</span>
                  {p.arrived_at ? <CheckCircle2 size={12} strokeWidth={2.4} /> : <MapPinOff size={12} strokeWidth={2.2} />}
                </span>
              ))}
            </div>
            {(user && myParticipant && !myParticipant.arrived_at) ? (
              <button type="button" className="btn btn-sm btn-block" onClick={markArrival} disabled={arriving}>
                {arriving ? '기록 중…' : '도착했어요'}
              </button>
            ) : (isOwner && !item.organizer_arrived_at) ? (
              <button type="button" className="btn btn-sm btn-block" onClick={markOrganizerArrival} disabled={arriving}>
                {arriving ? '기록 중…' : '주최자 도착'}
              </button>
            ) : null}
          </div>
        )}

        {/* 만든 이 전용: 수정/삭제 */}
        {isOwner && (
          <div className="owner-actions">
            {open && (
              <button type="button" className="btn btn-sm btn-outline" onClick={closeItem} disabled={closing}>
                <CheckCircle2 size={14} strokeWidth={2.2} /> {closing ? '마감 중…' : '모집 마감'}
              </button>
            )}
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditing(true)}>
              <Pencil size={14} strokeWidth={2.2} /> 수정
            </button>
            <button type="button" className="btn btn-sm btn-outline btn-danger" onClick={remove} disabled={busy}>
              <Trash2 size={14} strokeWidth={2.2} /> 삭제
            </button>
          </div>
        )}
      </div>

      {/* 수정 모달 — 등록과 동일한 마법사 UI */}
      <ItemFormModal
        open={editing}
        initial={item}
        user={user}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); if (onChanged) onChanged() }}
      />
    </article>
  )
}
