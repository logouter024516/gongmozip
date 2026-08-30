// components/Layout.jsx — 앱의 공통 뼈대(위 내비게이션 + 아래 내용 + 상태바)
// 로그인 후 보여지는 모든 화면이 이 레이아웃 안에 표시된다.

import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import { totalUnread, subscribeIncoming } from '../lib/chat'
import { unreadNotifications, subscribeNotifications, NOTIFY_TYPE } from '../lib/notify'
import { toast } from '../lib/toast'
import { useTheme } from '../lib/theme'

export default function Layout({ children }) {
  const { user, profile, signOut } = useAuth() // 로그인 정보와 로그아웃 함수
  const navigate = useNavigate()               // 로그아웃 후 화면 이동
  const location = useLocation()
  const { resolved: theme, cycle } = useTheme()
  const [unread, setUnread] = useState(0)
  const [ncount, setNcount] = useState(0)

  // 쪽지 안읽음 개수: 진입 시 + 실시간 수신 시 갱신
  useEffect(() => {
    let sub = null
    async function refresh() {
      if (!user) { setUnread(0); return }
      setUnread(await totalUnread())
      if (!sub) {
        sub = subscribeIncoming(user.id, () => { totalUnread().then(setUnread) })
      }
    }
    refresh()
    // 실시간 구독이 불안정한 네트워크 백업 폴링
    const poll = setInterval(() => { if (document.visibilityState === 'visible') totalUnread().then(setUnread) }, 15000)
    return () => { if (sub) sub.unsubscribe(); clearInterval(poll) }
  }, [user?.id, location.pathname])

  // 알림 안읽음 개수: 진입 시 + 실시간 도착 시 갱신
  useEffect(() => {
    let sub = null
    async function refresh() {
      if (!user) { setNcount(0); return }
      const c = await unreadNotifications()
      setNcount(c)
      if (!sub) {
        sub = subscribeNotifications(user.id, (n) => {
          setNcount((prev) => prev + 1)
          const label = NOTIFY_TYPE[n?.type] || '알림'
          const title = n?.title || label
          toast(`${label}: ${title}`)
        })
      }
    }
    refresh()
    // 실시간 구독이 불안정한 네트워크 백업 폴링
    const poll = setInterval(() => { if (document.visibilityState === 'visible') unreadNotifications().then(setNcount) }, 20000)
    return () => { if (sub) sub.unsubscribe(); clearInterval(poll) }
  }, [user?.id, location.pathname])

  return (
    <div>
      {/* 상단 고정 내비게이션 */}
      <header className="navbar">
        <div className="container navbar-inner">
          {/* 로고 → 홈으로 */}
          <Link to="/" className="brand">
            <img src="/assets/logo.svg" alt="공모집 로고" className="brand-logo" aria-hidden="true" />
            <span>공모집</span>
          </Link>

          {/* 페이지 링크들 */}
          <nav className="nav-links nav-links-main" aria-label="주요 메뉴">
            <NavLink to="/" end className="nav-link">공동구매</NavLink>
            <NavLink to="/rent" className="nav-link">대여</NavLink>
            <NavLink to="/records" className="nav-link">이용내역</NavLink>
            <NavLink to="/search" className="nav-link">검색</NavLink>
          </nav>

          {/* 오른쪽: 검색/테마/프로필 */}
          <div className="nav-links">
            <NavLink to="/search" className="icon-btn" aria-label="검색 열기" title="검색">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
              </svg>
            </NavLink>

            {/* 쪽지(채팅) — 안읽음 배지 */}
            <NavLink to="/chat" className="icon-btn" aria-label="쪽지" title="쪽지">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              {unread > 0 && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}
            </NavLink>

            {/* 알림 — 안읽음 배지 */}
            <NavLink to="/notifications" className="icon-btn" aria-label="알림" title="알림">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {ncount > 0 && <span className="nav-badge">{ncount > 99 ? '99+' : ncount}</span>}
            </NavLink>

            {/* 테마 토글 버튼: 라이트 → 다크 → 시스템 순환 */}
            <button type="button" className="icon-btn" onClick={cycle} aria-label="테마 전환" title={`현재 ${theme === 'light' ? '라이트' : '다크'} 모드 · 탭하면 순환`}>
              {theme === 'light' ? (
                // 달 아이콘(라이트 → 다크)
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              ) : (
                // 해 아이콘(다크 → 라이트)
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>

            {/* 설정 링크(닉네임 아이콘 역할) */}
            <NavLink to="/settings" className="icon-btn" aria-label="사용자 설정" title="사용자 설정">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
                <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </NavLink>

            {/* 로그아웃 분리된 경우에만 보임 */}
            {user && (
              <button type="button" className="btn btn-outline btn-sm" onClick={async () => { await signOut(); navigate('/login') }}>
                로그아웃
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 각 페이지 내용 */}
      <main>{children}</main>

      {/* 아래 상태바(간단한 푸터) */}
      <footer style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)', color: 'var(--color-fg-muted)', fontSize: 'var(--text-sm)' }}>
        {profile ? `${profile.nickname}님, 공모집에서 똑똑하게 공동구매하세요` : '공모집 — 소규모 가구의 자원 낭비를 줄이는 매칭 서비스'}
      </footer>

      {/* 모바일 하단 탭 내비게이션(당근식) */}
      <nav className="bottom-nav" aria-label="하단 메뉴">
        <NavLink to="/" end className="bottom-tab">
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 11.5 12 4l9 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M5.5 10.5V20h13v-9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <span>공동구매</span>
        </NavLink>
        <NavLink to="/rent" className="bottom-tab">
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 7v12h14V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 11h4M10 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <span>대여</span>
        </NavLink>
        <NavLink to="/records" className="bottom-tab">
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M8 6h13M8 12h13M8 18h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
          </span>
          <span>이용내역</span>
        </NavLink>
        <NavLink to="/chat" className="bottom-tab">
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
            {unread > 0 && <span className="nav-badge nav-badge-tab">{unread > 99 ? '99+' : unread}</span>}
          </span>
          <span>쪽지</span>
        </NavLink>
        <NavLink to="/search" className="bottom-tab">
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <span>검색</span>
        </NavLink>
        <NavLink to="/notifications" className="bottom-tab">
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            {ncount > 0 && <span className="nav-badge nav-badge-tab">{ncount > 99 ? '99+' : ncount}</span>}
          </span>
          <span>알림</span>
        </NavLink>
        <NavLink to="/settings" className="bottom-tab">
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <span>설정</span>
        </NavLink>
      </nav>
    </div>
  )
}
