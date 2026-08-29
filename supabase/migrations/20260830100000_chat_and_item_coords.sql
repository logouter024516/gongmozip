-- 채팅(쪽지) 매칭 시스템 + 거리 정밀도 좌표 컬럼
-- 1) chat_threads / chat_participants / chat_messages + RLS
-- 2) open_thread RPC (스레드 중복 방지 + 당사자 참여자 자동 생성)
-- 3) chat_thread_list 뷰 (security_invoker, 마지막 메시지/안읽음/상대 닉네임)
-- 4) realtime publication 등록
-- 5) items / rentals latitude·longitude (거리 정밀도)

-- ============ 5) 좌표 컬럼 ============
alter table public.items
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.rentals
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- ============ 1) 채팅 스키마 ============
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items(id) on delete set null,
  rental_id uuid references public.rentals(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at);
create index if not exists chat_participants_user_idx on public.chat_participants (user_id);
create index if not exists chat_threads_recent_idx on public.chat_threads (last_message_at desc);

alter table public.chat_threads enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

-- threads: 참여자만 조회/수정
drop policy if exists "chat_threads_select_participant" on public.chat_threads;
create policy "chat_threads_select_participant" on public.chat_threads
  for select to authenticated
  using (exists (select 1 from public.chat_participants cp where cp.thread_id = id and cp.user_id = auth.uid()));

drop policy if exists "chat_threads_update_participant" on public.chat_threads;
create policy "chat_threads_update_participant" on public.chat_threads
  for update to authenticated
  using (exists (select 1 from public.chat_participants cp where cp.thread_id = id and cp.user_id = auth.uid()))
  with check (exists (select 1 from public.chat_participants cp where cp.thread_id = id and cp.user_id = auth.uid()));

-- participants: 본인 참여 스레드만 조회, 본인 row만 수정(읽음 표시)
drop policy if exists "chat_participants_select_participant" on public.chat_participants;
create policy "chat_participants_select_participant" on public.chat_participants
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.chat_participants me where me.thread_id = thread_id and me.user_id = auth.uid()));

drop policy if exists "chat_participants_update_own" on public.chat_participants;
create policy "chat_participants_update_own" on public.chat_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- messages: 참여자만 조회, 본인 보낸 것만 입력
drop policy if exists "chat_messages_select_participant" on public.chat_messages;
create policy "chat_messages_select_participant" on public.chat_messages
  for select to authenticated
  using (exists (select 1 from public.chat_participants cp where cp.thread_id = thread_id and cp.user_id = auth.uid()));

drop policy if exists "chat_messages_insert_participant_sender" on public.chat_messages;
create policy "chat_messages_insert_participant_sender" on public.chat_messages
  for insert to authenticated
  with check (sender_id = auth.uid()
              and exists (select 1 from public.chat_participants cp where cp.thread_id = thread_id and cp.user_id = auth.uid()));

-- ============ 2) 스레드 열기 RPC ============
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
  where (t.item_id is not distinct from item_id)
    and (t.rental_id is not distinct from rental_id)
    and exists (select 1 from public.chat_participants p where p.thread_id = t.id and p.user_id = v_me)
    and exists (select 1 from public.chat_participants p where p.thread_id = t.id and p.user_id = other_user_id)
  order by t.last_message_at desc
  limit 1;

  if v_thread is null then
    insert into public.chat_threads (item_id, rental_id)
    values (item_id, rental_id)
    returning * into v_thread;

    insert into public.chat_participants (thread_id, user_id)
    values (v_thread.id, v_me), (v_thread.id, other_user_id);
  end if;

  return v_thread;
end;
$$;

revoke execute on function public.open_thread(uuid, uuid, uuid) from public, anon;
grant execute on function public.open_thread(uuid, uuid, uuid) to authenticated;

-- ============ 3) 스레드 목록 뷰 (security_invoker → RLS 그대로 적용) ============
drop view if exists public.chat_thread_list;
create or replace view public.chat_thread_list
with (security_invoker = on)
as
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

-- ============ 4) realtime ============
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.chat_threads;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.chat_participants;
  exception when duplicate_object then null; end;
end $$;