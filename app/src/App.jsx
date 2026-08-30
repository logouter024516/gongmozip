// App.jsx — 라우팅 설정(어떤 주소에서 어떤 화면을 보여줄지)
import { Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import AuthCallback from './pages/AuthCallback'
import OnboardingPage from './pages/OnboardingPage'
import HomePage from './pages/HomePage'
import LandingPage from './pages/LandingPage'
import RentPage from './pages/RentPage'
import SearchPage from './pages/SearchPage'
import SettingsPage from './pages/SettingsPage'
import RecordsPage from './pages/RecordsPage'
import ChatListPage from './pages/ChatListPage'
import ChatThreadPage from './pages/ChatThreadPage'
import NotificationsPage from './pages/NotificationsPage'
import ToastHost from './components/ToastHost'

// '/'(홈) 진입 시 로그인 여부에 따라 랜딩(비로그인) / 홈(로그인)을 보여준다.
function HomeEntry() {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-splash">불러오는 중…</div>
  return user ? <HomePage /> : <LandingPage />
}

export default function App() {
  return (
    // AuthProvider로 전체를 감싸서 모든 화면에서 로그인 상태를 쓸 수 있게 한다
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomeEntry />} />
        <Route path="/rent" element={<RentPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/chat" element={<ChatListPage />} />
        <Route path="/chat/:id" element={<ChatThreadPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        {/* 그 외 경로는 홈으로 */}
        <Route path="*" element={<HomeEntry />} />
      </Routes>
      <ToastHost />
    </AuthProvider>
  )
}
