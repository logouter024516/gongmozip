// pages/ChatThreadPage.jsx — 쪽지(채팅) 상세 스레드
// 메시지 목록 + 실시간 수신 + 읽음 처리.
// 공동구매/대여 맥락이 있으면 상단에 컨텍스트 칩으로 보여준다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { subscribeThread, markThreadRead, sendMessage } from '../lib/chat'
import { toast } from '../lib/toast'

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
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
  const subtitle = meta?.rental || meta?.item ? `${others.join(', ')} 님과의 대화` : null

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
    if (error) return
    setMessages((prev) => {
      // 새 메시지가 도착하면 읽음 처리하고, 실시간 수신과 병합(중복 방지)한다.
      if (data.length > prev.length) markThreadRead(id, myId)
      if (data.length === prev.length && prev.every((m, i) => m.id === data[i]?.id)) return prev
      return data ?? []
    })
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