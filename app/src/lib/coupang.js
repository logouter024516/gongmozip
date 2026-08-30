// lib/coupang.js — 쿠팡 상품 링크 → 상품 정보 자동 입력 헬퍼
// supabase/functions/crawl-coupang Edge Function을 호출해 이름/가격/이미지를 얻는다.

import { supabase } from './supabase'

export function isCoupangUrl(url) {
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'coupang.com' || host.endsWith('.coupang.com') || host === 'link.coupang.com'
  } catch {
    return false
  }
}

export async function fetchCoupangProduct(url) {
  if (!isCoupangUrl(url)) throw new Error('쿠팡 상품 링크만 지원해요.')
  const { data, error } = await supabase.functions.invoke('crawl-coupang', {
    body: { url },
  })
  if (error) {
    const detail = error.context?.message || error.message || '상품 정보를 가져오지 못했어요.'
    throw new Error(detail)
  }
  if (!data?.ok) throw new Error(data?.error || '상품 정보를 가져오지 못했어요.')
  return data
}