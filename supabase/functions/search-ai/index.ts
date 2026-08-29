// search-ai — 공모집 자연어 검색 Edge Function
// 1) Gemini로 사용자 질문을 구조화(카테고리/지역/키워드/가격) 파싱
// 2) Supabase(service role)에서 조건에 맞는 공동구매·대여를 조회
// 3) 사용자 현재 위치(위도/경도) 기준 '가까운 거리 순'으로 정렬해 반환
//
// POST /functions/v1/search-ai  body: { query, lat?, lng? }
// 응답: { mode:'ai'|'keyword', parsed, items, rentals }
// SHIFT: GEMINI_API_KEY 가 없거나 LLM 호출이 실패하면 keyword 모드로 폴백(앱은 절대 깨지지 않는다)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// 도서산간/주요 지역 좌표(가까운 순 정렬용). 클라이언트 lib과 동일한 값 유지.
const REGION_COORDS = {
  제주: { lat: 33.4996, lng: 126.5312 },
  제주시: { lat: 33.4996, lng: 126.5312 },
  서귀포시: { lat: 33.2543, lng: 126.5602 },
  울릉도: { lat: 37.4878, lng: 130.9028 },
  흑산도: { lat: 34.6725, lng: 125.4231 },
  백령도: { lat: 37.9742, lng: 124.6378 },
  강원: { lat: 37.8786, lng: 128.6413 },
  춘천시: { lat: 37.8813, lng: 127.7298 },
  속초시: { lat: 38.207, lng: 128.5918 },
  평창군: { lat: 37.3707, lng: 128.3898 },
  정선군: { lat: 37.3808, lng: 128.6614 },
  인제군: { lat: 38.0701, lng: 128.1703 },
  서울: { lat: 37.5665, lng: 126.978 },
  경기: { lat: 37.275, lng: 127.0085 },
  인천: { lat: 37.4563, lng: 126.7052 },
  가평군: { lat: 37.8316, lng: 127.5101 },
  대전: { lat: 36.3504, lng: 127.3845 },
  청주시: { lat: 36.6424, lng: 127.489 },
  광주: { lat: 35.1595, lng: 126.8526 },
  전주시: { lat: 35.8242, lng: 127.148 },
  대구: { lat: 35.8714, lng: 128.6014 },
  부산: { lat: 35.1796, lng: 129.0756 },
  울산: { lat: 35.5384, lng: 129.3114 },
  포항시: { lat: 36.019, lng: 129.3435 },
  안동시: { lat: 36.5684, lng: 128.7293 },
  경북: { lat: 36.4919, lng: 128.8889 },
  경남: { lat: 35.4606, lng: 128.2132 },
  창원시: { lat: 35.2279, lng: 128.6811 },
}

function regionCoords(region) {
  if (!region) return null
  const r = String(region).trim()
  if (REGION_COORDS[r]) return REGION_COORDS[r]
  for (const k of Object.keys(REGION_COORDS)) {
    if (r.includes(k)) return REGION_COORDS[k]
  }
  return null
}

function haversine(a, b) {
  if (!a || !b) return null
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function sortByDistance(list, userPos) {
  if (!userPos || !Array.isArray(list)) return list
  const withKm = list.map((x) => {
    const c = regionCoords(x.region)
    return { ...x, _distKm: c ? haversine(userPos, c) : null }
  })
  withKm.sort((a, b) => (a._distKm == null ? Infinity : a._distKm) - (b._distKm == null ? Infinity : b._distKm))
  return withKm
}

// 구조화 스키마: 사용자 질문에서 추출할 필드
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    keywords: { type: 'ARRAY', items: { type: 'STRING' }, description: '물품을 나타내는 핵심 키워드 (최대 5개)' },
    region: { type: 'STRING', description: '동네/지역명 (없으면 빈 문자열)' },
    category: { type: 'STRING', description: '카테고리. 식품·신선 / 생활용품 / 도서·산간 / 공구·도구 / 가전·생활 / 여행·캠핑 / 기타 중 하나, 없으면 빈 문자열' },
    price_max: { type: 'NUMBER', description: '최대 가격(원). 없으면 0' },
    is_rental: { type: 'BOOLEAN', description: '대여를 원하면 true, 공동구매면 false, 모르면 null' },
  },
  required: ['keywords', 'region', 'category', 'price_max', 'is_rental'],
}

