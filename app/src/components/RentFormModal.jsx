// components/RentFormModal.jsx — 대여 요청 등록/수정 공용 마법사(토스식)
// 등록(initial 없음)과 수정(initial 있음)이 같은 흐름. 공동구매 모달(ItemFormModal)과 동일한 UI.
// 한 화면에 질문 하나: 카테고리 → 이름·사진 → 빌리는 조건 → 필요한 기간 → 만나는 위치 → 확인.

import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import ImageUpload from './ImageUpload'
import { ChevronLeft, Wrench, Tv, Tent, Shapes, MapPin, Pencil, Locate } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { getBrowserPosition, regionCoords } from '../lib/location'
import { findProfanity } from '../lib/profanity'
import { reverseGeocode } from '../lib/geocode'

const CATEGORIES = ['공구·도구', '가전·생활', '여행·캠핑', '기타']
const CAT_ICONS = { '공구·도구': Wrench, '가전·생활': Tv, '여행·캠핑': Tent, '기타': Shapes }

// 마법사 단계 제목
const WIZ_STEPS = [
  '뭐가 필요할까요?',
  '물건 이름과 사진',
  '빌리는 조건',
  '필요한 기간 (선택)',
  '어디서 만날까요?',
  '마지막 확인',
]

function fmtDate(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

export default function RentFormModal({ open, initial, user, profile, onClose, onSaved }) {
  const [step, setStep] = useState(0)
  const [category, setCategory] = useState(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [pricePerDay, setPricePerDay] = useState('')
  const [deposit, setDeposit] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [address, setAddress] = useState('')
  const [manualAddr, setManualAddr] = useState(false)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [coords, setCoords] = useState(null)
  const addressRef = useRef('')

  // 모달이 열릴 때마다 등록(빈 폼) 또는 수정(기존 값 채움)으로 초기화
  useEffect(() => {
    if (!open) return
    setStep(0)
    setError('')
    setCategory(initial?.category || null)
    setName(initial?.name ?? '')
    setDesc(initial?.description ?? '')
    setPricePerDay(String(initial?.price_per_day ?? ''))
    setDeposit(String(initial?.deposit ?? ''))
    setImageUrl(initial?.image_url ?? '')
    setStartsOn(initial?.starts_on ?? '')
    setEndsOn(initial?.ends_on ?? '')
    setAddress(initial?.address ?? '')
    addressRef.current = initial?.address ?? ''
    setManualAddr(false)
    setLocating(false)
    setCoords(null)
  }, [open, initial])

  // 등록일 때만 브라우저 위치 → 자동 주소 (수정 시 기존 주소 유지)
  useEffect(() => {
    if (!open || initial) return
    let mounted = true
    getBrowserPosition().then((p) => {
      if (!mounted || !p) return
      setCoords(p)
      reverseGeocode(p.lat, p.lng).then((addr) => {
        if (mounted && addr && !addressRef.current) { setAddress(addr); addressRef.current = addr }
      })
    }).catch(() => {})
    return () => { mounted = false }
  }, [open, initial])

  async function relocate() {
    setLocating(true)
    setError('')
    try {
      const p = await getBrowserPosition()
      if (!p) throw new Error('no-pos')
      setCoords(p)
      const addr = await reverseGeocode(p.lat, p.lng)
      if (addr) { setAddress(addr); addressRef.current = addr; setManualAddr(false) }
      else { setManualAddr(true) }
    } catch (e) {
      setError('위치를 찾지 못했어요. 직접 입력해주세요.')
      setManualAddr(true)
    }
    setLocating(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!user) { setError('로그인 정보를 확인할 수 없어요. 다시 로그인해주세요.'); return }
    if (!name.trim()) return
    const bad = findProfanity(name) || findProfanity(desc) || findProfanity(address)
    if (bad) { setError(`'${bad}'는 사용하기 어려운 표현이에요. 다른 문구로 바꿔주세요.`); return }
    if (startsOn && endsOn && new Date(endsOn) < new Date(startsOn)) {
      setError('종료일이 시작일보다 이전이에요.')
      return
    }
    setBusy(true)
    setError('')
    let lat = initial?.latitude ?? profile?.latitude ?? null
    let lng = initial?.longitude ?? profile?.longitude ?? null
    if (coords) { lat = coords.lat; lng = coords.lng }
    else if (lat == null || lng == null) {
      const c = regionCoords(profile?.location)
      if (c) { lat = c.lat; lng = c.lng }
    }
    const payload = {
      name: name.trim(),
      description: desc.trim(),
      price_per_day: Number(pricePerDay) || 0,
      deposit: Number(deposit) || 0,
      category: category || '기타',
      image_url: imageUrl.trim(),
      address: address.trim(),
      latitude: lat,
      longitude: lng,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
    }
    if (initial?.id) {
      const { error: err } = await supabase.from('rentals').update(payload).eq('id', initial.id).eq('requester_id', user.id)
      setBusy(false)
      if (err) { setError(err.message); return }
      toast('수정했어요!')
      if (onSaved) onSaved()
      return
    }
    const { error: err } = await supabase.from('rentals').insert({ ...payload, requester_id: user.id, status: 'open' })
    setBusy(false)
    if (err) { setError(err.message); return }
    toast('빌리고 싶은 물건을 올렸어요!')
    if (onSaved) onSaved()
  }

  const priceLabel = Number(pricePerDay) > 0 ? `${Number(pricePerDay).toLocaleString()}원/일` : '무료'
  const depositLabel = Number(deposit) > 0 ? `${Number(deposit).toLocaleString()}원` : '없음'
  const s = fmtDate(startsOn)
  const e = fmtDate(endsOn)
  const periodLabel = s && e ? `${s} ~ ${e}` : s ? `${s}부터` : e ? `${e}까지` : '기간 없음'

  return (
    <Modal open={open} title={WIZ_STEPS[step]} onClose={onClose}>
      <div className="wiz-wrap">
        <div className="wiz-head">
          <button type="button" className="wiz-back" onClick={() => setStep((st) => Math.max(0, st - 1))} aria-label="이전" disabled={step === 0}>
            <ChevronLeft size={20} strokeWidth={2.4} />
          </button>
          <div className="wiz-seg" aria-hidden="true">
            {WIZ_STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}
          </div>
        </div>

        {step === 0 && (
          <div className="step-tiles">
            {CATEGORIES.map((c) => {
              const Icon = CAT_ICONS[c] || Shapes
              return (
                <button key={c} type="button" className={`step-tile${category === c ? ' sel' : ''}`} onClick={() => { setCategory(c); setStep(1) }}>
                  <Icon size={22} strokeWidth={1.8} />
                  <strong>{c}</strong>
                </button>
              )
            })}
          </div>
        )}

        {step === 1 && (
          <>
            <div className="field">
              <label htmlFor="rname">필요한 물건 이름</label>
              <input id="rname" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="예: 전동 드릴" />
            </div>
            <div className="field">
              <ImageUpload value={imageUrl} onChange={setImageUrl} label="대표 사진" hint="찾고 있는 물건 사진을 올리면 더 잘 매칭돼요. (선택)" />
            </div>
            <button type="button" className="btn btn-block" onClick={() => setStep(2)} disabled={!name.trim()}>
              다음
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="wiz-panel">
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="rprice">하루 이용료(원)</label>
                  <input id="rprice" type="number" min="0" inputMode="numeric" value={pricePerDay} onChange={(e) => setPricePerDay(e.target.value)} placeholder="예: 5000" />
                </div>
                <div className="field">
                  <label htmlFor="rdep">보증금(원)</label>
                  <input id="rdep" type="number" min="0" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="예: 10000" />
                </div>
              </div>
              <p className="field-hint">금액은 참고용이에요. 비워두면 무료로 빌리는 요청이고, 실제 조건은 채팅에서 정할 수 있어요.</p>
            </div>
            <button type="button" className="btn btn-block" onClick={() => setStep(3)}>
              다음
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <div className="wiz-panel">
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="rstart">필요한 시작일(선택)</label>
                  <input id="rstart" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="rend">반납 예정일(선택)</label>
                  <input id="rend" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
                </div>
              </div>
              <p className="field-hint">기간 없이 올려도 돼요. 매칭 후 채팅에서 정확한 날짜를 맞춰요.</p>
            </div>
            <button type="button" className="btn btn-block" onClick={() => setStep(4)}>
              다음
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <div className="field">
              <label htmlFor="raddr">만나는 위치(선택)</label>
              {manualAddr ? (
                <input id="raddr" value={address} onChange={(e) => { setAddress(e.target.value); addressRef.current = e.target.value }} placeholder="예: 상암동 월드컵공원 정문 앞 / 아파트 동·호수" />
              ) : (
                <div className="l-addr-card">
                  <p className="l-addr-main"><MapPin size={15} strokeWidth={2} /> {address || '위치 확인 중…'}</p>
                  <p className="field-hint">브라우저 위치를 이용해 자동 입력했어요.</p>
                </div>
              )}
              <div className="wiz-inline-actions">
                {manualAddr ? (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setManualAddr(false)}>자동 위치로 되돌리기</button>
                ) : (
                  <>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setManualAddr(true)}><Pencil size={14} strokeWidth={2.2} /> 직접 입력</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={relocate} disabled={locating}>
                      <Locate size={14} strokeWidth={2.2} /> {locating ? '찾는 중…' : '다시 감지'}
                    </button>
                  </>
                )}
              </div>
            </div>
            <button type="button" className="btn btn-block" onClick={() => setStep(5)}>
              다음
            </button>
          </>
        )}

        {step === 5 && (
          <>
            <div className="field">
              <label htmlFor="rdesc">설명(언제·얼마나 필요한지, 찾아갈 수 있는 곳 등)</label>
              <textarea id="rdesc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="예: 주말 2일 동안 쓰려고요. 상암동 아파트로 직접 찾아가도 돼요." />
            </div>
            <div className="summary-card">
              <div className="summary-row"><span>카테고리</span><strong>{category || '기타'}</strong></div>
              <div className="summary-row"><span>물건</span><strong>{name}</strong></div>
              <div className="summary-row"><span>이용료</span><strong>{priceLabel}</strong></div>
              <div className="summary-row"><span>보증금</span><strong>{depositLabel}</strong></div>
              <div className="summary-row"><span>기간</span><strong>{periodLabel}</strong></div>
              <div className="summary-row"><span>위치</span><strong>{address || '미정'}</strong></div>
            </div>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <button type="submit" className="btn btn-secondary btn-block" onClick={handleSubmit} disabled={busy}>
              {busy ? '저장 중…' : initial?.id ? '수정하기' : '빌리고 싶어요 올리기'}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}