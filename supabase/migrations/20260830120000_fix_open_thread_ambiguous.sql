-- open_thread 400 수정: PL/pgSQL 파라미터와 테이블 컬럼명 충돌(42702)
-- 원인: reuse 조회에서 "t.item_id is not distinct from item_id" → item_id가 모호(파라미터 vs 컬럼)
--     → POSTGREST가 PGRST로 400 반환. 모든 쪽지 시작이 실패했음.
-- 적용: supabase_apply_migration "fix_open_thread_ambiguous" (원격) — 동일 내용.
create or replace function public.open_thread(
  other_user_id uuid,
  item_id uuid default null,
  rental_id uuid default null
)
returns public.chat_threads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_thread public.chat_threads;
begin
  if v_me is null then
    raise exception '로그인이 필요해요.';
  end if;
  if other_user_id is null or other_user_id = v_me then
    raise exception '상대를 잘못 선택했어요.';
  end if;

  -- 동일 상품/상대 스레드가 이미 있으면 재사용
  select * into v_thread
  from public.chat_threads t
  where (t.item_id is not distinct from open_thread.item_id)
    and (t.rental_id is not distinct from open_thread.rental_id)
    and exists (select 1 from public.chat_participants p where p.thread_id = t.id and p.user_id = v_me)
    and exists (select 1 from public.chat_participants p where p.thread_id = t.id and p.user_id = other_user_id)
  order by t.last_message_at desc
  limit 1;

  if v_thread is null then
    insert into public.chat_threads (item_id, rental_id)
    values (open_thread.item_id, open_thread.rental_id)
    returning * into v_thread;

    insert into public.chat_participants (thread_id, user_id)
    values (v_thread.id, v_me), (v_thread.id, other_user_id);
  end if;

  return v_thread;
end;
$$;

revoke execute on function public.open_thread(uuid, uuid, uuid) from public, anon;
grant execute on function public.open_thread(uuid, uuid, uuid) to authenticated;