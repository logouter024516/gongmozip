// crawl-coupang — 쿠팡 상품 링크 → 상품 정보 자동 추출 Edge Function
// 1) 쿠팡 URL인지 검증(link.coupang.com 단축 링크 포함, 리다이렉트 추적)
// 2) 상품 페이지를 가져와 og 태그 / JSON-LD / 인라인 JSON에서 이름·가격·이미지를 추출
// 3) 응답: { ok, name, price, imageUrl, productUrl }
// POST /functions/v1/crawl-coupang  body: { url }
// 참고: 쿠팡이 봇 요청을 차단(403/캡차)하면 ok:false와 안내 메시지를 돌려준다.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isCoupangUrl(url) {
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'coupang.com' || host.endsWith('.coupang.com') || host === 'link.coupang.com'
  } catch {
    return false
  }
}

function cleanTitle(t) {
  if (!t) return ''
  return t
    .replace(/^\s*(쿠팡)\s*/i, '')
    .replace(/\s*-\s*(쿠팡|에센셜판매자)\s*$/i, '')
    .trim()
}

// HTML에서 meta og 태그 / JSON-LD / 인라인 JSON 가격 추출
function parseProduct(html, productUrl) {
  let name = ''
  let imageUrl = ''
  let price = 0

  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)
  const ogTitle2 = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i)
  name = ogTitle?.[1] || ogTitle2?.[1] || ''

  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i)
  const ogImage2 = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i)
  imageUrl = ogImage?.[1] || ogImage2?.[1] || ''

  // JSON-LD Product 스키마 (name / image[0] / offers.price)
  const ld = [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const [, raw] of ld) {
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      const item = parsed?.['@graph']?.find?.((i) => i?.['@type'] === 'Product') || parsed
      if (!name && item?.name) name = String(item.name).trim()
      if (!imageUrl && Array.isArray(item?.image)) imageUrl = item.image[0]
      else if (!imageUrl && typeof item?.image === 'string') imageUrl = item.image
      const offer = Array.isArray(item?.offers) ? item.offers[0] : item?.offers
      if (!price && offer?.price) price = Number(String(offer.price).replace(/[^\d.]/g, '')) || 0
    } catch {
      /* 파싱 실패 무시 */
    }
  }

  // 상품명 fallback: prod-buy-header__title
  if (!name) {
    const h = html.match(/<h2[^>]*class=["'][^"']*prod-buy-header__title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)
    name = h?.[1] ? h[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''
  }

  // 인라인 JSON 가격 fallback: `"price": 12345` 형태
  if (!price) {
    const m = bigIntPrice(html)
    if (m) price = m
  }

  return { name: cleanTitle(name), price, imageUrl: imageUrl || '', productUrl }
}

function bigIntPrice(html) {
  const big = html.match(/"price"\s*:\s*(\d{3,})/)
  if (!big) return 0
  const candidates = [...html.matchAll(/"price"\s*:\s*(\d+)/g)].map((m) => Number(m[1]))
  // 가장 흔한 값(중앙값 비슷) 대신 '판매가/총액' 후보 중 min(0 제외)을 취한다
  const vals = candidates.filter((v) => v >= 1000)
  if (!vals.length) return 0
  return Math.min(...vals)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST 만 지원해요.' }, 405)

  let url = ''
  try {
    const body = await req.json()
    url = String(body?.url || '').trim()
  } catch {
    return jsonResponse({ ok: false, error: 'url이 필요해요.' }, 400)
  }

  if (!isCoupangUrl(url)) {
    return jsonResponse({ ok: false, error: '쿠팡 상품 링크만 지원해요.' }, 400)
  }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!res.ok || res.status >= 400) {
      if (res.status === 403) {
        return jsonResponse({ ok: false, error: '쿠팡이 자동 요청을 차단했어요. 잠시 후 다시 시도하거나 직접 입력해주세요.' })
      }
      return jsonResponse({ ok: false, error: `쿠팡 응답 오류(HTTP ${res.status})` })
    }

    const html = await res.text()
    const finalUrl = res.url || url
    const info = parseProduct(html, finalUrl)

    if (!info.name) {
      return jsonResponse({ ok: false, error: '상품 정보를 찾지 못했어요. 직접 입력해주세요.' })
    }
    return jsonResponse({ ok: true, ...info })
  } catch (err) {
    return jsonResponse({ ok: false, error: `크롤링 실패: ${err?.message ?? '알 수 없는 오류'}` })
  }
})