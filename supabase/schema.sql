-- Dux AI: аккаунттар базасы (Supabase).
-- Supabase → SQL Editor → New query → осы файлды толық қойып, Run басыңыз.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  plan text not null default 'free' check (plan in ('free', 'premium')),
  premium_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

create table if not exists public.codes (
  code text primary key,
  days int not null default 30 check (days > 0),
  used_by uuid references auth.users(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.usage enable row level security;
alter table public.codes enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists usage_select_own on public.usage;
create policy usage_select_own on public.usage for select using (auth.uid() = user_id);

-- Қолданушы тек өз атын өзгерте алады; тариф пен лимитті тек төмендегі функциялар өзгертеді
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;
revoke all on public.usage from anon, authenticated;
grant select on public.usage to authenticated;
revoke all on public.codes from anon, authenticated;

-- Тіркелгенде профиль автоматты жасалады
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Күн шекарасы: Алматы уақыты бойынша түнгі 00:00
create or replace function public.today_kz() returns date
language sql stable as $$ select (now() at time zone 'Asia/Almaty')::date $$;

-- Тариф және бүгінгі қолдану
create or replace function public.get_status() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_until timestamptz;
  v_prem boolean;
  v_used int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select plan, premium_until into v_plan, v_until from public.profiles where id = v_uid;
  v_prem := coalesce(v_plan = 'premium' and (v_until is null or v_until > now()), false);
  select u.count into v_used from public.usage u where u.user_id = v_uid and u.day = public.today_kz();
  return json_build_object(
    'premium', v_prem,
    'used', coalesce(v_used, 0),
    'limit', case when v_prem then 300 else 15 end,
    'until', case when v_prem then v_until end
  );
end $$;

-- Әр сұрақ алдында шақырылады: лимитті тексеріп, санауышты арттырады
create or replace function public.consume_request() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_until timestamptz;
  v_prem boolean;
  v_lim int;
  v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.profiles (id) values (v_uid) on conflict do nothing;
  select plan, premium_until into v_plan, v_until from public.profiles where id = v_uid;
  v_prem := coalesce(v_plan = 'premium' and (v_until is null or v_until > now()), false);
  v_lim := case when v_prem then 300 else 15 end;
  insert into public.usage (user_id, day, count) values (v_uid, public.today_kz(), 0) on conflict do nothing;
  update public.usage u set count = u.count + 1
    where u.user_id = v_uid and u.day = public.today_kz() and u.count < v_lim
    returning u.count into v_count;
  if v_count is null then
    return json_build_object('ok', false, 'premium', v_prem, 'used', v_lim, 'limit', v_lim);
  end if;
  return json_build_object('ok', true, 'premium', v_prem, 'used', v_count, 'limit', v_lim);
end $$;

-- Premium кодын белсендіру (код бір рет қана жұмыс істейді)
create or replace function public.redeem_code(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_days int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  update public.codes c set used_by = v_uid, used_at = now()
    where c.code = upper(trim(p_code)) and c.used_by is null
    returning c.days into v_days;
  if v_days is null then raise exception 'invalid code'; end if;
  insert into public.profiles (id) values (v_uid) on conflict do nothing;
  update public.profiles p
    set plan = 'premium',
        premium_until = greatest(coalesce(p.premium_until, now()), now()) + make_interval(days => v_days)
    where p.id = v_uid;
  return public.get_status();
end $$;

revoke all on function public.get_status() from public, anon;
revoke all on function public.consume_request() from public, anon;
revoke all on function public.redeem_code(text) from public, anon;
grant execute on function public.get_status() to authenticated;
grant execute on function public.consume_request() to authenticated;
grant execute on function public.redeem_code(text) to authenticated;

-- Сынақ коды (30 күн). Сатуға код жасау: төмендегі жолдың түсініктемесін алып тастаңыз
insert into public.codes (code, days) values ('DUX-TEST-0001', 30) on conflict do nothing;
-- insert into public.codes (code, days)
--   select 'DUX-' || upper(substr(md5(random()::text), 1, 8)), 30 from generate_series(1, 20);
-- select code from public.codes where used_by is null;   -- сатылмаған кодтар
