-- 자동 프로필 생성 트리거 + 기존 사용자 백필
-- auth.users에 사용자 생성 시 profiles 행 자동 생성 (OAuth 가입자 포함)
-- 컨벤션: 닉네임 = 이메일 로컬파트, 없으면 '동네 이웃', location 기본값 ''

-- 1) 트리거 함수
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      '동네 이웃'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2) 트리거 부착
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) 보안: 트리거 전용 함수이므로 외부(anon/authenticated) 실행 차단
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 4) 기존 사용자 백필 (프로필 없는 auth.users 전부)
insert into public.profiles (id, nickname)
select
  u.id,
  coalesce(
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    '동네 이웃'
  )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
