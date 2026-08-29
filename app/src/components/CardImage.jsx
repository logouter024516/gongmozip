// components/CardImage.jsx — 카드 상단의 대표 이미지/그라데이션 헤더
// image_url 이 있으면 사진, 없으면 물품명별 그라데이션 + 아이콘을 보여준다(당근/카루셀식).

import { Package } from 'lucide-react'

const PALETTES = [
  ['#060C7F', '#2A3BB8'],
  ['#0FA958', '#0AF587'],
  ['#E0224F', '#FF8A9B'],
  ['#4F46E5', '#8B94FF'],
  ['#B45309', '#F59E0B'],
  ['#0E7490', '#22D3EE'],
]

export default function CardImage({ src, label = '물품', seed = 0, ratio = '16 / 10' }) {
  // label 문자열로 팔레트 인덱스 결정(항상 같은 색이 나오도록)
  const idx = (String(seed).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTES.length
  const [from, to] = PALETTES[idx]

  if (src) {
    return (
      <div className="card-img" style={{ aspectRatio: ratio }}>
        <img src={src} alt={label} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
      </div>
    )
  }

  return (
    <div
      className="card-img card-img-fallback"
      style={{ aspectRatio: ratio, background: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-hidden="true"
    >
      <Package size={34} strokeWidth={1.8} color="#fff" />
    </div>
  )
}
