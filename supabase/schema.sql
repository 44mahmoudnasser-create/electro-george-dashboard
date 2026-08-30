-- ============================================================
-- Electro George — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable RLS on all tables (done per table below)

-- Roles: admin | secretary
create table if not exists public.app_users (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin','secretary')) default 'secretary',
  full_name   text,
  created_at  timestamptz default now()
);
alter table public.app_users enable row level security;
create policy "Users can read own row"   on public.app_users for select using (auth.uid() = id);
create policy "Admin reads all"          on public.app_users for select using (
  exists (select 1 from public.app_users u where u.id = auth.uid() and u.role = 'admin'));
create policy "Admin manages all users"  on public.app_users for all using (
  exists (select 1 from public.app_users u where u.id = auth.uid() and u.role = 'admin'));

-- Helper function: current user's role
create or replace function public.current_user_role()
returns text language sql security definer as $$
  select role from public.app_users where id = auth.uid();
$$;

-- ── Technicians ──────────────────────────────────────────────
create table if not exists public.technicians (
  id         bigserial primary key,
  name       text not null,
  grade      text check (grade in ('فني','مشرف','مساعد')),
  route      text,
  created_at timestamptz default now()
);
alter table public.technicians enable row level security;
create policy "All authenticated can read" on public.technicians for select using (auth.role() = 'authenticated');
create policy "Admin can write"            on public.technicians for all using (public.current_user_role() = 'admin');

-- ── Skills ───────────────────────────────────────────────────
create table if not exists public.skills (
  id         bigserial primary key,
  skill_name text unique not null
);
alter table public.skills enable row level security;
create policy "All read"   on public.skills for select using (auth.role() = 'authenticated');
create policy "Admin write" on public.skills for all using (public.current_user_role() = 'admin');

create table if not exists public.tech_skills (
  tech_id  bigint references public.technicians on delete cascade,
  skill_id bigint references public.skills      on delete cascade,
  primary key (tech_id, skill_id)
);
alter table public.tech_skills enable row level security;
create policy "All read"   on public.tech_skills for select using (auth.role() = 'authenticated');
create policy "Admin write" on public.tech_skills for all using (public.current_user_role() = 'admin');

-- ── Work Orders ──────────────────────────────────────────────
create table if not exists public.work_orders (
  id                bigserial primary key,
  wo_number         text unique not null,
  status            text default 'لم يبدأ' check (status in ('لم يبدأ','جاري','متوقف','مكتمل','تم التسليم')),
  created_date      date default current_date,
  expected_delivery date,
  completion_date   date,
  chk_client        boolean default false,
  chk_quality       boolean default false,
  chk_assembly      boolean default false
);
alter table public.work_orders enable row level security;
create policy "All read"   on public.work_orders for select using (auth.role() = 'authenticated');
create policy "Admin write" on public.work_orders for all using (public.current_user_role() = 'admin');

-- ── Attendance ───────────────────────────────────────────────
create table if not exists public.attendance (
  id       bigserial primary key,
  tech_id  bigint references public.technicians on delete cascade,
  date     date not null,
  status   text default 'حاضر' check (status in ('حاضر','غياب','أجازة','مأمورية')),
  unique (tech_id, date)
);
alter table public.attendance enable row level security;
create policy "All read"              on public.attendance for select using (auth.role() = 'authenticated');
create policy "Admin or secretary write" on public.attendance for all using (auth.role() = 'authenticated');

-- ── Permissions (إذونات) ─────────────────────────────────────
create table if not exists public.permissions (
  id              bigserial primary key,
  tech_id         bigint references public.technicians on delete cascade,
  date            date not null,
  permission_type text not null check (permission_type in (
    'إذن ساعتين صباحي','إذن ساعتين مسائي',
    'إذن نصف يوم صباحي','إذن نصف يوم مسائي'))
);
alter table public.permissions enable row level security;
create policy "All read"              on public.permissions for select using (auth.role() = 'authenticated');
create policy "Admin or secretary write" on public.permissions for all using (auth.role() = 'authenticated');

-- ── Overtime ─────────────────────────────────────────────────
create table if not exists public.overtime (
  id           bigserial primary key,
  tech_id      bigint references public.technicians on delete cascade,
  date         date not null,
  has_overtime boolean default false,
  unique (tech_id, date)
);
alter table public.overtime enable row level security;
create policy "All read"              on public.overtime for select using (auth.role() = 'authenticated');
create policy "Admin or secretary write" on public.overtime for all using (auth.role() = 'authenticated');

-- ── Files ────────────────────────────────────────────────────
create table if not exists public.files (
  id            bigserial primary key,
  wo_id         bigint references public.work_orders on delete set null,
  file_name     text not null,
  file_type     text check (file_type in ('إضافة','تعديل','أمر الشغل نفسه')),
  receive_date  date default current_date,
  delivered_to  bigint references public.technicians on delete set null,
  delivery_date date
);
alter table public.files enable row level security;
create policy "All read"   on public.files for select using (auth.role() = 'authenticated');
create policy "Admin write" on public.files for all using (public.current_user_role() = 'admin');

-- ── Violations ───────────────────────────────────────────────
create table if not exists public.violations (
  id      bigserial primary key,
  tech_id bigint references public.technicians on delete cascade,
  date    date default current_date,
  reason  text,
  details text
);
alter table public.violations enable row level security;
create policy "All read"   on public.violations for select using (auth.role() = 'authenticated');
create policy "Admin write" on public.violations for all using (public.current_user_role() = 'admin');

-- ── Purchases ────────────────────────────────────────────────
create table if not exists public.purchases (
  id           bigserial primary key,
  wo_id        bigint references public.work_orders on delete set null,
  item_name    text not null,
  qty          integer default 1,
  request_date date default current_date,
  supply_date  date,
  status       text default 'مفتوح' check (status in ('مفتوح','تم التوريد','ملغي')),
  image_path   text  -- storage path inside "purchases" bucket
);
alter table public.purchases enable row level security;
create policy "All read"   on public.purchases for select using (auth.role() = 'authenticated');
create policy "Admin write" on public.purchases for all using (public.current_user_role() = 'admin');

-- ── Daily Productivity ───────────────────────────────────────
create table if not exists public.daily_productivity (
  id        bigserial primary key,
  tech_id   bigint references public.technicians  on delete cascade,
  wo_id     bigint references public.work_orders  on delete set null,
  work_date date default current_date,
  task      text not null,
  notes     text
);
alter table public.daily_productivity enable row level security;
create policy "All read"   on public.daily_productivity for select using (auth.role() = 'authenticated');
create policy "Admin write" on public.daily_productivity for all using (public.current_user_role() = 'admin');

-- ── Storage bucket for purchase images ───────────────────────
-- Run this separately in Supabase Dashboard → Storage → New Bucket:
-- Name: purchases | Public: false
-- Then add policy: authenticated users can upload/read

-- ── Trigger: auto-insert into app_users on sign-up ───────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.app_users (id, email, role)
  values (new.id, new.email, 'secretary')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
