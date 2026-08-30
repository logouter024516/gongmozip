// components/ItemCard.jsx — 공동구매 카드(당근/카루셀 스타일)
// 대표 이미지 + 상태 배지 + 물품명 + 지역 + 1인당 가격(취소선 총액) + 집합 현황 진행바 + 참여 버튼.
// 내가 만든 모집이면 수정/삭제 버튼도 보여준다.

import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import { MapPin, Users, Pencil, Trash2, CheckCircle2, MapPinOff } from 'lucide-react'
import CardImage from './CardImage'
import Modal from './Modal'
import { toast } from '../lib/toast'
import ImageUpload from './ImageUpload'
import { joinItemChat, leaveItemChat } from '../lib/chat'
import { findProfanity } from '../lib/profanity'

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

  const open = item.status === 'open'
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

      {/* 수정 모달 */}
      <EditItemModal open={editing} item={item} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); if (onChanged) onChanged() }} />
    </article>
  )
}

// 내 공동구매 수정 모달
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function EditItemModal({ open, item, onClose, onSaved }) {
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(String(item.price ?? ''))
  const [shipping, setShipping] = useState(String(item.shipping_cost ?? ''))
  const [minQty, setMinQty] = useState(String(item.min_qty ?? '1'))
  const [target, setTarget] = useState(String(item.target_count ?? '4'))
  const [region, setRegion] = useState(item.region ?? '')
  const [category, setCategory] = useState(item.category || '기타')
  const [imageUrl, setImageUrl] = useState(item.image_url ?? '')
  const [pickupSpot, setPickupSpot] = useState(item.pickup_spot ?? '')
  const [pickupAt, setPickupAt] = useState(toLocalInput(item.pickup_at))
  const [address, setAddress] = useState(item.address ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    const bad = findProfanity(name) || findProfanity(region) || findProfanity(address) || findProfanity(pickupSpot)
    if (bad) { setError(`'${bad}'는 사용하기 어려운 표현이에요. 다른 문구로 바꿔주세요.`); return }
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
        pickup_spot: pickupSpot.trim(),
        pickup_at: pickupAt ? new Date(pickupAt).toISOString() : null,
        address: address.trim(),
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
        <div className="field">
          <label htmlFor={`iaddr-${item.id}`}>상세 위치(선택)</label>
          <input id={`iaddr-${item.id}`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예: 제주시 연동 330 / 아파트 동·호수" />
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor={`ipickup-${item.id}`}>집결 장소(선택)</label>
            <input id={`ipickup-${item.id}`} value={pickupSpot} onChange={(e) => setPickupSpot(e.target.value)} placeholder="예: 동네 마트 앞" />
          </div>
          <div className="field">
            <label htmlFor={`ipickuptime-${item.id}`}>집결 시각(선택)</label>
            <input id={`ipickuptime-${item.id}`} type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} />
          </div>
        </div>
        <div className="field well">
          <span className="field-hint">모집이 마감되면 참여자에게 집결 안내 알림이 가요. 함께배송 수령을 위해 꼭 정해주세요.</span>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button type="submit" className="btn btn-block" disabled={busy}>
          {busy ? '저장 중…' : '저장하기'}
        </button>
      </form>
    </Modal>
  )
}
