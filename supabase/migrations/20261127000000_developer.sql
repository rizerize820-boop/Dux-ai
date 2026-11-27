alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free','premium','developer'));

-- Developer рөлі: шектеусіз сұрақ, Premium мүмкіндіктері, мерзімі жоқ
create or replace function public.get_status() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_until timestamptz;
  v_prem boolean;
  v_dev boolean;
  v_used int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select plan, premium_until into v_plan, v_until from public.profiles where id = v_uid;
  v_dev := coalesce(v_plan = 'developer', false);
  v_prem := v_dev or coalesce(v_plan = 'premium' and (v_until is null or v_until > now()), false);
  select u.count into v_used from public.usage u where u.user_id = v_uid and u.day = public.today_kz();
  return json_build_object(
    'premium', v_prem,
    'dev', v_dev,
    'used', coalesce(v_used, 0),
    'limit', case when v_dev then 100000 when v_prem then 500 else 50 end,
    'until', case when v_prem and not v_dev then v_until end
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
  v_dev boolean;
  v_lim int;
  v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.profiles (id) values (v_uid) on conflict do nothing;
  select plan, premium_until into v_plan, v_until from public.profiles where id = v_uid;
  v_dev := coalesce(v_plan = 'developer', false);
  v_prem := v_dev or coalesce(v_plan = 'premium' and (v_until is null or v_until > now()), false);
  v_lim := case when v_dev then 100000 when v_prem then 500 else 50 end;
  insert into public.usage (user_id, day, count) values (v_uid, public.today_kz(), 0) on conflict do nothing;
  update public.usage u set count = u.count + 1
    where u.user_id = v_uid and u.day = public.today_kz() and u.count < v_lim
    returning u.count into v_count;
  if v_count is null then
    return json_build_object('ok', false, 'dev', v_dev, 'premium', v_prem, 'used', v_lim, 'limit', v_lim);
  end if;
  return json_build_object('ok', true, 'dev', v_dev, 'premium', v_prem, 'used', v_count, 'limit', v_lim);
end $$;


-- Developer құқығын беру (email-ді өзгертіңіз):
-- update public.profiles set plan = 'developer' where id = (select id from auth.users where email = 'SIZDIN@EMAIL.COM');
