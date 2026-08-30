-- 그룹채팅 참여자 닉네임 누락 + 대여 신청 RLS 차단 수정
-- 1) chat_participants SELECT RLS가 본인 행만 노출 → 동일 스레드 멤버 전체 노출로 확대
--    (security definer 헬퍼로 재귀 방지)
-- 2) rentals UPDATE RLS가 기존 lender/borrower만 허용 → 신규 신청(first apply) 차단.
--    빌려주는 사람 정책 + 신청/취소 정책으로 분리, 트리거 알림(rent_request)이 발동되도록.

-- ============ 1) 그룹채팅 명단(닉네임) 노출 수정 ============
create or replace function public.is_chat_thread_member(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_participants
    where thread_id = p_thread and user_id = auth.uid()
  )
$$;

grant execute on function public.is_chat_thread_member(uuid) to authenticated;

drop policy if exists "chat_participants_select_participant" on public.chat_participants;
create policy "chat_participants_select_participant"
  on public.chat_participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_chat_thread_member(thread_id)
  );

-- ============ 2) 대여 신청 가능하도록 RLS 분리 ============
drop policy if exists "rentals_update_involved" on public.rentals;

-- 빌려주는 사람: 소유 물품의 상태/상대를 자유롭게 변경 (승인/거절/반납/재등록)
drop policy if exists "rentals_update_lender" on public.rentals;
create policy "rentals_update_lender"
  on public.rentals
  for update to authenticated
  using (auth.uid() = lender_id)
  with check (auth.uid() = lender_id);

-- 신청: available 상태의 물품에 대해 내가 borrower로 예약(reserved) 지정
drop policy if exists "rentals_update_apply" on public.rentals;
create policy "rentals_update_apply"
  on public.rentals
  for update to authenticated
  using (status = 'available')
  with check (status = 'reserved' and borrower_id = auth.uid());

-- 신청 취소: 내가 예약한(reserved/borrower=me) 물품을 available로 되돌림
drop policy if exists "rentals_update_cancel" on public.rentals;
create policy "rentals_update_cancel"
  on public.rentals
  for update to authenticated
  using (status = 'reserved' and borrower_id = auth.uid())
  with check (status = 'available' and borrower_id is null);