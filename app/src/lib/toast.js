// lib/toast.js — 전역 토스트 알림(인디고/네이비 알약 스타일)
// toast('참여했어요') 처럼 호출하면 화면 상단 중앙에 잠깐 떴다 사라진다.
// App.jsx 에서 <ToastHost /> 를 한 번만 렌더한다.

let setList = null

export function mountToast(dispatch) {
  setList = dispatch
}

export function toast(message, opts = {}) {
  const id = Date.now() + Math.random().toString(36).slice(2, 6)
  if (setList) {
    setList((l) => [...l, { id, message, type: opts.type || 'info' }])
    setTimeout(() => {
      setList((l) => l.filter((t) => t.id !== id))
    }, 2400)
  }
}
