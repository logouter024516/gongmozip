// components/SearchBar.jsx — 검색창 입력 컴포넌트
// 상위 페이지에서 value/onChange를 전달받아 사용한다(재사용 가능).

export default function SearchBar({ value, onChange, placeholder = '물품명으로 검색…' }) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* 왼쪽 돋보기 아이콘 */}
      <svg
        width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-fg-muted)' }}
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
      </svg>
      {/* 검색 입력: 패딩을 왼쪽 아이콘만큼 띄운다 */}
      <input
        type="search"
        className="search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="물품 검색"
        style={{ paddingLeft: '2.4rem' }}
      />
    </div>
  )
}
