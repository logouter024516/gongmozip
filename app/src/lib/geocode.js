// lib/geocode.js — 브라우저 좌표 → 상세 주소(역지오코딩)
// OSM Nominatim(무료, 키 불필요, CORS 허용)을 이용해 도로명/동 단위 주소를 얻는다.
// 결과는 "상세 위치" 입력란의 초기값으로 사용하며 사용자가 직접 보완할 수 있다.
// 표기: 시/도 + 시/군/구 + 읍/면/동 (예: "경기도 부천시 중동")

export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return ''
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=ko`
    const res = await fetch(url, { headers: { 'Accept-Language': 'ko' } })
    if (!res.ok) return ''
    const j = await res.json()
    return formatAddress(j?.address)
  } catch {
    return ''
  }
}

// Nominatim KR 주소 구조:
//   province(시·도) / city(시·군) / city_district(구) / quarter(동·읍·면)
//   quarter를 동으로 우선 쓰고, 없으면 구 → 읍면 순으로 폴백한다.
function formatAddress(a) {
  if (!a) return ''
  const s = a.province || a.state
  const c = a.city || a.county || a.town
  const d3 = a.quarter || a.suburb || a.village || a.city_district || a.township || a.island
  return [s, c, d3].filter(Boolean).join(' ')
}