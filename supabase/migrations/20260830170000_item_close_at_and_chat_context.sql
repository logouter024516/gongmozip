-- 모집 마감 기준 확장 + 그룹채팅 상세 요약
-- 1) items.close_at — 기간 기준 모집 마감 시각 (NULL = 인원 기준/영구)
-- 2) close_at 지난 open 모집 자동 마감 (before insert/update 트리거)
-- 3) 참여 트리거 보강:
--    - 기간/영구 모집(close_at 설정 또는 target_count=0)에서는 인원 자동마감 중단
--    - 마감 지난 모집에 참여 시도하면 차단
-- 4) chat_thread_list 뷰 확장 — 그룹채팅 상세(집결 현황 등)를 위함
--    is_group + items의 price/shipping/status/close_at/pickup/organizer_arrived_at/created_by

alter table public.items
  add column if not exists close_at timestamptz;

-- close_at이 지난 open 모집은 자동 마감
create or replace function public.handle_item_close_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'open' and new.close_at is not null and new.close_at <= now() then
    new.status := 'closed';
    new.closed_at := coalesce(new.closed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists items_close_deadline_trigger on public.items;
create trigger items_close_deadline_trigger
  before insert or update on public.items
  for each row execute function public.handle_item_close_deadline();

-- 참여 트리거: 기간/영구 모집에선 인원 자동마감 제외, 마감 지난 모집 차단
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

  -- 마감 시각이 지난 모집은 참여 불가
  if v_item.status <> 'open' or (v_item.close_at is not null and v_item.close_at <= now()) then
    raise exception '이미 마감된 모집이에요.';
  end if;

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

  -- 인원 기준(close_at 없음 + 목표 인원 있음)일 때만 도달 시 자동 마감
  if v_item.status = 'open'
     and v_item.close_at is null
     and v_item.target_count > 0
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

-- 그룹채팅 상세용 뷰 확장
drop view if exists public.chat_thread_list;
create or replace view public.chat_thread_list
with (security_invoker = on)
as
select
  t.id,
  t.item_id,
  t.rental_id,
  t.is_group,
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
  (select to_jsonb(x)
     from (
       select i.id, i.name, i.image_url, i.region, i.category, i.address,
              i.price, i.shipping_cost, i.min_qty, i.target_count,
              i.status, i.close_at, i.pickup_spot, i.pickup_at,
              i.organizer_arrived_at, i.created_by
       from public.items i where i.id = t.item_id
     ) x
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