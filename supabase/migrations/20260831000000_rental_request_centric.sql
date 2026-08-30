-- 대여를 '빌리고 싶어요' 요청 중심으로 전환 + 다수 제안 승인 매칭
-- rentals: lender_id(게시자=빌리고 싶은 사람)→requester_id / borrower_id 삭제 / lender_id(빌려주는 이웃) 신설
-- 상태: open(모집 중) → matched(매칭됨) → in_use(대여 중) → done(반납 완료)
-- rental_offers: 이웃들이 '빌려드릴게요' 제안 → 요청자가 1명 승인(트리거로 rentals에 반영)

-- ============ 0) 구 트리거/정책 제거 ============
-- (구 status 알림 트리거가 borrower_id를 참조하므로 컬럼 변경 전에 제거)
drop trigger if exists rentals_status_notify_trigger on public.rentals;

-- (구 정책이 borrower_id 등 컬럼에 의존하므로 컬럼 변경보다 먼저 제거)
drop policy if exists "rentals_select" on public.rentals;
drop policy if exists "rentals_insert_own" on public.rentals;
drop policy if exists "rentals_delete_own" on public.rentals;
drop policy if exists "rentals_update_lender" on public.rentals;
drop policy if exists "rentals_update_apply" on public.rentals;
drop policy if exists "rentals_update_cancel" on public.rentals;
drop policy if exists "rentals_update_involved" on public.rentals;
drop policy if exists "rentals_update_requester_edit" on public.rentals;
drop policy if exists "rentals_update_requester_cancel_match" on public.rentals;
drop policy if exists "rentals_update_requester_reopen" on public.rentals;
drop policy if exists "rentals_update_lender_start" on public.rentals;
drop policy if exists "rentals_update_lender_finish" on public.rentals;
drop policy if exists "rentals_update_lender_cancel_match" on public.rentals;

alter table public.rentals
  drop constraint if exists rentals_lender_id_fkey;

alter table public.rentals rename column lender_id to requester_id;
alter table public.rentals drop column if exists borrower_id;

alter table public.rentals
  alter column requester_id set not null,
  add constraint rentals_requester_id_fkey foreign key (requester_id) references public.profiles(id) on delete cascade;

alter table public.rentals
  add column if not exists lender_id uuid references public.profiles(id) on delete set null;

-- 기존 베타 데이터 상태값을 새 상태로 매핑 (구 상태 체크 먼저 제거)
alter table public.rentals
  drop constraint if exists rentals_status_check;
update public.rentals set status = 'open'   where status not in ('open','matched','in_use','done');

alter table public.rentals
  add constraint rentals_status_check check (status in ('open','matched','in_use','done'));

-- ============ 2) rental_offers ============
create table if not exists public.rental_offers (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  offerer_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint rental_offers_status_check check (status in ('pending','accepted','declined','withdrawn'))
);

create unique index if not exists rental_offers_one_active_idx
  on public.rental_offers (rental_id, offerer_id) where status in ('pending','accepted');

create index if not exists rental_offers_rental_idx on public.rental_offers (rental_id);
create index if not exists rental_offers_offerer_idx on public.rental_offers (offerer_id);

-- ============ 3) RLS: rentals ============
create policy "rentals_select" on public.rentals
  for select to authenticated using (true);

create policy "rentals_insert_own" on public.rentals
  for insert to authenticated with check (auth.uid() = requester_id);

create policy "rentals_delete_own" on public.rentals
  for delete to authenticated using (auth.uid() = requester_id);

-- 요청자: 모집 중(미매칭) 내용 편집
create policy "rentals_update_requester_edit" on public.rentals
  for update to authenticated
  using (auth.uid() = requester_id and status = 'open' and lender_id is null)
  with check (auth.uid() = requester_id and status = 'open' and lender_id is null);

-- 요청자: 매칭 취소 → 다시 모집
create policy "rentals_update_requester_cancel_match" on public.rentals
  for update to authenticated
  using (auth.uid() = requester_id and status = 'matched')
  with check (auth.uid() = requester_id and status = 'open' and lender_id is null);

-- 요청자: 반납 완료 후 재모집(done→open)
create policy "rentals_update_requester_reopen" on public.rentals
  for update to authenticated
  using (auth.uid() = requester_id and status = 'done')
  with check (auth.uid() = requester_id and status = 'open' and lender_id is null);

-- 빌려주는 이웃: 대여 시작 (matched→in_use)
create policy "rentals_update_lender_start" on public.rentals
  for update to authenticated
  using (auth.uid() = lender_id and status = 'matched')
  with check (auth.uid() = lender_id and status = 'in_use');

-- 빌려주는 이웃: 반납 확인 (in_use→done)
create policy "rentals_update_lender_finish" on public.rentals
  for update to authenticated
  using (auth.uid() = lender_id and status = 'in_use')
  with check (auth.uid() = lender_id and status = 'done');

