-- 신규 가입자 온보딩 + 브라우저 위치(geolocation) 좌표 필드
-- latitude/longitude: 브라우저 geolocation 좌표. location(텍스트)과 분리 저장.
-- onboarded: 온보딩 통과 여부. 기본 false → 신규 가입자만 온보딩 노출.

alter table public.profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists onboarded boolean not null default false;

-- 기존 가입자는 온보딩 생략 (기존 users 은 통과 처리)
update public.profiles set onboarded = true where onboarded = false;