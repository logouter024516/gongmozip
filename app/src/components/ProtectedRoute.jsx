// components/ProtectedRoute.jsx — 로그인이 필요한 화면을 보호하는 래퍼
// 로그인 안 된 상태로 접근하면 로그인 페이지로 보낸다.

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  // 아직 로그인 상태를 확인 중이면 빈 화면(로딩)을 보여준다
  if (loading) return <div style={{ padding: 'var(--space-16)', textAlign: 'center' }}>불러오는 중…</div>

  // 로그인 안 됐으면 로그인 페이지로 리다이렉트
  if (!user) return <Navigate to="/login" replace />

  // 로그인 됐으면 원래 화면 렌더링
  return children
}
