-- 알림 허브 + 함께배송(집결/도착) + items 마감
-- 1) items: closed_at / pickup_spot / pickup_at / organizer_arrived_at
-- 2) item_participants: arrived_at (집결 도착)
-- 3) notifications 테이블 + RLS (읽기/읽음표시만 클라이언트 허용)
-- 4) notify_user() (security definer, 트리거 전용)
-- 5) 알림 트리거: 참여/모집마감/집결안내/도착/쪽지/대여상태
-- 6) item_participant_list 뷰 (닉네임 포함 집결 명단)
-- 7) realtime publication에 notifications 등록

-- ============ 1) 함께배송 컬럼 ============
alter table public.items
  add column if not exists closed_at timestamptz,
  add column if not exists pickup_spot text default '',
  add column if not exists pickup_at timestamptz,
  add column if not exists organizer_arrived_at timestamptz;

alter table public.item_participants
  add column if not exists arrived_at timestamptz;

-- ============ 2) notifications ============
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 클라이언트는 읽음 표시(read_at)만 수정 가능. 생성/삭제는 서버 트리거와 관리자만.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- ============ 3) 알림 발송 함수 (트리거 전용) ============
create or replace function public.notify_user(
  p_user_id uuid,
  p_type text default 'system',
  p_title text default '알림',
  p_body text default null,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, coalesce(p_type, 'system'), coalesce(p_title, '알림'), p_body, coalesce(p_data, '{}'::jsonb));
end;
$$;

revoke execute on function public.notify_user(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ============ 4) 공동구매 알림 트리거 ============
-- 참여: 주최자에게 알림 + 목표 달성 시 자동 마감
create or replace function public.handle_item_participant_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
  v_nick text;
begin
  select * into v_item from public.items where id = new.item_id;

  if v_item.created_by is distinct from new.user_id then
    select nickname into v_nick from public.profiles where id = new.user_id;
    perform public.notify_user(
      v_item.created_by,
      'item_joined',
      '새 참여자',
      coalesce(v_nick, '이웃') || '님이 「' || v_item.name || '」 모집에 참여했어요.',
      jsonb_build_object('item_id', new.item_id, 'item_name', v_item.name)
    );
  end if;

  -- 목표 인원 달성 → 자동 마감
  if v_item.status = 'open'
     and (select count(*) from public.item_participants where item_id = new.item_id) >= v_item.target_count then
    update public.items set status = 'closed', closed_at = now()
    where id = new.item_id and status = 'open';
  end if;

  return new;
end;
$$;

drop trigger if exists items_participant_join_trigger on public.item_participants;
create trigger items_participant_join_trigger
  after insert on public.item_participants
  for each row execute function public.handle_item_participant_join();

