// lib/notify.js — 알림(notifications) 헬퍼
// 알림은 DB 트리거가 생성하고(postgres 함수 public.notify_user), 클라이언트는 읽기/읽음 표시만 한다.

import { supabase } from './supabase'

export function fetchNotifications({ limit = 50 } = {}) {
  return supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
}

export async function unreadNotifications() {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) return 0
  return count ?? 0
}

export async function markAllRead() {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
}

export async function markRead(id) {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
}

// 내 알림 실시간 구독 (신규 알림 배지/목록 갱신)
export function subscribeNotifications(myId, onNew) {
  return supabase
    .channel('notifications-mine')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${myId}`,
    }, (payload) => onNew(payload.new))
    .subscribe()
}

// 알림 타입 → 사용자 표시용 라벨
export const NOTIFY_TYPE = {
  item_joined: '새 참여자',
  item_closed: '모집 완료',
  pickup: '집결 안내',
  item_arrival: '도착',
  chat: '쪽지',
  rent_request: '대여 신청',
  rent_approved: '대여 승인',
  rent_returned: '반납 완료',
  rent_relisted: '재등록',
  system: '알림',
}

// 알림 데이터로 이동할 경로 결정
export function notifyPath(n) {
  const d = n?.data ?? {}
  if (d.thread_id) return `/chat/${d.thread_id}`
  if (d.rental_id) return '/rent'
  if (d.item_id) return '/'
  return null
}