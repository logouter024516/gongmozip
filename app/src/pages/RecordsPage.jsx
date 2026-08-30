// pages/RecordsPage.jsx — 이용내역 페이지
// 내가 참여한 공동구매와 내가 대여/빌린 물건을 타임라인으로 보여준다.

import { useEffect, useState } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import { ShoppingCart, Hand, ArrowUpRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function RecordsBody() {
  const { user } = useAuth()
  const [parts, setParts] = useState([])
  const [rents, setRents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function run() {
      const [pRes, rRes] = await Promise.all([
        supabase
          .from('item_participants')
          .select('*, item:items!inner(id, name, price, status)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('rentals')
          .select('*, requester:profiles!rentals_requester_id_fkey(nickname), lender:profiles!rentals_lender_id_fkey(nickname)')
          .or(`requester_id.eq.${user.id},lender_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
      ])
      if (!pRes.error) setParts(pRes.data ?? [])
      if (!rRes.error) {
        const flat = (rRes.data ?? []).map((r) => ({
          ...r,
          requester_nickname: r.requester?.nickname,
          lender_nickname: r.lender?.nickname,
        }))
        setRents(flat)
      }
      setLoading(false)
    }
    run()
  }, [user])

  if (loading) return <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>불러오는 중…</div>

  const total = parts.length + rents.length

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <div className="page-header">
        <h1>이용내역</h1>
        <p>내가 참여한 공동구매와 대여한 물건을 한눈에 모아봐요.</p>
      </div>

      {total === 0 ? (
        <div className="search-empty">아직 이용 내역이 없어요. 첫 공동구매나 대여를 시작해보세요!</div>
      ) : (
        <div className="rec-timeline">
          {parts.map((p) => (
            <div key={`p-${p.id}`} className="rec-item">
              <div className="rec-icon rec-icon-buy"><ShoppingCart size={18} strokeWidth={2} /></div>
              <div className="rec-body">
                <div className="rec-top">
                  <strong>공동구매 참여</strong>
                  <span className="rec-date">{fmtDate(p.created_at)}</span>
                </div>
                <div className="rec-title">{p.item?.name || '삭제된 물품'}</div>
                <span className="chip">{Number(p.item?.price || 0).toLocaleString()}원</span>
              </div>
            </div>
          ))}

          {rents.map((r) => {
            const isRequester = r.requester_id === user?.id
            const isLender = r.lender_id === user?.id
            const statusLabel = {
              open: '모집 중', matched: '매칭 완료', in_use: '대여 중', done: '반납 완료',
            }[r.status] || r.status
            const counterpart = isRequester
              ? (r.lender_nickname ? `${r.lender_nickname} 님에게 빌려요` : '아직 이웃을 기다려요')
              : (r.requester_nickname ? `${r.requester_nickname} 님에게 빌려드려요` : '요청자와 매칭돼요')
            return (
              <div key={`r-${r.id}`} className="rec-item">
                <div className={`rec-icon ${isLender ? 'rec-icon-rent-out' : 'rec-icon-rent'}`}>
                  {isLender ? <ArrowUpRight size={18} strokeWidth={2} /> : <Hand size={18} strokeWidth={2} />}
                </div>
                <div className="rec-body">
                  <div className="rec-top">
                    <strong>{isLender ? '빌려준 물건' : (isRequester ? '대여 요청' : '대여')}</strong>
                    <span className="rec-date">{fmtDate(r.created_at)}</span>
                  </div>
                  <div className="rec-title">{r.name}</div>
                  <span className="chip">{statusLabel} · {counterpart}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function RecordsPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <RecordsBody />
      </Layout>
    </ProtectedRoute>
  )
}
