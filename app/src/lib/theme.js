// lib/theme.js — 테마(라이트/다크/시스템) 컨트롤
// 저장값은 'light' | 'dark' | 'system' (기본 system). html data-theme은 실제 표시값만 반영.

import { useEffect, useState } from 'react'

const KEY = 'gmz-theme'

export function getStoredTheme() {
  try { return localStorage.getItem(KEY) || 'system' } catch (e) { return 'system' }
}

// 선호값 → 실제 표시 테마
export function resolveTheme(pref) {
  if (pref === 'system' || !pref) {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' } catch (e) { return 'light' }
  }
  return pref === 'dark' ? 'dark' : 'light'
}

// html 태그에 반영 + 저장 (저장은 선호값 그대로)
export function applyTheme(pref) {
  const resolved = resolveTheme(pref)
  document.documentElement.setAttribute('data-theme', resolved)
  try { localStorage.setItem(KEY, pref) } catch (e) { /* 무시 */ }
  return resolved
}

// 테마 상태 훅: Layout과 설정 페이지가 함께 사용
export function useTheme() {
  const [pref, setPrefRaw] = useState(getStoredTheme)
  const [resolved, setResolved] = useState(() => resolveTheme(getStoredTheme()))

  useEffect(() => {
    applyTheme(pref)
    setResolved(resolveTheme(pref))
    if (pref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => setResolved(mq.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [pref])

  function setPref(p) {
    setPrefRaw(p)
    setResolved(applyTheme(p))
  }

  // 라이트 → 다크 → 시스템 순환 (헤더 토글 버튼용)
  function cycle() {
    const next = pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light'
    setPref(next)
    return next
  }

  return { pref, resolved, setPref, cycle }
}