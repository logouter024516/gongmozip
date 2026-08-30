// pages/ChatThreadPage.jsx — 쪽지(채팅) 상세 스레드
// 메시지 목록 + 실시간 수신 + 읽음 처리.
// 공동구매/대여 맥락이 있으면 상단에 컨텍스트 칩으로 보여준다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import { MapPin, Users, Clock, CheckCircle2, MapPinOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { subscribeThread, markThreadRead, sendMessage } from '../lib/chat'
import { toast } from '../lib/toast'
import CardImage from '../components/CardImage'

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 집결 장소/시각 표시
function fmtPickup(value, spot) {
  if (!value && !spot) return ''
  const spotPart = spot ? `${spot}` : ''
  if (!value) return spotPart && `집결: ${spotPart}`
  const d = new Date(value)
  const date = `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return spotPart ? `${date} · ${spotPart}` : `${date}`
}

// 모집 마감 시각 표시 (기간 기준)
function fmtDeadline(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function ThreadBody() {
  const { id } = useParams()
  const { user } = useAuth()
  const [meta, setMeta] = useState(null)
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [arriving, setArriving] = useState(false)
  const [roster, setRoster] = useState([])
  const scrollRef = useRef(null)

  const myId = user?.id

  // 참여자 닉네임 맵 (sender_id → 닉네임)
  const nickMap = useMemo(() => {
    const map = {}
    for (const p of (meta?.participants ?? [])) {
      if (p.user_id) map[p.user_id] = p.nickname || '이웃'
    }
    return map
  }, [meta])

  const others = useMemo(
    () => (meta?.participants ?? []).filter((p) => p.user_id !== myId).map((p) => p.nickname || '이웃'),
    [meta, myId]
  )
  const title = meta?.item?.name || meta?.rental?.name || others.join(', ') || '쪽지'
  const subtitle = meta?.is_group
    ? `참여자 ${others.length + 1}명과의 공동구매 대화`
    : meta?.rental || meta?.item ? `${others.join(', ')} 님과의 대화` : null

  async function loadMeta() {
    const { data } = await supabase
      .from('chat_thread_list')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    setMeta(data)
  }

  async function loadMessages() {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, body, sender_id, created_at')
      .eq('thread_id', id)
      .order('created_at', { ascending: true })
    if (error) { setLoading(false); return }
    setMessages((prev) => {
      // 새 메시지가 도착하면 읽음 처리하고, 실시간 수신과 병합(중복 방지)한다.
      if (data.length > prev.length) markThreadRead(id, myId)
      if (data.length === prev.length && prev.every((m, i) => m.id === data[i]?.id)) return prev
      return data ?? []
    })
    setLoading(false)
  }

  // 공동구매 그룹채팅 요약(참여/집결 현황) 계산
  const item = meta?.item || null
  const itemOpen = !!item && item.status === 'open' && !(item.close_at && new Date(item.close_at) <= Date.now())
  const itemClosed = !!item && !itemOpen
  const target = Number(item?.target_count) || 0
  const percent = target > 0 ? Math.min(100, Math.round((roster.length / target) * 100)) : 0
  const myParticipant = item ? roster.find((p) => p.user_id === myId) : null
  const arrivedCount = roster.filter((p) => p.arrived_at).length
  const isOwner = !!item && item.created_by === myId

  // 참여 명단(닉네임/도착) 로드
  useEffect(() => {
    if (!item?.id) { setRoster([]); return }
    let on = true
    supabase.from('item_participant_list').select('*').eq('item_id', item.id)
      .then(({ data }) => { if (on) setRoster(data ?? []) })
    return () => { on = false }
  }, [item?.id])

  async function refreshRoster() {
    if (!item?.id) return
    const { data } = await supabase.from('item_participant_list').select('*').eq('item_id', item.id)
    setRoster(data ?? [])
  }

  // 참여자 도착 체크
  async function markArrival() {
    if (!user || !item) return
    setArriving(true)
    await supabase
      .from('item_participants')
      .update({ arrived_at: new Date().toISOString() })
      .eq('item_id', item.id)
      .eq('user_id', user.id)
    setArriving(false)
    toast('도착을 기록했어요. 주최자에게 알림이 가요.')
    refreshRoster()
  }

  // 주최자 도착 체크
  async function markOrganizerArrival() {
    if (!user || !item) return
    setArriving(true)
    await supabase
      .from('items')
      .update({ organizer_arrived_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('created_by', user.id)
    setArriving(false)
    toast('도착을 기록했어요.')
  }

  useEffect(() => {
    loadMeta()
    loadMessages()
    markThreadRead(id, myId)

    const sub = subscribeThread(id, (msg) => {
      // 내가 낙관적으로 추가한 메시지는 건너뛰고, 이미 있는 id는 중복 방지
      if (msg.sender_id === myId) return
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      markThreadRead(id, myId)
    })

    // 실시간 구독이 불안정한 네트워크에서도 최신 메시지를 보장하는 백업 폴링
    const poll = setInterval(() => { loadMessages() }, 6000)

    return () => { sub.unsubscribe(); clearInterval(poll) }
  }, [id, myId])

  // 새 메시지가 오면 맨 아래로 스크롤
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, loading])

  async function handleSend(e) {
    e.preventDefault()
    if (!body.trim() || sending) return
    setSending(true)
    const text = body
    try {
      // 낙관적 추가 (Realtime echo가 아닌 나의 메시지)
      setMessages((prev) => [
        ...prev,
        { id: `tmp-${Date.now()}`, body: text, sender_id: myId, created_at: new Date().toISOString() },
      ])
      setBody('')
      await sendMessage(id, myId, text)
    } catch (err) {
      toast(err?.message || '메시지를 보내지 못했어요', { type: 'error' })
      setMessages((prev) => prev.filter((m) => m.body !== text || m.sender_id !== myId))
    }
    setSending(false)
  }

  return (
    <div className="container page chat-thread-page">
      <div className="chat-thread-head">
        <Link to="/chat" className="chat-thread-back" aria-label="쪽지 목록으로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          쪽지
        </Link>
        <div className="chat-thread-titles">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      {meta?.rental || meta?.item ? (
        <p className="chat-context-chip">
          {meta.rental ? '대여' : '공동구매'} · {title} 관련 대화예요. 매칭 후 실제 만남은 안전하게 진행해주세요.
        </p>
      ) : null}

      {/* 공동구매 상세 요약 (그룹채팅에서 집결 현황 등을 바로 확인) */}
      {item && (
        <div className="chat-item-card card">
          <div className="chat-item-head">
            <CardImage src={item.image_url} label={item.name} seed={item.id || item.name} />
            <div className="chat-item-head-text">
              <h2 className="l-title">{item.name}</h2>
              <p className="l-region"><MapPin size={13} strokeWidth={2} /> {item.address || item.region || '지역 미지정'}</p>
              {(item.category) && <span className="l-cat-chip">{item.category}</span>}
            </div>
          </div>

          {/* 가격 */}
          {(() => {
            const total = Number(item.price) || 0
            const ship = Number(item.shipping_cost) || 0
            const perHead = Math.round(total / Math.max(1, Number(item.min_qty) || 1))
            return (
              <div className="l-price-row">
                <span className="l-price-label">1인당</span>
                <div>
                  <div className="l-price-main">{total > 0 ? `${perHead.toLocaleString()}원` : '금액 미정'}</div>
                  {total > 0 && (
                    <div className="l-price-total-line">
                      <span>총 {total.toLocaleString()}원</span>
                      {ship > 0
                        ? <span className="l-ship">+배송비 {ship.toLocaleString()}원</span>
                        : <span className="l-ship l-ship-free">배송비 무료</span>}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* 참여 현황 진행바 */}
          <div className="l-progress">
            <div className="l-progress-top">
              <span><Users size={13} strokeWidth={2} /> 참여 현황</span>
              <strong>{roster.length}명{target > 0 ? ` / ${target}명` : ''}</strong>
            </div>
            {target > 0 && (
              <div className="l-progress-bar">
                <div className="l-progress-fill" style={{ width: `${percent}%` }} />
              </div>
            )}
          </div>

          {itemOpen && item.close_at && (
            <span className="l-deadline"><Clock size={12} strokeWidth={2.2} /> {fmtDeadline(item.close_at)}까지 모집</span>
          )}
          {itemOpen && target === 0 && !item.close_at && (
            <span className="l-deadline"><Clock size={12} strokeWidth={2.2} /> 영구(무기한) 모집 중</span>
          )}

          {/* 마감 후: 집결 정보 + 명단 */}
          {itemClosed && (
            <div className="chat-item-closed">
              <div className="l-closed-note"><strong>모집 완료 · 함께배송 단계</strong></div>
              {(item.pickup_spot || item.pickup_at) && (
                <span className="l-pickup-line"><MapPin size={13} strokeWidth={2} /> {fmtPickup(item.pickup_at, item.pickup_spot)}</span>
              )}
              {!item.pickup_spot && isOwner && (
                <span className="l-pickup-hint">잊지 말고 집결 장소·시각을 정해주세요. (카드에서 수정)</span>
              )}

              <div className="l-roster">
                <div className="l-roster-head">
                  <span><CheckCircle2 size={13} strokeWidth={2} /> 집결 현황</span>
                  <strong>{arrivedCount}명 / {roster.length}명 도착</strong>
                </div>
                <div className="l-roster-list">
                  {roster.map((p, i) => (
                    <span key={p.user_id ?? i} className={`l-roster-item${p.arrived_at ? ' arrived' : ''}`}>
                      <span className="l-roster-name">{p.nickname || '이웃'}</span>
                      {p.arrived_at ? <CheckCircle2 size={12} strokeWidth={2.4} /> : <MapPinOff size={12} strokeWidth={2.2} />}
                    </span>
                  ))}
                </div>
                {(myParticipant && !myParticipant.arrived_at) ? (
                  <button type="button" className="btn btn-sm btn-block" onClick={markArrival} disabled={arriving}>
                    {arriving ? '기록 중…' : '도착했어요'}
                  </button>
                ) : isOwner && !item.organizer_arrived_at ? (
                  <button type="button" className="btn btn-sm btn-block" onClick={markOrganizerArrival} disabled={arriving}>
                    {arriving ? '기록 중…' : '주최자 도착'}
                  </button>
                ) : (myParticipant && myParticipant.arrived_at) ? (
                  <span className="field-hint wiz-center-hint">도착이 기록됐어요.</span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>불러오는 중…</div>
      ) : (
        <div className="chat-box card">
          <div className="chat-messages" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="chat-empty">대화를 시작해보세요. 첫 메시지에 인사를 나눠요.</div>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === myId
                return (
                  <div key={m.id} className={`chat-msg${mine ? ' chat-msg-mine' : ''}`}>
                    <div className="chat-bubble">
                      {!mine && <span className="chat-bubble-name">{nickMap[m.sender_id] || '이웃'}</span>}
                      <span className="chat-bubble-text">{m.body}</span>
                      <span className="chat-bubble-time">{fmtTime(m.created_at)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <form className="chat-input-row" onSubmit={handleSend}>
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="쪽지 보내기"
              maxLength={2000}
              aria-label="쪽지 내용"
            />
            <button type="submit" className="btn" disabled={sending || !body.trim()}>
              {sending ? '…' : '보내기'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default function ChatThreadPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <ThreadBody />
      </Layout>
    </ProtectedRoute>
  )
}