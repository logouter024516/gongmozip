// pages/NotificationsPage.jsx — 알림 허브
// 참여/마감/집결/쪽지/대여 상태 알림 목록. 새 알림은 실시간으로 붙는다.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { fetchNotifications, markAllRead, markRead, subscribeNotifications, NOTIFY_TYPE, notifyPath } from '../lib/notify'

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}.${d.getDate()}`
}

function NotifyBody() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await fetchNotifications({ limit: 50 })
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const sub = subscribeNotifications(user?.id, (n) => {
      setItems((prev) => [n, ...prev])
    })
    return () => { sub.unsubscribe() }
  }, [user?.id])

  async function open(n) {
    const path = notifyPath(n)
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      await markRead(n.id)
    }
    if (path) navigate(path)
  }

  async function markReadAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read_at: new Date().toISOString() })))
    await markAllRead()
  }

  const unreadCount = items.filter((i) => !i.read_at).length

  return (
    <div className="container page settings-page" style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1>알림</h1>
        <p>공동구매·대여 활동 상황을 알려드려요.</p>
      </div>

      {items.length > 0 && unreadCount > 0 && (
        <div className="notify-top">
          <span>안읽은 알림 {unreadCount}개</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={markReadAll}>모두 읽음</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className="search-empty">
          아직 알림이 없어요. 이웃의 반응과 활동 소식이 여기에 도착해요.
        </div>
      ) : (
        <div className="notify-list card">
          {items.map((n) => {
            const type = NOTIFY_TYPE[n.type] || '알림'
            const unread = !n.read_at
            return (
              <button
                key={n.id}
                type="button"
                className={`notify-item${unread ? ' notify-item-unread' : ''}`}
                onClick={() => open(n)}
              >
                <span className="notify-dot" aria-hidden="true" />
                <span className="notify-main">
                  <span className="notify-top">
                    <span className="notify-chip">{type}</span>
                    {unread && <span className="notify-new-badge">NEW</span>}
                  </span>
                  <span className="notify-title">{n.title}</span>
                  {n.body && <span className="notify-body">{n.body}</span>}
                  <span className="notify-time">{fmtTime(n.created_at)}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <NotifyBody />
      </Layout>
    </ProtectedRoute>
  )
}