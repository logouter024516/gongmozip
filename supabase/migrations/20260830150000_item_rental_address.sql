-- 위치 상세(주소 텍스트) 컬럼 추가: 공동구매(items) + 대여(rentals)
alter table public.items
  add column if not exists address text not null default '';

alter table public.rentals
  add column if not exists address text not null default '';