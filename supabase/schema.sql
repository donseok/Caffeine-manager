-- ============================================================================
-- 카페인 매니저 — Supabase 스키마 (테이블 · 보안 정책(RLS) · 트리거 · 뷰)
-- ----------------------------------------------------------------------------
-- 사용 방법
--   1) Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run
--   2) 이어서 supabase/seed.sql 을 같은 방법으로 실행 (시드 상품 35종)
--   3) Authentication → Providers → Email 에서 필요하면 "Confirm email" 을 끄기 (테스트 편의)
--   4) Authentication → URL Configuration 에 GitHub Pages 주소를 Site URL / Redirect URL 로 등록
-- 이 파일은 여러 번 실행해도 안전하도록 작성되어 있습니다.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. 관리자 이메일 목록 — 여기에 있는 이메일로 가입하면 자동으로 admin 역할
-- ----------------------------------------------------------------------------
create table if not exists public.admin_emails (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);
insert into public.admin_emails (email, note) values ('donseok75@gmail.com', '최초 슈퍼관리자')
on conflict (email) do nothing;

-- ----------------------------------------------------------------------------
-- 2. 프로필 (auth.users 1:1)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  display_name   text,
  role           text not null default 'user' check (role in ('user', 'admin')),
  daily_limit_mg integer not null default 400 check (daily_limit_mg between 50 and 1500),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. 상품 카탈로그
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique,
  brand            text not null,
  brand_key        text,
  name             text not null,
  category         text not null default 'other' check (category in ('coffee', 'tea', 'blended', 'refresher', 'energy', 'other')),
  serving_label    text not null default '1회 제공량',
  serving_ml       numeric check (serving_ml is null or serving_ml >= 0),
  caffeine_mg      numeric not null check (caffeine_mg >= 0),
  sugar_g          numeric check (sugar_g is null or sugar_g >= 0),
  kcal             numeric check (kcal is null or kcal >= 0),
  base_price       integer check (base_price is null or base_price >= 0),
  price_note       text,
  price_checked_at date,
  source           text,
  verified_at      date,
  tags             text[] not null default '{}',
  image_url        text,
  status           text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_brand_name_idx on public.products (brand, name);

-- ----------------------------------------------------------------------------
-- 4. 섭취 기록 — 상품이 나중에 바뀌어도 기록이 변하지 않도록 영양정보를 스냅샷으로 저장
-- ----------------------------------------------------------------------------
create table if not exists public.intakes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  product_id    uuid references public.products (id) on delete set null,
  product_name  text not null,
  brand         text,
  category      text,
  serving_label text,
  serving_ml    numeric,
  caffeine_mg   numeric not null default 0 check (caffeine_mg >= 0),
  sugar_g       numeric,
  kcal          numeric,
  quantity      numeric not null default 1 check (quantity > 0 and quantity <= 20),
  price_paid    integer check (price_paid is null or price_paid >= 0),
  consumed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists intakes_user_time_idx on public.intakes (user_id, consumed_at desc);
create index if not exists intakes_time_idx on public.intakes (consumed_at desc);

-- ----------------------------------------------------------------------------
-- 5. 공통 함수
-- ----------------------------------------------------------------------------
-- 현재 로그인 사용자가 활성 관리자인지
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'admin' and p.is_active from public.profiles p where p.id = auth.uid()), false);
$$;

-- 현재 로그인 사용자가 활성 계정인지
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_active from public.profiles p where p.id = auth.uid()), false);
$$;

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();

-- 가입 시 프로필 자동 생성 (+ admin_emails 에 있으면 admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role, daily_limit_mg)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    case when exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email)) then 'admin' else 'user' end,
    coalesce(nullif(new.raw_user_meta_data ->> 'daily_limit_mg', '')::integer, 400)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 일반 사용자는 자기 프로필의 role / is_active / email 을 바꿀 수 없음
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() 가 null 이면 SQL Editor / 서비스 롤 등 서버 측 작업이므로 제한하지 않음
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    new.email := old.email;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns before update on public.profiles for each row execute function public.protect_profile_columns();

-- 프로필을 클라이언트에서 직접 만들 때(트리거 실패 대비) admin_emails 규칙 적용
create or replace function public.profile_insert_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(new.email);
  if auth.uid() is not null and not public.is_admin() then
    new.role := case when exists (select 1 from public.admin_emails a where lower(a.email) = new.email) then 'admin' else 'user' end;
    new.is_active := true;
  end if;
  return new;
end $$;
drop trigger if exists profiles_insert_defaults on public.profiles;
create trigger profiles_insert_defaults before insert on public.profiles for each row execute function public.profile_insert_defaults();

-- 일반 사용자가 만든/고친 상품은 항상 pending 상태, created_by 고정
create or replace function public.protect_product_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() 가 null 이면 SQL Editor(시드 입력) / 서비스 롤 작업이므로 제한하지 않음
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending';
      new.created_by := auth.uid();
      new.verified_at := null;
    else
      new.status := 'pending';
      new.created_by := old.created_by;
      new.verified_at := old.verified_at;
      new.slug := old.slug;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_protect_columns on public.products;
create trigger products_protect_columns before insert or update on public.products for each row execute function public.protect_product_columns();

-- ----------------------------------------------------------------------------
-- 6. 관리자용 통계 뷰 (호출자 권한 → RLS 그대로 적용: 관리자만 전체를 봄)
-- ----------------------------------------------------------------------------
create or replace view public.user_stats with (security_invoker = true) as
  select user_id,
         count(*)::integer                as intake_count,
         max(consumed_at)                 as last_intake_at,
         sum(caffeine_mg * quantity)      as total_caffeine_mg
  from public.intakes
  group by user_id;

-- ----------------------------------------------------------------------------
-- 7. 행 단위 보안 (RLS)
-- ----------------------------------------------------------------------------
alter table public.admin_emails enable row level security;
alter table public.profiles     enable row level security;
alter table public.products     enable row level security;
alter table public.intakes      enable row level security;

-- admin_emails: 관리자만 조회/관리
drop policy if exists admin_emails_admin_all on public.admin_emails;
create policy admin_emails_admin_all on public.admin_emails for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- products
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (public.is_active_user());
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using (public.is_admin() or (created_by = auth.uid() and status = 'pending'))
  with check (public.is_admin() or created_by = auth.uid());
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated
  using (public.is_admin());

-- intakes
drop policy if exists intakes_select on public.intakes;
create policy intakes_select on public.intakes for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists intakes_insert on public.intakes;
create policy intakes_insert on public.intakes for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());
drop policy if exists intakes_update on public.intakes;
create policy intakes_update on public.intakes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists intakes_delete on public.intakes;
create policy intakes_delete on public.intakes for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- 권한 (Supabase 기본값과 동일하지만 명시)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.products, public.intakes, public.admin_emails to authenticated;
grant select on public.user_stats to authenticated;
revoke all on public.profiles, public.products, public.intakes, public.admin_emails, public.user_stats from anon;

-- ----------------------------------------------------------------------------
-- 8. 이미 가입한 사용자에게 admin_emails 규칙을 소급 적용하고 싶을 때 (선택)
-- ----------------------------------------------------------------------------
update public.profiles p set role = 'admin'
where lower(p.email) in (select lower(email) from public.admin_emails) and p.role <> 'admin';
