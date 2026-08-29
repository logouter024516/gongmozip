-- rentals 삭제 RLS 정책: 등록자(lender)는 자신의 대여 물품 삭제 가능
drop policy if exists "rentals_delete_own" on public.rentals;
create policy "rentals_delete_own" on public.rentals
  for delete to authenticated
  using (auth.uid() = lender_id);
