// components/RentCard.jsx — 대여 요청 카드
// '빌리고 싶어요' 요청 중심. 상태: open(모집 중) → matched(매칭) → in_use(대여 중) → done(반납 완료).
// 모집 중이면 이웃들이 '빌려드릴게요' 제안을 보내고, 요청자가 승인/거절한다.
//
//      open        matched        in_use       done
//  요청자  수정/삭제   매칭 취소       반납 기다림    다시 모집
//         제안 승인/거절
//  이웃    제안/철회    (참여 불가)     -           -
//  빌려주는이  -        대여 시작      반납 확인     -

import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, User as UserIcon, Pencil, Trash2, CalendarDays, MessageCircle, Send } from 'lucide-react'
import CardImage from './CardImage'
import Modal from './Modal'
import { toast } from '../lib/toast'
import ImageUpload from './ImageUpload'
import { openThread } from '../lib/chat'
import { findProfanity } from '../lib/profanity'

const CATEGORIES = ['공구·도구', '가전·생활', '여행·캠핑', '기타']

const STATUS = {
  open:    { label: '빌리고 싶어요', cls: 'badge-available' },
  matched: { label: '매칭 완료',    cls: 'badge-reserved' },
  in_use:  { label: '대여 중',     cls: 'badge-onloan' },
  done:    { label: '반납 완료',    cls: 'badge-returned' },
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

// '빌려드릴게요' 제안 작성 모달
function OfferModal({ open, rent, onClose, onOffered }) {
  const { user } = useAuth()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!user) return
    const bad = findProfanity(message)
    if (bad) { setError(`'${bad}'는 사용하기 어려운 표현이에요. 다른 문구로 바꿔주세요.`); return }
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('rental_offers')
      .insert({ rental_id: rent.id, offerer_id: user.id, message: message.trim() })
    setBusy(false)
    if (err) {
      if (err.code === '23505') setError('이미 제안을 보냈어요. 요청자가 확인 중이에요.')
      else setError(err.message)
      return
    }
    setMessage('')
    onClose()
    toast('빌려드릴게요 제안을 보냈어요!')
    if (onOffered) onOffered()
  }

  return (
    <Modal open={open} title="빌려드릴게요" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="l-status-note">「{rent.name}」을 빌려드릴 수 있어요. 날짜·장소·조건을 알려주시면 요청자가 확인해요.</p>
        <div className="field">
          <label htmlFor={`offer-msg-${rent.id}`}>제안 내용(선택)</label>
          <textarea
            id={`offer-msg-${rent.id}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="예: 주말 낮에 짧게 빌려드릴 수 있어요. 대여료는 말씀하신 금액이면 돼요."
            rows={3}
          />
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button type="submit" className="btn btn-secondary btn-block" disabled={busy}>
          {busy ? '보내는 중…' : '빌려드릴게요'}
        </button>
      </form>
    </Modal>
  )
}

export default function RentCard({ rent, onChanged }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [chatting, setChatting] = useState(false)
  const [offerOpen, setOfferOpen] = useState(false)
  const [offers, setOffers] = useState([])
  const [offerBusy, setOfferBusy] = useState('')

  const myId = user?.id
  const isRequester = rent.requester_id === myId
  const isLender = !!rent.lender_id && rent.lender_id === myId
  const meta = STATUS[rent.status] || { label: rent.status, cls: 'badge-closed' }

  const pricePerDay = Number(rent.price_per_day) || 0
  const deposit = Number(rent.deposit) || 0

  const pendingOffers = offers.filter((o) => o.status === 'pending')
  const myOffer = offers.find((o) => o.offerer_id === myId && o.status === 'pending')

  // 모집 중일 때만 제안 목록 조회(요청자는 목록, 제안자는 자기 제안 상태)
  const loadOffers = useCallback(async () => {
    if (!user || rent.status !== 'open') return
    const { data } = await supabase
      .from('rental_offers')
      .select('*, offerer:profiles!rental_offers_offerer_id_fkey(nickname)')
      .eq('rental_id', rent.id)
      .order('created_at', { ascending: true })
    setOffers(data ?? [])
  }, [user, rent.id, rent.status])

  useEffect(() => { loadOffers() }, [loadOffers])

  function refresh() { if (onChanged) onChanged() }

  // 제안자: 제안 철회
  async function withdrawOffer(o) {
    setOfferBusy(o.id)
    const { error: err } = await supabase.from('rental_offers').update({ status: 'withdrawn' }).eq('id', o.id)
    setOfferBusy('')
    if (err) { toast(err.message || '취소하지 못했어요', { type: 'error' }); return }
    toast('제안을 취소했어요.')
    loadOffers()
  }

  // 요청자: 제안 거절
  async function declineOffer(o) {
    setOfferBusy(o.id)
    const { error: err } = await supabase.from('rental_offers').update({ status: 'declined' }).eq('id', o.id)
    setOfferBusy('')
    if (err) { toast(err.message || '거절하지 못했어요', { type: 'error' }); return }
    toast('제안을 거절했어요.')
    loadOffers()
  }

  // 요청자: 제안 승인 → 트리거가 rentals를 matched로 + 나머지 제안 거절 + 제안자 알림
  async function acceptOffer(o) {
    if (!confirm(`${o.offerer?.nickname || '이웃'}님의 제안을 수락해 매칭할까요?`)) return
    setOfferBusy(o.id)
    const { error: err } = await supabase.from('rental_offers').update({ status: 'accepted' }).eq('id', o.id)
    setOfferBusy('')
    if (err) { toast(err.message || '수락하지 못했어요', { type: 'error' }); return }
    toast('매칭됐어요! 상대방의 대여 시작을 기다리세요.')
    refresh()
  }

  async function updateRental(patch, successMsg) {
    setBusy(true)
    const { error: err } = await supabase.from('rentals').update(patch).eq('id', rent.id)
    setBusy(false)
    if (err) { toast(err.message || '처리하지 못했어요', { type: 'error' }); return }
    toast(successMsg)
    refresh()
  }

  function cancelMatch() { updateRental({ status: 'open', lender_id: null }, '매칭을 취소하고 다시 모집해요.') }
  function startRental() { updateRental({ status: 'in_use' }, '대여 시작! 반납받으면 확인해주세요.') }
  function markReturned() { updateRental({ status: 'done' }, '반납 처리했어요. 이웃과 나눠서 고마워요!') }
  function relist() { updateRental({ status: 'open', lender_id: null }, '다시 모집할게요.') }

  async function remove() {
    if (!confirm('이 대여 요청을 삭제할까요?')) return
    setBusy(true)
    const { error: err } = await supabase.from('rentals').delete().eq('id', rent.id).eq('requester_id', myId)
    setBusy(false)
    if (err) { toast(err.message || '삭제하지 못했어요', { type: 'error' }); return }
    toast('삭제했어요')
    refresh()
  }

  // 거래 상대와 쪽지 스레드 열기
  async function startChat(targetId) {
    if (!user || !targetId) return
    setChatting(true)
    try {
      const thread = await openThread(targetId, { rentalId: rent.id })
      navigate(`/chat/${thread.id}`)
    } catch (e) {
      toast('쪽지를 시작하지 못했어요', { type: 'error' })
    }
    setChatting(false)
  }

  // 상단 상태 배지 제목
  const statusNote = rent.status === 'open'
    ? (rent.requester_nickname ? `${rent.requester_nickname}님이 빌리고 싶어요` : '이웃이 빌리고 싶어해요')
    : meta.label

  // 각 상태/역할별 행동 영역
  let action = null
  if (rent.status === 'open') {
    if (isRequester) {
      action = (
        <div className="l-action-stack">
          <p className="l-status-note l-mine">내 요청이에요. 이웃의 제안을 확인해보세요.</p>
          {pendingOffers.length === 0 ? (
            <p className="l-status-note">아직 제안이 없어요. 이웃이 제안하면 여기에 보여요.</p>
          ) : (
            <div className="rent-offers">
              {pendingOffers.map((o) => (
                <div key={o.id} className="rent-offer">
                  <div className="rent-offer-head">
                    <span className="rent-offer-nick"><UserIcon size={13} strokeWidth={2} /> {o.offerer?.nickname || '이웃'} 님</span>
                    <button type="button" className="chat-call-btn chat-call-tiny" onClick={() => startChat(o.offerer_id)} disabled={chatting} title="쪽지 보내기">
                      <MessageCircle size={13} strokeWidth={2.2} /> 쪽지
                    </button>
                  </div>
                  {o.message && <p className="rent-offer-msg">{o.message}</p>}
                  <div className="l-action-row">
                    <button type="button" className="btn btn-block l-cta" onClick={() => acceptOffer(o)} disabled={!!offerBusy}>수락</button>
                    <button type="button" className="btn btn-outline btn-block l-cta" onClick={() => declineOffer(o)} disabled={!!offerBusy}>거절</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    } else if (!user) {
      action = <p className="l-status-note">로그인하면 '빌려드릴게요' 제안할 수 있어요.</p>
    } else if (myOffer) {
      action = (
        <div className="l-action-stack">
          <p className="l-status-note">제안을 보냈어요. 요청자가 확인 중이에요.</p>
          <button type="button" className="btn btn-outline btn-block l-cta" onClick={() => withdrawOffer(myOffer)} disabled={!!offerBusy}>{offerBusy ? '…' : '제안 취소'}</button>
        </div>
      )
    } else {
      action = <button type="button" className="btn btn-secondary btn-block l-cta" onClick={() => setOfferOpen(true)}><Send size={15} strokeWidth={2.2} /> 빌려드릴게요 제안</button>
    }
  } else if (rent.status === 'matched') {
    if (isLender) {
      action = (
        <div className="l-action-stack">
          <p className="l-status-note">매칭 완료 — {rent.requester_nickname || '요청자'}님에게 빌려드려요. 이제 대여 시작을 알려주세요.</p>
          <button type="button" className="btn btn-secondary btn-block l-cta" onClick={startRental} disabled={busy}>{busy ? '처리 중…' : '대여 시작'}</button>
        </div>
      )
    } else if (isRequester) {
      action = (
        <div className="l-action-stack">
          <p className="l-status-note">매칭 완료 — {rent.lender_nickname || '이웃'}님이 빌려드려요. 대여 시작을 기다리세요.</p>
          <button type="button" className="btn btn-outline btn-block l-cta" onClick={cancelMatch} disabled={busy}>{busy ? '…' : '매칭 취소'}</button>
        </div>
      )
    } else {
      action = <p className="l-status-note">이미 매칭된 대여예요.</p>
    }
  } else if (rent.status === 'in_use') {
    if (isLender) {
      action = (
        <div className="l-action-stack">
          <p className="l-status-note">대여 중이에요. 반납받으면 확인해주세요.</p>
          <button type="button" className="btn btn-secondary btn-block l-cta" onClick={markReturned} disabled={busy}>{busy ? '처리 중…' : '반납 확인'}</button>
        </div>
      )
    } else if (isRequester) {
      action = <p className="l-status-note">{rent.lender_nickname || '이웃'}님에게 빌리는 중이에요. 반납 확인을 기다려요.</p>
    } else {
      action = <p className="l-status-note">대여 중이에요.</p>
    }
  } else if (rent.status === 'done') {
    if (isRequester) {
      action = (
        <div className="l-action-stack">
          <p className="l-status-note">반납 완료! 다시 필요하면 재모집할 수 있어요.</p>
          <button type="button" className="btn btn-outline btn-block l-cta" onClick={relist} disabled={busy}>{busy ? '…' : '다시 모집'}</button>
        </div>
      )
    } else if (isLender) {
      action = <p className="l-status-note">반납 처리 완료. 나눠줘서 고마워요!</p>
    } else {
      action = <p className="l-status-note">반납 완료된 대여예요.</p>
    }
  }

  // 쪽지 대상: 매칭/대여 중엔 빌려주는 이웃, 모집 중 제안자는 요청자
  let chatTarget = null
  if (rent.lender_id && rent.lender_id !== myId) chatTarget = rent.lender_id
  else if (isRequester && rent.status === 'open') chatTarget = null
  else if (user && rent.requester_id !== myId) chatTarget = rent.requester_id

  const canEditDelete = isRequester && rent.status === 'open' && !rent.lender_id

  return (
    <article className="card l-card">
      <div className="l-card-media">
        <CardImage src={rent.image_url} label={rent.name} seed={rent.id || rent.name} />
        <span className={`badge l-badge-corner ${meta.cls}`}>{statusNote}</span>
        {rent.category && <span className="l-cat-chip">{rent.category}</span>}
      </div>

      <div className="l-card-body">
        <h2 className="l-title">{rent.name}</h2>
        <p className="l-region"><MapPin size={13} strokeWidth={2} /> 이웃 공유 물건</p>
        {rent.address && (
          <p className="l-region l-region-sub"><MapPin size={13} strokeWidth={2} /> {rent.address}</p>
        )}
        <Period startsOn={rent.starts_on} endsOn={rent.ends_on} />

        {(pricePerDay > 0 || deposit > 0) && (
          <div className="l-rent-info">
            <div className="l-rent-info-item">
              <span className="l-rent-info-label">하루 이용료</span>
              <strong>{pricePerDay > 0 ? `${pricePerDay.toLocaleString()}원` : '무료'}</strong>
            </div>
            <div className="l-rent-info-item">
              <span className="l-rent-info-label">보증금</span>
              <strong>{deposit > 0 ? `${deposit.toLocaleString()}원` : '없음'}</strong>
            </div>
          </div>
        )}

        {rent.status !== 'open' && rent.lender_nickname && (
          <p className="l-lender"><UserIcon size={14} strokeWidth={2} /> {rent.lender_nickname} 님이 빌려드려요</p>
        )}
        {rent.status !== 'open' && isLender && rent.requester_nickname && (
          <p className="l-lender"><UserIcon size={14} strokeWidth={2} /> {rent.requester_nickname} 님에게 빌려드려요</p>
        )}

        {action}

        {chatTarget && (
          <button type="button" className="btn btn-outline btn-block chat-call-btn" onClick={() => startChat(chatTarget)} disabled={chatting}>
            <MessageCircle size={15} strokeWidth={2.2} />
            {chatting ? '열기 중…' : '거래 상대에게 쪽지'}
          </button>
        )}

        {canEditDelete && (
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

      <EditRentModal open={editing} rent={rent} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh() }} />
      <OfferModal open={offerOpen} rent={rent} onClose={() => setOfferOpen(false)} onOffered={loadOffers} />
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
  const [address, setAddress] = useState(rent.address ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    const bad = findProfanity(name) || findProfanity(desc) || findProfanity(address)
    if (bad) { setError(`'${bad}'는 사용하기 어려운 표현이에요. 다른 문구로 바꿔주세요.`); return }
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
        address: address.trim(),
      })
      .eq('id', rent.id)
      .eq('requester_id', rent.requester_id)
    setBusy(false)
    if (err) { setError(err.message); return }
    toast('수정했어요!')
    onSaved()
  }

  return (
    <Modal open={open} title="빌리고 싶어요 수정" onClose={onClose}>
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor={`rname-${rent.id}`}>필요한 물건 이름</label>
          <input id={`rname-${rent.id}`} value={name} required onChange={(e) => setName(e.target.value)} placeholder="예: 전동 드릴" />
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor={`rprice-${rent.id}`}>하루 이용료(원)</label>
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
            <label htmlFor={`rstart-${rent.id}`}>필요한 시작일(선택)</label>
            <input id={`rstart-${rent.id}`} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`rend-${rent.id}`}>반납 예정일(선택)</label>
            <input id={`rend-${rent.id}`} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>대표 이미지</label>
          <ImageUpload value={imageUrl} onChange={setImageUrl} hint="사진을 올리거나 제거할 수 있어요." />
        </div>
        <div className="field">
          <label htmlFor={`rdesc-${rent.id}`}>설명(언제·얼마나 필요한지 등)</label>
          <textarea id={`rdesc-${rent.id}`} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="예: 주말 2일 사용 예정" />
        </div>
        <div className="field">
          <label htmlFor={`raddr-${rent.id}`}>상세 위치(선택)</label>
          <input id={`raddr-${rent.id}`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예: 서울 마포구 성산동 / 아파트 동·호수" />
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button type="submit" className="btn btn-secondary btn-block" disabled={busy}>
          {busy ? '저장 중…' : '저장하기'}
        </button>
      </form>
    </Modal>
  )
}