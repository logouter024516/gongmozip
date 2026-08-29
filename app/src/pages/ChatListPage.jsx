// pages/ChatListPage.jsx — 쪽지(채팅) 목록
// 공동구매/대여에서 열린 스레드 목록. 마지막 메시지·안읽음 배지·상대 닉네임 노출.
// 새 메시지가 오면 실시간으로 목록 갱신.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { fetchThreads, subscribeIncoming } from '../lib/chat'

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}.${d.getDate()}`
}

function ChatListBody() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data, error: err } = await fetchThreads()
    if (err) { setError('쪽지를 불러오지 못했어요.'); setLoading(false); return }
    setThreads(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const sub = subscribeIncoming(user?.id, () => { load() })
    return () => { sub.unsubscribe() }
  }, [user?.id])

  return (
    <div className="container page chat-page">
      <div className="page-header">
        <h1>쪽지</h1>
        <p>공동구매·대여 등에서 시작된 대화가 여기 모여요.</p>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>불러오는 중…</div>
      ) : threads.length === 0 ? (
        <div className="search-empty">
          아직 쪽지가 없어요.
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Link className="btn btn-sm" to="/">공동구매 둘러보기</Link>
          </div>
        </div>
      ) : (
        <div className="chat-list">
          {threads.map((t) => {
            const others = (t.participants ?? []).filter((p) => p.user_id !== user?.id)
            const othersName = others.map((o) => o.nickname || '이웃').join(', ') || '이웃'
            const title = t.item?.name || t.rental?.name || othersName
            const contextChip = t.rental ? '대여' : (t.item ? '공동구매' : '쪽지')
            const last = t.last_message || null
            const unread = Number(t.unread_count) || 0
            return (
              <button
                key={t.id}
                type="button"
                className="chat-item card"
                onClick={() => navigate(`/chat/${t.id}`)}
              >
                <span className="chat-item-avatar" aria-hidden="true">
                  {String(othersName).charAt(0) || '?'}
                </span>
                <span className="chat-item-main">
                  <span className="chat-item-top">
                    <span className="chat-item-title">{title}</span>
                    <span className="chat-item-time">{fmtTime(t.last_message_at)}</span>
                  </span>
                  <span className="chat-item-sub">
                    <span className={`l-cat-chip chat-chip-${t.rental ? 'rent' : 'item'}`}>{contextChip}</span>
                    <span className="chat-item-snippet">
                      {last ? (last.sender_id === user?.id ? `나: ${last.body}` : last.body) : '대화를 시작해보세요.'}
                    </span>
                  </span>
                </span>
                {unread > 0 && <span className="chat-unread">{unread > 99 ? '99+' : unread}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ChatListPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <ChatListBody />
      </Layout>
    </ProtectedRoute>
  )
}