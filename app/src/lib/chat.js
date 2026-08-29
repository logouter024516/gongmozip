// lib/chat.js — 쪽지(내부 채팅) 헬퍼 모음
// 스레드 열기(RPC), 스레드 목록, 안읽음, 실시간 구독, 읽음 처리, 메시지 전송.
// DB 스키마/RLS는 supabase/migrations/20260830100000_chat_and_item_coords.sql 참조.

import { supabase } from './supabase'

// 상대와의 채팅 스레드를 열고 돌려준다.
// 같은 상품(공동구매)/대여에 대한 스레드가 있으면 재사용한다 (postgres 함수에서 처리).
export async function openThread(otherUserId, { itemId = null, rentalId = null } = {}) {
  const { data, error } = await supabase.rpc('open_thread', {
    other_user_id: otherUserId,
    item_id: itemId,
    rental_id: rentalId,
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

// 내 참여 스레드 목록 (뷰 chat_thread_list)
export function fetchThreads() {
  return supabase
    .from('chat_thread_list')
    .select('*')
    .order('last_message_at', { ascending: false })
}

// 내 전체 안읽음 개수
export async function totalUnread() {
  const { data, error } = await supabase.from('chat_thread_list').select('unread_count')
  if (error) return 0
  return (data ?? []).reduce((sum, r) => sum + (r.unread_count || 0), 0)
}

// 특정 스레드의 새 메시지 구독. 정리용 channel 객체를 돌려준다.
export function subscribeThread(threadId, onMessage) {
  return supabase
    .channel(`chat-thread-${threadId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `thread_id=eq.${threadId}`,
    }, (payload) => onMessage(payload.new))
    .subscribe()
}

// 다른 사람이 내 스레드에 보낸 메시지 구독 (안읽음 배지 갱신용). 내 메시지는 무시.
export function subscribeIncoming(myId, onNew) {
  return supabase
    .channel('chat-incoming')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `sender_id=neq.${myId}`,
    }, (payload) => onNew(payload.new))
    .subscribe()
}

// 열려 있는 스레드를 읽음 표시
export async function markThreadRead(threadId, userId) {
  await supabase
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('user_id', userId)
}

// 메시지 전송 + 스레드 최신 시각 갱신
export async function sendMessage(threadId, senderId, body) {
  const text = String(body || '').trim()
  if (!text) return
  const { error } = await supabase
    .from('chat_messages')
    .insert({ thread_id: threadId, sender_id: senderId, body: text })
  if (error) throw error
  await supabase
    .from('chat_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', threadId)
}