-- 빌려주는 이웃: 매칭 포기 → 다시 모집
create policy "rentals_update_lender_cancel_match" on public.rentals
  for update to authenticated
  using (auth.uid() = lender_id and status = 'matched')
  with check (status = 'open' and lender_id is null);

-- ============ 4) RLS: rental_offers ============
alter table public.rental_offers enable row level security;

drop policy if exists "rental_offers_select_participant" on public.rental_offers;
create policy "rental_offers_select_participant" on public.rental_offers
  for select to authenticated
  using (
    offerer_id = auth.uid()
    or exists (select 1 from public.rentals r where r.id = rental_id and r.requester_id = auth.uid())
  );

drop policy if exists "rental_offers_insert_offer" on public.rental_offers;
create policy "rental_offers_insert_offer" on public.rental_offers
  for insert to authenticated
  with check (
    offerer_id = auth.uid()
    and exists (select 1 from public.rentals r where r.id = rental_id and r.status = 'open' and r.requester_id <> auth.uid())
  );

-- 제안자 철회 (pending→withdrawn)
drop policy if exists "rental_offers_update_withdraw" on public.rental_offers;
create policy "rental_offers_update_withdraw" on public.rental_offers
  for update to authenticated
  using (offerer_id = auth.uid() and status = 'pending')
  with check (offerer_id = auth.uid() and status = 'withdrawn');

-- 요청자 승인/거절 (pending→accepted/declined) — 매칭 반영은 트리거가 처리
drop policy if exists "rental_offers_update_requester" on public.rental_offers;
create policy "rental_offers_update_requester" on public.rental_offers
  for update to authenticated
  using (
    status = 'pending'
    and exists (select 1 from public.rentals r where r.id = rental_id and r.requester_id = auth.uid())
  )
  with check (
    status in ('accepted','declined')
    and exists (select 1 from public.rentals r where r.id = rental_id and r.requester_id = auth.uid())
  );

-- ============ 5) 트리거: 제안 승인 시 rentals 매칭 반영 ============
create or replace function public.handle_rental_offer_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if old.status = 'pending' and new.status = 'accepted' then
    select name into v_name from public.rentals where id = new.rental_id;

    update public.rentals set status = 'matched', lender_id = new.offerer_id
    where id = new.rental_id and status = 'open';

    update public.rental_offers set status = 'declined'
    where rental_id = new.rental_id and status = 'pending' and offerer_id <> new.offerer_id;

    perform public.notify_user(
      new.offerer_id,
      'rent_accepted',
      '대여 확정',
      '「' || coalesce(v_name, '') || '」 대여가 확정됐어요. 이제 대여 시작을 알려주세요.',
      jsonb_build_object('rental_id', new.rental_id, 'rental_name', v_name)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists rental_offer_accept_trigger on public.rental_offers;
create trigger rental_offer_accept_trigger
  after update on public.rental_offers
  for each row execute function public.handle_rental_offer_accept();

-- ============ 6) 트리거: 제안 도착 알림 ============
create or replace function public.handle_rental_offer_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req uuid;
  v_name text;
  v_nick text;
begin
  select requester_id, name into v_req, v_name from public.rentals where id = new.rental_id;
  select nickname into v_nick from public.profiles where id = new.offerer_id;

  if v_req is not null and v_req <> new.offerer_id then
    perform public.notify_user(
      v_req,
      'rent_offer',
      '대여 제안이 도착했어요',
      coalesce(v_nick, '이웃') || '님이 「' || v_name || '」 빌려드리고 싶다고 제안했어요. 확인해주세요.',
      jsonb_build_object('rental_id', new.rental_id, 'rental_name', v_name)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists rental_offers_notify_trigger on public.rental_offers;
create trigger rental_offers_notify_trigger
  after insert on public.rental_offers
  for each row execute function public.handle_rental_offer_notify();

-- ============ 7) 트리거: rentals 상태 알림 재작성 ============
create or replace function public.handle_rental_status_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text;
begin
  if new.status = old.status then return new; end if;

  if new.status = 'in_use' and old.status = 'matched' then
    select nickname into v_nick from public.profiles where id = new.lender_id;
    perform public.notify_user(
      new.requester_id,
      'rent_start',
      '대여 시작',
      coalesce(v_nick, '이웃') || '님이 「' || new.name || '」 대여를 시작했어요.',
      jsonb_build_object('rental_id', new.id, 'rental_name', new.name)
    );
  elsif new.status = 'done' and old.status = 'in_use' then
    perform public.notify_user(
      new.requester_id,
      'rent_returned',
      '반납 완료',
      '「' || new.name || '」 반납이 확인됐어요.',
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