-- 마감/집결: status가 closed로 바뀌면 참여자에 알림, 집결 장소가 (재)설정되면 안내
create or replace function public.handle_item_close_or_pickup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  -- 모집 마감
  if old.status is distinct from new.status and new.status = 'closed' then
    for v_rec in
      select user_id from public.item_participants where item_id = new.id and user_id <> new.created_by
    loop
      perform public.notify_user(
        v_rec.user_id,
        'item_closed',
        '모집 완료 · 함께배송',
        '「' || new.name || '」 모집이 완료됐어요.' ||
          case when coalesce(new.pickup_spot, '') <> '' then ' 집결: ' || new.pickup_spot else '' end,
        jsonb_build_object('item_id', new.id, 'item_name', new.name)
      );
    end loop;
  end if;

  -- 집결 정보 안내 (마감 후 집결 장소/시각 지정·변경 시)
  if new.status = 'closed'
     and coalesce(new.pickup_spot, '') <> ''
     and (old.pickup_spot is distinct from new.pickup_spot
          or old.pickup_at is distinct from new.pickup_at) then
    for v_rec in
      select user_id from public.item_participants where item_id = new.id and user_id <> new.created_by
    loop
      perform public.notify_user(
        v_rec.user_id,
        'pickup',
        '집결 안내',
        '「' || new.name || '」 집결 장소: ' || new.pickup_spot,
        jsonb_build_object('item_id', new.id, 'item_name', new.name)
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists items_close_pickup_trigger on public.items;
create trigger items_close_pickup_trigger
  after update on public.items
  for each row execute function public.handle_item_close_or_pickup();

-- 도착: 참여자가 도착 체크하면 주최자에게 알림
create or replace function public.handle_item_arrival()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_nick text;
  v_name text;
begin
  if new.arrived_at is not null and old.arrived_at is null then
    select created_by, name into v_owner, v_name from public.items where id = new.item_id;
    if v_owner is distinct from new.user_id then
      select nickname into v_nick from public.profiles where id = new.user_id;
      perform public.notify_user(
        v_owner,
        'item_arrival',
        '도착',
        coalesce(v_nick, '이웃') || '님이 「' || v_name || '」 집결에 도착했어요.',
        jsonb_build_object('item_id', new.item_id, 'item_name', v_name)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists items_arrival_trigger on public.item_participants;
create trigger items_arrival_trigger
  after update on public.item_participants
  for each row execute function public.handle_item_arrival();

-- ============ 5) 쪽지 알림 트리거 ============
create or replace function public.handle_chat_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  for v_rec in
    select cp.user_id, pf.nickname
    from public.chat_participants cp
    left join public.profiles pf on pf.id = cp.user_id
    where cp.thread_id = new.thread_id and cp.user_id <> new.sender_id
  loop
    perform public.notify_user(
      v_rec.user_id,
      'chat',
      '쪽지가 도착했어요',
      coalesce(v_rec.nickname, '이웃') || '님 쪽지: ' || left(new.body, 60),
      jsonb_build_object('thread_id', new.thread_id)
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists chat_messages_notify_trigger on public.chat_messages;
create trigger chat_messages_notify_trigger
  after insert on public.chat_messages
  for each row execute function public.handle_chat_message_notify();

-- ============ 6) 대여 상태 알림 트리거 ============
create or replace function public.handle_rental_status_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrower_nick text;
  v_lender_nick text;
  v_borrower uuid := coalesce(new.borrower_id, old.borrower_id);
begin
  if new.status = old.status then return new; end if;

  if new.status = 'reserved' and old.status = 'available' then
    select nickname into v_borrower_nick from public.profiles where id = v_borrower;
    perform public.notify_user(
      new.lender_id,
      'rent_request',
      '대여 신청',
      coalesce(v_borrower_nick, '이웃') || '님이 「' || new.name || '」 대여를 신청했어요. 승인해주세요.',
      jsonb_build_object('rental_id', new.id, 'rental_name', new.name)
    );
  elsif new.status = 'on_loan' and old.status = 'reserved' then
    select nickname into v_lender_nick from public.profiles where id = new.lender_id;
    if v_borrower is not null then
      perform public.notify_user(
        v_borrower,
        'rent_approved',
        '대여 승인',
        coalesce(v_lender_nick, '이웃') || '님이 「' || new.name || '」 대여를 승인했어요.',
        jsonb_build_object('rental_id', new.id, 'rental_name', new.name)
      );
    end if;
  elsif new.status = 'returned' and old.status in ('on_loan', 'reserved') then
    perform public.notify_user(
      new.lender_id,
      'rent_returned',
      '반납 완료',
      '「' || new.name || '」 반납이 확인됐어요.',
      jsonb_build_object('rental_id', new.id, 'rental_name', new.name)
    );
  elsif new.status = 'available' and old.status = 'returned' then
    perform public.notify_user(
      new.lender_id,
      'rent_relisted',
      '재등록',
      '「' || new.name || '」 다시 대여 가능해요.',
      jsonb_build_object('rental_id', new.id, 'rental_name', new.name)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists rentals_status_notify_trigger on public.rentals;
create trigger rentals_status_notify_trigger
  after update on public.rentals
  for each row execute function public.handle_rental_status_notify();

-- ============ 7) 집결 명단 뷰 (닉네임 포함) ============
drop view if exists public.item_participant_list;
create or replace view public.item_participant_list
with (security_invoker = on)
as
select
  ip.item_id,
  ip.user_id,
  ip.qty,
  ip.arrived_at,
  ip.created_at as joined_at,
  pf.nickname
from public.item_participants ip
left join public.profiles pf on pf.id = ip.user_id;

grant select on public.item_participant_list to authenticated;
grant select on public.item_participant_list to anon;

-- ============ 8) realtime ============
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null; end;
end $$;