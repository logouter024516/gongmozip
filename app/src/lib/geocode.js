// lib/geocode.js — 브라우저 좌표 → 상세 주소(역지오코딩)
// OSM Nominatim(무료, 키 불필요, CORS 허용)을 이용해 도로명/동 단위 주소를 얻는다.
// 결과는 "상세 위치" 입력란의 초기값으로 사용하며 사용자가 직접 보완할 수 있다.

export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return ''
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=ko`
    const res = await fetch(url, { headers: { 'Accept-Language': 'ko' } })
    if (!res.ok) return ''
    const j = await res.json()
    const name = j?.display_name ?? ''
    const parts = name.split(',').map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return ''
    return parts.slice(0, 3).join(' ')
  } catch {
    return ''
  }
}