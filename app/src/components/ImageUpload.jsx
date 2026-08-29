// components/ImageUpload.jsx — 대표 이미지 파일 업로드 필드
// 링크 URL 대신 사용자가 이미지 파일을 직접 업로드해 Supabase Storage(product-images)에 올리고,
// 결과 공개 URL을 onChange로 내보낸다. 미리보기 + 제거 기능 포함.

import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ImagePlus, X, UploadCloud } from 'lucide-react'

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export default function ImageUpload({ value, onChange, label = '대표 이미지', hint }) {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file) {
    if (!file) return
    setError('')
    if (!ACCEPT.includes(file.type)) {
      setError('PNG/JPG/WebP/GIF 이미지만 올릴 수 있어요.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('이미지 크기는 5MB 이하여야 해요.')
      return
    }
    if (!user) return

    setBusy(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (e) {
      setError(e.message || '업로드에 실패했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="img-upload">
      {value ? (
        <div className="img-upload-preview">
          <img src={value} alt="대표 이미지 미리보기" />
          <div className="img-upload-preview-actions">
            <button type="button" className="btn btn-sm btn-outline" onClick={() => inputRef.current?.click()} disabled={busy}>
              바꾸기
            </button>
            <button type="button" className="btn btn-sm btn-outline btn-danger" onClick={() => onChange('')} disabled={busy}>
              <X size={14} strokeWidth={2.4} /> 제거
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="img-upload-trigger" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? (
            <>
              <UploadCloud size={22} strokeWidth={1.8} /> 업로드 중…
            </>
          ) : (
            <>
              <ImagePlus size={22} strokeWidth={1.8} /> {label} 올리기
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(',')}
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f) }}
      />

      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}
