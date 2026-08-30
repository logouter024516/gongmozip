// pages/HomePage.jsx — 공동구매 페이지(메인)
// 히어로 배너 + 카테고리 필터 + 공동구매 카드 그리드 + 새 공동구매 등록(당근식 모달).
// 등록 폼은 토스식 마법사: 한 화면에 질문 하나, 큰 선택지, 필요한 입력만 받는다.

import { useEffect, useMemo, useRef, useState } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import Layout from '../components/Layout'
import ItemCard from '../components/ItemCard'
import Modal from '../components/Modal'
import { Plus, ChevronLeft, Apple, Package, BookOpen, Shapes, Wallet, Split, Clock, Minus, MapPin, Pencil, Locate, Users, CalendarDays, Infinity } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../lib/toast'
import ImageUpload from '../components/ImageUpload'
import { getBrowserPosition, regionCoords, userRegion } from '../lib/location'
import { findProfanity } from '../lib/profanity'
import { reverseGeocode } from '../lib/geocode'

const CATEGORIES = ['식품·신선', '생활용품', '도서·산간', '기타']

// 'YYYY-MM-DDTHH:mm' (datetime-local) → 표시 문자열
function fmtDeadline(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 마법사 단계 제목
const WIZ_STEPS = [
  '어떤 물건을 살까요?',
  '물건 이름과 사진',
  '가격을 어떻게 정할까요?',
  '모집을 언제까지 할까요?',
  '모이는 위치',
  '마지막 확인',
]

const CAT_ICONS = { '식품·신선': Apple, '생활용품': Package, '도서·산간': BookOpen, '기타': Shapes }

const PRICE_MODES = [
  { id: 'total', icon: Wallet, label: '총 금액으로', desc: '정가 전체를 한 번에 모아요' },
  { id: 'per', icon: Split, label: '1인당 금액으로', desc: '나누는 금액 기준으로 정해요' },
  { id: 'later', icon: Clock, label: '나중에 정할게요', desc: '참여자와 채팅에서 함께 정해요' },
]

function CreateItemForm({ user, profile, onCreated }) {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)
  const [category, setCategory] = useState(null)
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [priceMode, setPriceMode] = useState('total')
  const [totalPrice, setTotalPrice] = useState('')
  const [shipping, setShipping] = useState('')
  const [perHead, setPerHead] = useState('')
  const [shipPerHead, setShipPerHead] = useState('')
  const [qty, setQty] = useState(1)
  const [target, setTarget] = useState(4)
  const [closeMode, setCloseMode] = useState('head')
  const [closeAt, setCloseAt] = useState('')
  const [permanent, setPermanent] = useState(false)
  const [address, setAddress] = useState('')
  const [manualAddr, setManualAddr] = useState(false)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [coords, setCoords] = useState(null)
  const addressRef = useRef('')

  // 가격 계산 정리 (총액/배송비/최소수량)
  const calcs = useMemo(() => {
    if (priceMode === 'total') {
      const price = Number(totalPrice) || 0
      const ship = Number(shipping) || 0
      return { price, shippingCost: ship, minQty: 1, perHeadShow: price > 0 ? price : 0 }
    }
    if (priceMode === 'per') {
      const q = Number(qty) || 1
      const head = Number(perHead) || 0
      const ship = Number(shipPerHead) || 0
      return { price: head * q, shippingCost: ship * q, minQty: q, perHeadShow: head }
    }
    return { price: 0, shippingCost: 0, minQty: 1, perHeadShow: 0 }
  }, [priceMode, totalPrice, shipping, perHead, shipPerHead, qty])

  // 모달을 열 때마다 브라우저 위치 → 자동 주소 (수동 입력한 값은 유지)
  useEffect(() => {
    if (!show) return
    let mounted = true
    getBrowserPosition().then((p) => {
      if (!mounted || !p) return
      setCoords(p)
      if (!addressRef.current) {
        reverseGeocode(p.lat, p.lng).then((addr) => {
          if (mounted && addr && !addressRef.current) setAddress(addr)
        })
      }
    }).catch(() => {})
    return () => { mounted = false }
  }, [show])

  function resetForm() {
    setStep(0)
    setCategory(null)
    setName('')
    setImageUrl('')
    setPriceMode('total')
    setTotalPrice('')
    setShipping('')
    setPerHead('')
    setShipPerHead('')
    setQty(1)
    setTarget(4)
    setCloseMode('head')
    setCloseAt('')
    setPermanent(false)
    setAddress('')
    addressRef.current = ''
    setManualAddr(false)
    setError('')
  }

  function close() {
    setShow(false)
    resetForm()
  }

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
    if (!name.trim()) return
    const bad = findProfanity(name) || findProfanity(address)
    if (bad) { setError(`'${bad}'는 사용하기 어려운 표현이에요. 다른 문구로 바꿔주세요.`); return }
    setBusy(true)
    setError('')
    const region = userRegion(profile)
    let lat = profile?.latitude ?? null
    let lng = profile?.longitude ?? null
    if (coords) { lat = coords.lat; lng = coords.lng }
    else if (lat == null || lng == null) {
      const c = regionCoords(region)
      if (c) { lat = c.lat; lng = c.lng }
    }
    const { error: err } = await supabase
      .from('items')
      .insert({
        name,
        price: calcs.price,
        shipping_cost: calcs.shippingCost,
        region: region || '',
        latitude: lat,
        longitude: lng,
        min_qty: calcs.minQty,
        target_count: closeMode === 'head' ? (Number(target) || 4) : 0,
        close_at: closeMode === 'deadline' && !permanent && closeAt ? new Date(closeAt).toISOString() : null,
        category: category || '기타',
        image_url: imageUrl.trim(),
        address: address.trim(),
        created_by: user.id,
        status: 'open',
      })
    setBusy(false)
    if (err) { setError(err.message); return }
    resetForm()
    setShow(false)
    toast('공동구매를 등록했어요!')
    if (onCreated) onCreated()
  }

  const priceLabel = calcs.price > 0 ? `${calcs.price.toLocaleString()}원` : '나중에 정해요'
  const shipLabel = priceMode === 'later' ? '나중에 정해요' : calcs.shippingCost > 0 ? `${calcs.shippingCost.toLocaleString()}원` : '없음'
  const closeLabel = closeMode === 'deadline'
    ? (permanent || !closeAt ? '영구(무기한)' : `모집 ${fmtDeadline(closeAt)}까지`)
    : `인원 ${target}명`

  return (
    <>
      <button type="button" className="btn l-btn-mobile-hide" onClick={() => setShow(true)}>
        <Plus size={18} strokeWidth={2.4} /> 새 공동구매
      </button>
      <button type="button" className="fab" onClick={() => setShow(true)} aria-label="새 공동구매">
        <Plus size={24} strokeWidth={2.4} />
      </button>

      <Modal open={show} title={WIZ_STEPS[step]} onClose={close}>
        {/* 진행 바 + 뒤로 */}
        <div className="wiz-wrap">
          <div className="wiz-head">
            <button type="button" className="wiz-back" onClick={() => setStep((s) => Math.max(0, s - 1))} aria-label="이전" disabled={step === 0}>
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
                <label htmlFor="iname">물건 이름</label>
                <input id="iname" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="예: 제주 감귤 5kg" />
              </div>
              <div className="field">
                <ImageUpload value={imageUrl} onChange={setImageUrl} label="대표 사진" hint="사진이 있으면 참여율이 올라가요. (선택)" />
              </div>
              <button type="button" className="btn btn-block" onClick={() => setStep(2)} disabled={!name.trim()}>
                다음
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="step-tiles">
                {PRICE_MODES.map((m) => {
                  const Icon = m.icon
                  return (
                    <button key={m.id} type="button" className={`step-tile${priceMode === m.id ? ' sel' : ''}`} onClick={() => setPriceMode(m.id)}>
                      <Icon size={18} strokeWidth={1.8} />
                      <strong>{m.label}</strong>
                      <span>{m.desc}</span>
                    </button>
                  )
                })}
              </div>

              {priceMode === 'total' && (
                <div className="wiz-panel">
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="itotal">총 금액(원)</label>
                      <input id="itotal" type="number" min="0" inputMode="numeric" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} placeholder="예: 30000" />
                    </div>
                    <div className="field">
                      <label htmlFor="iship">배송비(선택, 원)</label>
                      <input id="iship" type="number" min="0" inputMode="numeric" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="예: 2500" />
                    </div>
                  </div>
                </div>
              )}

              {priceMode === 'per' && (
                <div className="wiz-panel">
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="ihead">1인당 금액(원)</label>
                      <input id="ihead" type="number" min="0" inputMode="numeric" value={perHead} onChange={(e) => setPerHead(e.target.value)} placeholder="예: 10000" />
                    </div>
                    <div className="field">
                      <label htmlFor="ishead">인당 배송비(선택, 원)</label>
                      <input id="ishead" type="number" min="0" inputMode="numeric" value={shipPerHead} onChange={(e) => setShipPerHead(e.target.value)} placeholder="예: 800" />
                    </div>
                  </div>
                  <div className="field">
                    <label>한 번에 몇 개를 살까요?</label>
                    <div className="stepper">
                      <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="수량 줄이기"><Minus size={18} strokeWidth={2.4} /></button>
                      <b>{qty}개</b>
                      <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="수량 늘리기"><Plus size={18} strokeWidth={2.4} /></button>
                    </div>
                  </div>
                </div>
              )}

              {priceMode === 'later' && (
                <p className="field-hint wiz-panel">금액 없이 먼저 모집하고, 참여자와 채팅에서 함께 정할 수 있어요.</p>
              )}

              <button type="button" className="btn btn-block" onClick={() => setStep(3)}>
                다음
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="step-tiles">
                <button type="button" className={`step-tile${closeMode === 'head' ? ' sel' : ''}`} onClick={() => setCloseMode('head')}>
                  <Users size={20} strokeWidth={1.8} />
                  <strong>인원이 차면</strong>
                  <span>원하는 인원이 모이면 바로 시작해요</span>
                </button>
                <button type="button" className={`step-tile${closeMode === 'deadline' ? ' sel' : ''}`} onClick={() => setCloseMode('deadline')}>
                  <CalendarDays size={20} strokeWidth={1.8} />
                  <strong>기간까지</strong>
                  <span>정한 시각까지 모집해요 (영구도 가능)</span>
                </button>
              </div>

              {closeMode === 'head' && (
                <div className="wiz-panel">
                  <div className="stepper stepper-lg">
                    <button type="button" onClick={() => setTarget((t) => Math.max(2, t - 1))} aria-label="인원 줄이기"><Minus size={20} strokeWidth={2.4} /></button>
                    <b className="stepper-num">{target}명</b>
                    <button type="button" onClick={() => setTarget((t) => Math.min(99, t + 1))} aria-label="인원 늘리기"><Plus size={20} strokeWidth={2.4} /></button>
                  </div>
                  <p className="field-hint wiz-center-hint">이만큼 모이면 함께배송을 시작해요. 목표를 바꾸려면 뒤로 가세요.</p>
                </div>
              )}

              {closeMode === 'deadline' && (
                <div className="wiz-panel">
                  {permanent ? (
                    <div className="l-addr-card">
                      <p className="l-addr-main"><Infinity size={15} strokeWidth={2} /> 영구(무기한) 모집</p>
                      <p className="field-hint">마감 시각 없이 계속 모집하고, 원할 때 직접 마감해요.</p>
                    </div>
                  ) : (
                    <div className="field">
                      <label htmlFor="iclose">모집 마감 시각</label>
                      <input id="iclose" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
                      <p className="field-hint">이 시각이 지나면 자동으로 모집이 마감돼요.</p>
                    </div>
                  )}
                  <div className="wiz-inline-actions">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setPermanent(!permanent)}>
                      {permanent ? '마감 시각으로 정하기' : '영구(무기한) 모집하기'}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="btn btn-block"
                onClick={() => setStep(4)}
                disabled={closeMode === 'deadline' && !permanent && !closeAt}
              >
                다음
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <div className="field">
                <label>배송 지역</label>
                <input value={userRegion(profile) || ''} readOnly />
                <p className="field-hint">프로필 설정에 적은 지역이에요. 바꾸려면 설정에서 수정하세요.</p>
              </div>
              <div className="field">
                <label htmlFor="iaddr">모이는 위치</label>
                {manualAddr ? (
                  <input id="iaddr" value={address} onChange={(e) => { setAddress(e.target.value); addressRef.current = e.target.value }} placeholder="예: 제주시 연동 330, 아파트 동·호수" />
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
              <div className="summary-card">
                <div className="summary-row"><span>카테고리</span><strong>{category || '기타'}</strong></div>
                <div className="summary-row"><span>물건</span><strong>{name}</strong></div>
                <div className="summary-row"><span>금액</span><strong>{priceLabel}</strong></div>
                <div className="summary-row"><span>배송비</span><strong>{shipLabel}</strong></div>
                <div className="summary-row"><span>모집</span><strong>{closeLabel}</strong></div>
                <div className="summary-row"><span>위치</span><strong>{address || userRegion(profile) || '미지정'}</strong></div>
              </div>
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              <button type="submit" className="btn btn-block" onClick={handleSubmit} disabled={busy}>
                {busy ? '등록 중…' : '등록하기'}
              </button>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}

function HomeBody() {
  const { user, profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('전체')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('items')
      .select('*, participants:item_participants(user_id)')
      .order('created_at', { ascending: false })
    if (error) { setLoading(false); return }
    const items = data ?? []
    // 집결 명단(닉네임/도착) 병합
    const itemIds = items.map((i) => i.id).filter(Boolean)
    const { data: roster } = await supabase
      .from('item_participant_list')
      .select('*')
      .in('item_id', itemIds.length ? itemIds : ['00000000-0000-0000-0000-000000000000'])
    const byItem = {}
    for (const r of roster ?? []) {
      if (!byItem[r.item_id]) byItem[r.item_id] = []
      byItem[r.item_id].push(r)
    }
    setItems(items.map((i) => ({ ...i, participants: byItem[i.id] ?? i.participants ?? [] })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(
    () => (cat === '전체' ? items : items.filter((i) => (i.category || '기타') === cat)),
    [items, cat]
  )

  const displayName = profile?.nickname || user?.email?.split('@')[0] || '이웃'

  return (
    <div className="container page">
      {/* 히어로 배너(공지) */}
      <section className="l-hero">
        <div>
          <span className="l-hero-badge">함께배송 매칭</span>
          <h1>같은 물건이 필요한 <br />이웃끼리 모여 사요</h1>
          <p>{displayName}님, 필요한 것만 공동구매하고 안 쓰는 물건은 이웃과 나눠요.</p>
        </div>
      </section>

      {/* 카테고리 필터 칩 */}
      <div className="l-cat-row" role="tablist" aria-label="카테고리 필터">
        {['전체', ...CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cat === c}
            className={`l-cat-chip${cat === c ? ' active' : ''}`}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="action-row">
        <CreateItemForm user={user} profile={profile} onCreated={load} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="search-empty">
          {cat === '전체' ? '아직 공동구매가 없어요. 첫 모임을 열어보세요!' : `'${cat}' 카테고리의 모집이 아직 없어요.`}
        </div>
      ) : (
        <div className="grid">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <Layout>
        <HomeBody />
      </Layout>
    </ProtectedRoute>
  )
}