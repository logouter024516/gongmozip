// lib/location.js — 위치/거리 유틸 (공동구매·대여의 '가까운 순' 정렬용)
// 실용 기준점은 한국 주요 시/도 + 도서산간 지역의 좌표. region이 여기 없으면 null.
// 거리 = haversine(지구 곡률 근사), 단위 km.

// 주요 지역 좌표 (위도, 경도). 도서산간 함께배송/시군 단위 위주로 정리.
export const REGION_COORDS = {
  // 도서 / 제주
  '제주': { lat: 33.4996, lng: 126.5312 },
  '제주시': { lat: 33.4996, lng: 126.5312 },
  '서귀포시': { lat: 33.2543, lng: 126.5602 },
  '울릉도': { lat: 37.4878, lng: 130.9028 },
  '독도': { lat: 37.2386, lng: 131.8639 },
  '흑산도': { lat: 34.6725, lng: 125.4231 },
  '백령도': { lat: 37.9742, lng: 124.6378 },
  // 강원 (도서산간)
  '강원': { lat: 37.8786, lng: 128.6413 },
  '춘천시': { lat: 37.8813, lng: 127.7298 },
  '속초시': { lat: 38.2070, lng: 128.5918 },
  '양양군': { lat: 38.0759, lng: 128.6190 },
  '인제군': { lat: 38.0701, lng: 128.1703 },
  '양구군': { lat: 38.1098, lng: 127.9903 },
  '화천군': { lat: 38.1061, lng: 127.7085 },
  '평창군': { lat: 37.3707, lng: 128.3898 },
  '정선군': { lat: 37.3808, lng: 128.6614 },
  // 서울·경기권
  '서울': { lat: 37.5665, lng: 126.9780 },
  '경기': { lat: 37.2750, lng: 127.0085 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '수원시': { lat: 37.2636, lng: 127.0286 },
  '용인시': { lat: 37.2411, lng: 127.1777 },
  '고양시': { lat: 37.6584, lng: 126.8320 },
  '가평군': { lat: 37.8316, lng: 127.5101 },
  // 충청
  '충북': { lat: 36.7602, lng: 127.7905 },
  '충남': { lat: 36.6546, lng: 126.6672 },
  '청주시': { lat: 36.6424, lng: 127.4890 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '천안시': { lat: 36.8151, lng: 127.1139 },
  '단양군': { lat: 36.9843, lng: 128.3654 },
  // 전라
  '전북': { lat: 35.7151, lng: 127.0681 },
  '전남': { lat: 34.7514, lng: 126.8769 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '전주시': { lat: 35.8242, lng: 127.1480 },
  '군산시': { lat: 35.9676, lng: 126.7366 },
  // 경상
  '경북': { lat: 36.4919, lng: 128.8889 },
  '경남': { lat: 35.4606, lng: 128.2132 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '울산': { lat: 35.5384, lng: 129.3114 },
  '포항시': { lat: 36.0190, lng: 129.3435 },
  '안동시': { lat: 36.5684, lng: 128.7293 },
  '울진군': { lat: 36.9934, lng: 129.3858 },
  '영양군': { lat: 36.6666, lng: 129.1127 },
  '봉화군': { lat: 36.8930, lng: 128.7334 },
  '창원시': { lat: 35.2279, lng: 128.6811 },
}

// region 텍스트에서 좌표 찾기: 정확 일치 → 부분 포함 → null
export function regionCoords(region) {
  if (!region) return null
  const r = String(region).trim()
  if (REGION_COORDS[r]) return REGION_COORDS[r]
  for (const key of Object.keys(REGION_COORDS)) {
    if (r.includes(key)) return REGION_COORDS[key]
  }
  return null
}

// 두 좌표 사이 거리(km) — haversine
export function haversine(a, b) {
  if (!a || !b) return null
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// 거리 km 표기(소수 1자리, 1km 미만은 '1km 미만')
export function fmtKm(km) {
  if (km == null) return null
  if (km < 1) return '1km 미만'
  return `${km.toFixed(1)}km`
}

// 목록을 사용자 위치에서 가까운 순으로 정렬.
// 각 항목에 region 문자열이 있어야 하며, 거리 계산 가능한 항목을 우선 정렬(좌표 없는 항목은 뒤로).
// 반환: 같은 배열을 새로 만들어 정렬, 각 항목에 _distKm(거리km) / _regionCoord 부착.
export function sortByDistance(list, userPos) {
  if (!userPos || !Array.isArray(list)) return list
  const withKm = list.map((x) => {
    const coord = regionCoords(x.region)
    let km = null
    if (coord) {
      km = haversine(userPos, coord)
    }
    return { ...x, _distKm: km, _coord: coord }
  })
  withKm.sort((a, b) => {
    const ak = a._distKm == null ? Infinity : a._distKm
    const bk = b._distKm == null ? Infinity : b._distKm
    return ak - bk
  })
  return withKm
}

// 좌표(lat/lng)에서 가장 가까운 지역 라벨 찾기 (브라우저 위치 → 동네 텍스트).
// REGION_COORDS 목록을 haversine으로 비교해 최소 거리 키를 돌려준다. 없으면 null.
export function nearestRegion(lat, lng) {
  if (lat == null || lng == null) return null
  let best = null
  let bestKm = Infinity
  for (const key of Object.keys(REGION_COORDS)) {
    const km = haversine({ lat, lng }, REGION_COORDS[key])
    if (km < bestKm) { bestKm = km; best = key }
  }
  return best
}

// 프로필에서 동네(지역) 라벨 파싱: 브라우저 좌표 우선 → 텍스트 폴백.
// 가입/등록 시 "지정된 값이 아닌 브라우저 위치 기준"으로 쓰기 위한 헬퍼.
export function userRegion(profile) {
  if (!profile) return ''
  const fromCoord = nearestRegion(profile.latitude, profile.longitude)
  if (fromCoord) return fromCoord
  return (profile.location || '').trim()
}

// 브라우저 위치정보(geolocation)를 Promise로 감싼 헬퍼.
// 성공: { lat, lng } / 실패: Error(권한 거부·타임아웃 등).
export function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('이 브라우저는 위치정보를 지원하지 않아요.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err && err.message ? err.message : '위치를 가져오지 못했어요. 잠시 후 다시 시도해주세요.')),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    )
  })
}
