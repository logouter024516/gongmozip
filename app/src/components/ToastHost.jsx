// components/ToastHost.jsx — 토스트 알림을 렌더하는 토글 컨테이너
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { mountToast } from '../lib/toast'

export default function ToastHost() {
  const [list, setList] = useState([])
  useEffect(() => {
    mountToast(setList)
    return () => mountToast(null)
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast${t.type === 'error' ? ' toast-error' : ''}`}>
          {t.message}
        </div>
      ))}
    </div>,
    document.body
  )
}
