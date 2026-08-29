-- 채팅 RLS 수정: 42P17 무한 재귀 + 상시 true 정책 오타 + 뷰 definer 전환
-- 원인: chat_participants select 정책이 자기 자신을 참조해 무한 재귀(42P17)
--     → chat_thread_list 조회 500, 쪽지 동작 400/500 직결.
--     chat_messages 정책은 cp.thread_id = cp.thread_id (상시 true) 오타.
-- 적용: supabase_apply_migration "fix_chat_rls_recursion" (원격) — 동일 내용.

-- 1) chat_participants select: 자기참조(재귀) 제거 → 본인 row만
drop policy if exists "chat_participants_select_participant" on public.chat_participants;
create policy "chat_participants_select_participant" on public.chat_participants
  for select to authenticated
  using (user_id = auth.uid());

-- 2) chat_messages 정책: 외부 테이블 컬럼에 정확히 결합
drop policy if exists "chat_messages_select_participant" on public.chat_messages;
create policy "chat_messages_select_participant" on public.chat_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_participants cp
      where cp.thread_id = chat_messages.thread_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "chat_messages_insert_participant_sender" on public.chat_messages;
create policy "chat_messages_insert_participant_sender" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_participants cp
      where cp.thread_id = chat_messages.thread_id
        and cp.user_id = auth.uid()
    )
  );

-- 3) chat_thread_list: security_invoker → definer(소유자) 전환.
--    보안: WHERE가 내가 참여한 스레드만 노출, grant는 authenticated만.
drop view if exists public.chat_thread_list;
create view public.chat_thread_list as
select
  t.id,
  t.item_id,
  t.rental_id,
  t.last_message_at,
  t.created_at,
  (select to_jsonb(m2)
     from (
       select m2.id, m2.body, m2.sender_id, m2.created_at
       from public.chat_messages m2
       where m2.thread_id = t.id
       order by m2.created_at desc, m2.id desc
       limit 1
     ) m2
  ) as last_message,
  (select count(*)::int
     from public.chat_messages m
     join public.chat_participants me
       on me.thread_id = m.thread_id and me.user_id = auth.uid()
    where m.thread_id = t.id
      and m.sender_id <> auth.uid()
      and m.created_at > me.last_read_at
  ) as unread_count,
  (select coalesce(
            json_agg(json_build_object('user_id', p.user_id, 'nickname', pf.nickname))
              filter (where p.user_id is not null),
            '[]'::json)
     from public.chat_participants p
     left join public.profiles pf on pf.id = p.user_id
    where p.thread_id = t.id
  ) as participants,
  (select to_jsonb(i)
     from (select i.id, i.name, i.image_url, i.region from public.items i where i.id = t.item_id) i
  ) as item,
  (select to_jsonb(r)
     from (select r.id, r.name, r.image_url from public.rentals r where r.id = t.rental_id) r
  ) as rental
from public.chat_threads t
where exists (
  select 1 from public.chat_participants p
  where p.thread_id = t.id and p.user_id = auth.uid()
);

grant select on public.chat_thread_list to authenticated;