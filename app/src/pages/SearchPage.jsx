// pages/SearchPage.jsx — 검색창 페이지
// 공동구매 물품과 대여 물품을 동시에 검색한다.
// 1) Edge Function(search-ai)을 통해 LLM(Gemini) 자연어 해석 + 현재 위치 기준 가까운 순 정렬
// 2) 브라우저 위치정보(geolocation)로 사용자 좌표 획득(실패 시 자동 무시)
// 3) LLM/함수 실패 시 기존 키워드 검색 + 가까운 순 정렬로 폴백(fallback)

import { useEffect, useState } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import SearchBar from '../components/SearchBar'
import ItemCard from '../components/ItemCard'
import RentCard from '../components/RentCard'
import { supabase } from '../lib/supabase'
import { sortByDistance, fmtKm } from '../lib/location'

function SearchBody() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [rentals, setRentals] = useState([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState(null)      // 'ai' | 'keyword' | null
  const [coords, setCoords] = useState(null)  // 사용자 위치 { lat, lng }
  const [locOk, setLocOk] = useState(false)

  // 마운트 시 브라우저 위치정보 획득 (실패 시 조용히 넘어감)
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocOk(true)
      },
      () => { /* 권한 거부 등 → 위치 없이 검색 */ },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 600000 }
    )
  }, [])

  // 검색 실행: Edge Function 우선, 실패 시 로컬 폴백
  useEffect(() => {
    const q = query.trim()
    if (!q) { setItems([]); setRentals([]); setSearched(false); setMode(null); return }

    let cancelled = false
    setLoading(true)

    async function run() {
      let modeNow = 'keyword'
      let out = null

      // 1) LLM + 거리순 정렬 (Edge Function)
      try {
        const { data, error } = await supabase.functions.invoke('search-ai', {
          body: { query: q, lat: coords?.lat ?? null, lng: coords?.lng ?? null },
        })
        if (error) throw error
        if (data && data.error) throw new Error(data.error)
        out = data
        modeNow = data?.mode === 'ai' ? 'ai' : 'keyword'
      } catch (err) {
        // 2) 폴백: 로컬 키워드 검색 + 위치 있으면 거리순
        const pat = `%${q}%`
        const [itemRes, rentRes] = await Promise.all([
          supabase.from('items').select('*, participants:item_participants(user_id)').or(`name.ilike.${pat},region.ilike.${pat}`).order('created_at', { ascending: false }),
          supabase.from('rentals').select('*, lender:profiles!rentals_lender_id_fkey(nickname)').ilike('name', pat).order('created_at', { ascending: false }),
        ])
        const localItems = itemRes.error ? [] : (itemRes.data ?? [])
        const localRentals = rentRes.error ? [] : (rentRes.data ?? []).map((r) => ({ ...r, lender_nickname: r.lender?.nickname }))
        out = {
          items: sortByDistance(localItems, coords),
          rentals: sortByDistance(localRentals, coords),
          parsed: null,
        }
        modeNow = 'keyword'
      }

      if (cancelled) return
      setItems(out?.items ?? [])
      setRentals(out?.rentals ?? [])
      setMode(modeNow)
      setSearched(true)
      setLoading(false)
    }

    run()
    return () => { cancelled = true }
  }, [query, coords])

  const total = items.length + rentals.length

  return (
    <div className="container page">
      <div className="page-header">
        <h1>검색</h1>
        <p>자연어로 물어보세요. 예) "제주 감귤 공동구매", "살려는 전동 드릴"</p>
      </div>

      {/* 상단 검색창 */}
      <div style={{ maxWidth: 560, marginBottom: 'var(--space-8)' }}>
        <SearchBar value={query} onChange={setQuery} placeholder="물건, 지역, 가격을 자연어로 검색…" />
      </div>

      {/* 상태 배지 */}
      {(query.trim() && searched) && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-6)', alignItems: 'center' }}>
          {mode === 'ai' && <span className="search-badge search-badge-ai">AI 검색</span>}
          {mode !== 'ai' && <span className="search-badge">키워드 검색</span>}
          {locOk && <span className="search-badge">현재 위치 기준 가까운 순</span>}
        </div>
      )}
      {(loading) && <div className="search-empty">검색 중…</div>}

      {!query.trim() ? (
        <div className="search-empty">물건 이름이나 지역을 입력해 검색하세요.</div>
      ) : (!loading && searched && total === 0) ? (
        <div className="search-empty">"{query}"에 대한 결과가 없어요.</div>
      ) : (
        <>
          {items.length > 0 && (
            <>
              <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-4)' }}>
                공동구매 ({items.length})
                {coords && <span className="search-distance-hint"> 거리순</span>}
              </h2>
              <div className="grid">
                {items.map((item) => {
                  // 거리 표시가 가능하면 ItemCard 하단에 덧붙인다
                  return <SearchItemCard key={item.id} item={item} coords={coords} />
                })}
              </div>
            </>
          )}

          {rentals.length > 0 && (
            <>
              <h2 style={{ fontSize: 'var(--text-2xl)', margin: 'var(--space-8) 0 var(--space-4)' }}>
                대여 ({rentals.length})
                {coords && <span className="search-distance-hint"> 거리순</span>}
              </h2>
              <div className="grid grid-2">
                {rentals.map((r) => {
                  return <RentCard key={r.id} rent={r} onChanged={() => {}} />
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ItemCard 데코레이터: 항목의 계산 거리(_distKm)를 배지로 표시
function SearchItemCard({ item, coords }) {
  const km = item._distKm != null ? item._distKm : null
  const distText = coords && km != null ? fmtKm(km) : null
  return (
    <div style={{ position: 'relative' }}>
      {distText && (
        <span className="search-distance-chip">{distText}</span>
      )}
      <ItemCard item={item} onChanged={() => {}} />
    </div>
  )
}

export default function SearchPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <SearchBody />
      </Layout>
    </ProtectedRoute>
  )
}