async function parseWithGemini(apiKey, model, query) {
  const prompt =
    '너는 한국 공동구매/물품대여 서비스의 검색 파서다. 아래 사용자 검색 문장을 JSON 스키마에 맞춰 구조화해라.\n' +
    '평소 말투/은어도 이해해서 키워드로 바꾼다. 예: "살려는 전동드릴" → 공구·도구, "제주에서 감귤 같이 사려는" → category 식품·신선 + region 제주 + is_rental false.\n' +
    '가격은 기재되면 price_max에 넣고 아니면 0. is_rental은 대여 요청이면 true, 공동구매면 false, 불분명하면 null.\n\n' +
    `검색 문장: "${query}"`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
      }),
    }
  )
  if (!res.ok) {
    const t = await res.text()
    throw new Error('gemini http ' + res.status + ': ' + t.slice(0, 200))
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('gemini no content')
  return JSON.parse(text)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, lat, lng } = await req.json()
    const q = String(query || '').trim()
    if (!q) return json({ items: [], rentals: [], mode: 'keyword', parsed: null })

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash-lite'
    const userPos = (lat != null && lng != null) ? { lat: Number(lat), lng: Number(lng) } : null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    let parsed = null
    let mode = 'keyword'
    if (apiKey) {
      try {
        parsed = await parseWithGemini(apiKey, model, q)
        mode = 'ai'
      } catch (err) {
        console.error('gemini parse failed, fallback to keyword:', err.message)
      }
    }

    // ---- 쿼리 조건 구성 ----
    const pat = `%${q}%`
    const kw = (parsed?.keywords && parsed.keywords.length ? parsed.keywords : []).slice(0, 5)
    const regionTerm = (parsed?.region || '').trim()

    // items(query)
    let itemQuery = supabase.from('items').select('*, participants:item_participants(user_id)')
    const itemOrs = []
    if (kw.length) itemOrs.push(...kw.map((k) => `name.ilike.%${k}%`))
    if (regionTerm) itemOrs.push(`region.ilike.%${regionTerm}%`)
    if (kw.length || regionTerm) {
      itemQuery = itemQuery.or(itemOrs.join(','))
    } else {
      itemQuery = itemQuery.or(`name.ilike.${pat},region.ilike.${pat}`)
    }
    if (parsed?.category) itemQuery = itemQuery.eq('category', parsed.category)
    if (parsed?.price_max > 0) itemQuery = itemQuery.lte('price', parsed.price_max)

    // rentals(query)
    let rentQuery = supabase.from('rentals').select('*, lender:profiles!rentals_lender_id_fkey(nickname)')
    const rentOrs = []
    if (kw.length) rentOrs.push(...kw.map((k) => `name.ilike.%${k}%`))
    if (kw.length) rentQuery = rentQuery.or(rentOrs.join(','))
    else rentQuery = rentQuery.or(`name.ilike.${pat}`)

    const [itemsRes, rentRes] = await Promise.all([itemQuery.order('created_at', { ascending: false }), rentQuery.order('created_at', { ascending: false })])

    let items = itemsRes.data ?? []
    let rentals = (rentRes.data ?? []).map((r) => ({ ...r, lender_nickname: r.lender?.nickname }))
    if (parsed?.is_rental === true) items = []
    items = sortByDistance(items, userPos)
    rentals = sortByDistance(rentals, userPos)

    return json({ mode, parsed, items, rentals })
  } catch (err) {
    console.error('search-ai error:', err.message)
    return json({ error: err.message }, 500)
  }
})

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
