// components/Modal.jsx — 하단 시트(bottom sheet) 모달
// 당근마켓/숨고 스타일: 어두운 배경 오버레이 + 위로 올라오는 흰 패널.
// 모바일은 화면 하단 전체, 데스크톱은 가운데 카드로 표시한다.
// ESC/배경 클릭으로 닫힌다. 접근성(role=dialog + aria-modal)을 갖춘다.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ open, title, onClose, children }) {
  // 열릴 때: 바디 스크롤 잠금 + ESC 닫기
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-handle" aria-hidden="true" />
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}
