-- 공동구매 참여자 그룹채팅
-- 쪽지가 등록자 1:1이 아니라 "참여를 누른 사람들 + 등록자"가 함께 대화하는
-- 상품 단위 그룹 스레드로 바뀐다.
-- 1) chat_threads.is_group (그룹 스레드 여부)
-- 2) join_item_chat RPC — 참여자만 호출 가능, 스레드 재사용 + 등록자/모든 참여자 멤버 자동 추가
-- 3) leave_item_chat RPC — 참여 취소 시 그룹 스레드에서 탈퇴

alter table public.chat_threads
  add column if not exists is_group boolean not null default false;

create or replace function public.join_item_chat(target_item_id uuid)
returns public.chat_threads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_thread public.chat_threads;
  v_owner uuid;
begin
  if v_me is null then
    raise exception '로그인이 필요해요.';
  end if;

  select created_by into v_owner from public.items where id = target_item_id;
  if not found then
    raise exception '물건을 찾지 못했어요.';
  end if;

  -- 참여를 눌러야만 채팅에 들어갈 수 있다.
  if not exists (
    select 1 from public.item_participants p
    where p.item_id = target_item_id and p.user_id = v_me
  ) then
    raise exception '참여 후 이용할 수 있어요.';
  end if;

  -- 기존 그룹 스레드 재사용 (내가 참여 중인 것)
  select * into v_thread
  from public.chat_threads t
  where t.item_id = target_item_id
    and t.is_group
    and exists (
      select 1 from public.chat_participants cp
      where cp.thread_id = t.id and cp.user_id = v_me
    )
  order by t.last_message_at desc
  limit 1;

  if v_thread is null then
    insert into public.chat_threads (item_id, is_group)
    values (target_item_id, true)
    returning * into v_thread;
  end if;

  -- 멤버 = 등록자(주최자) + 현재 모든 참여자 (새 사람만 추가)
  insert into public.chat_participants (thread_id, user_id)
  select v_thread.id, m.user_id
  from (
    select v_owner as user_id
    union
    select q.user_id from public.item_participants q where q.item_id = target_item_id
  ) m
  where m.user_id is not null
  on conflict (thread_id, user_id) do nothing;

  return v_thread;
end;
$$;

-- 참여 취소 → 해당 상품의 그룹 스레드에서 탈퇴
create or replace function public.leave_item_chat(target_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception '로그인이 필요해요.';
  end if;

  delete from public.chat_participants cp
  using public.chat_threads t
  where cp.thread_id = t.id
    and t.item_id = target_item_id
    and t.is_group
    and cp.user_id = v_me;
end;
$$;

revoke execute on function public.join_item_chat(uuid) from public, anon;
grant execute on function public.join_item_chat(uuid) to authenticated;

revoke execute on function public.leave_item_chat(uuid) from public, anon;
grant execute on function public.leave_item_chat(uuid) to authenticated;