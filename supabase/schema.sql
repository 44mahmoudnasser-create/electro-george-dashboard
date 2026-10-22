-- ============================================================
-- Electro George — Supabase schema (synced from production, Oct 2026)
-- Reference copy of the live database. Tables are ordered so the
-- file runs top-to-bottom on an empty project.
--
-- Not yet included (pending export from production):
--   • RPC functions: log_production, log_substage, dispense_bom_item
--   • Triggers (activity_log auditing, auth.users → app_users)
--   • RLS policies
--   • Storage bucket "purchases"
-- ON DELETE rules are not visible in the export; FKs below use the
-- Postgres default (NO ACTION) until confirmed.
-- ============================================================

-- ── Users & roles ───────────────────────────────────────────
-- role: 'admin' | 'secretary' | 'manager' (no CHECK constraint in production)
create table public.app_users (
  id           uuid primary key references auth.users(id),
  email        text not null,
  role         text not null default 'secretary',
  full_name    text,
  department   text,
  notify_email text,
  created_at   timestamptz default now()
);

create table public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.app_users(id),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz default now()
);

create table public.app_settings (
  key   text primary key,
  value jsonb not null
);

-- ── Technicians & skills ────────────────────────────────────
create table public.technicians (
  id         bigserial primary key,
  name       text not null,
  grade      text check (grade in ('فني','مشرف','مساعد')),
  route      text,
  department text,
  created_at timestamptz default now()
);

create table public.skills (
  id         bigserial primary key,
  skill_name text not null unique,
  department text
);

create table public.tech_skills (
  tech_id  bigint not null references public.technicians(id),
  skill_id bigint not null references public.skills(id),
  primary key (tech_id, skill_id)
);

-- ── Attendance (department comes via technicians) ───────────
-- UNIQUE (tech_id, date) is required by the app's upsert(onConflict: "tech_id,date").
-- It did not appear in the export — confirm it exists in production.
create table public.attendance (
  id      bigserial primary key,
  tech_id bigint references public.technicians(id),
  date    date not null,
  status  text not null default 'حاضر' check (status in ('حاضر','غياب','أجازة','مأمورية')),
  unique (tech_id, date)
);

create table public.permissions (
  id              bigserial primary key,
  tech_id         bigint references public.technicians(id),
  date            date not null,
  permission_type text not null check (permission_type in (
    'إذن ساعتين صباحي','إذن ساعتين مسائي','إذن نصف يوم صباحي','إذن نصف يوم مسائي')),
  unique (tech_id, date)
);

create table public.overtime (
  id           bigserial primary key,
  tech_id      bigint references public.technicians(id),
  date         date not null,
  has_overtime boolean default false,
  unique (tech_id, date)
);

create table public.violations (
  id      bigserial primary key,
  tech_id bigint references public.technicians(id),
  date    date default current_date,
  reason  text,
  details text
);

-- ── Work orders ─────────────────────────────────────────────
create table public.work_orders (
  id                bigserial primary key,
  wo_number         text not null unique,
  status            text not null default 'لم يبدأ' check (status in ('لم يبدأ','جاري','متوقف','مكتمل','تم التسليم')),
  priority          text default 'متوسطة' check (priority in ('منخفضة','متوسطة','عالية','عاجلة')),
  plan_month        text,
  department        text,
  created_date      date default current_date,
  expected_delivery date,
  completion_date   date,
  chk_client        boolean default false,
  chk_quality       boolean default false,
  chk_assembly      boolean default false
);

create table public.files (
  id            bigserial primary key,
  wo_id         bigint references public.work_orders(id),
  file_name     text not null,
  file_type     text check (file_type in ('إضافة','تعديل','أمر الشغل نفسه')),
  receive_date  date default current_date,
  delivered_to  bigint references public.technicians(id),
  delivery_date date,
  department    text
);

create table public.daily_productivity (
  id         bigserial primary key,
  tech_id    bigint references public.technicians(id),
  wo_id      bigint references public.work_orders(id),
  work_date  date default current_date,
  task       text not null,
  notes      text,
  department text
);

-- ── Purchases ───────────────────────────────────────────────
-- LEGACY: replaced by purchase_orders + purchase_items, but still read
-- by app/dashboard/page.tsx and app/work-orders/[id]/page.tsx.
create table public.purchases (
  id           bigserial primary key,
  wo_id        bigint references public.work_orders(id),
  item_name    text not null,
  qty          integer default 1,
  request_date date default current_date,
  supply_date  date,
  status       text not null default 'مفتوح' check (status in ('مفتوح','تم التوريد','ملغي')),
  image_path   text,
  department   text
);

create table public.purchase_orders (
  id           bigint generated always as identity primary key,
  order_no     text,
  wo_id        bigint references public.work_orders(id),
  department   text,
  request_date date not null default current_date,
  image_path   text,                       -- path in storage bucket "purchases"
  created_at   timestamptz not null default now()
);

create table public.purchase_items (
  id                bigint generated always as identity primary key,
  purchase_order_id bigint not null references public.purchase_orders(id),
  item_name         text not null,
  category          text not null default '' check (category in ('عدد','كيلو','جرام','علبة')),
  quantity          numeric not null default 1 check (quantity > 0),
  status            text not null default 'مفتوح' check (status in ('مفتوح','تم التوريد','ملغي')),
  supply_date       date,
  image_path        text,                  -- unused: the image lives on purchase_orders
  created_at        timestamptz not null default now()
);
-- Note: category's default '' fails its own CHECK; inserts must always pass a category.

-- ── Standard products (templates) ───────────────────────────
create table public.standard_products (
  id         bigint generated always as identity primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.production_items (
  id                  bigint generated always as identity primary key,
  standard_product_id bigint not null references public.standard_products(id),
  item_name           text not null,
  code                text,
  finish              text,
  quantity            numeric not null default 1 check (quantity > 0),
  created_at          timestamptz not null default now()
);

create table public.bom_items (
  id                  bigint generated always as identity primary key,
  standard_product_id bigint not null references public.standard_products(id),
  item_name           text not null,
  category            text not null default 'عدد' check (category in ('عدد','كيلو','جرام','علبة')),
  quantity            numeric not null default 1 check (quantity > 0),
  created_at          timestamptz not null default now()
);

create table public.work_order_products (
  id                  bigint generated always as identity primary key,
  work_order_id       bigint not null references public.work_orders(id),
  standard_product_id bigint not null references public.standard_products(id),
  quantity            numeric not null default 1 check (quantity > 0),
  created_at          timestamptz not null default now()
);

-- ── Production tracking ─────────────────────────────────────
create table public.machines (
  id         bigint generated always as identity primary key,
  name       text not null,
  department text not null,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz default now()
);

create table public.wo_production_items (
  id                bigint generated always as identity primary key,
  work_order_id     bigint not null references public.work_orders(id),
  qty               numeric not null default 1 check (qty > 0),
  description       text not null,
  part_no           text,
  sheet_steel       text,
  thickness         text,
  required_painting text not null default 'YES' check (required_painting in ('YES','NA')),
  sort_order        integer,
  qty_sheet         numeric not null default 0,
  qty_paint         numeric not null default 0,
  qty_assembly      numeric not null default 0,
  chk_sheet         boolean not null default false,  -- legacy, superseded by qty_*
  chk_paint         boolean not null default false,  -- legacy
  chk_assembly      boolean not null default false,  -- legacy
  created_at        timestamptz not null default now()
);

create table public.wo_production_log (
  id                 bigint generated always as identity primary key,
  production_item_id bigint not null references public.wo_production_items(id),
  stage              text not null check (stage in ('sheet','paint','assembly')),
  qty                numeric not null check (qty > 0),
  machine_id         bigint references public.machines(id),
  produced_by        uuid references public.app_users(id),
  produced_at        date not null default current_date,
  note               text,
  created_at         timestamptz default now()
);

-- Optional SHEET sub-stages. log_substage likely upserts per (item, stage);
-- confirm whether a UNIQUE (production_item_id, stage) exists.
create table public.wo_item_substages (
  id                 bigint generated always as identity primary key,
  production_item_id bigint not null references public.wo_production_items(id),
  stage              text not null check (stage in ('punch','cut','bend','weld')),
  qty_done           numeric not null default 0,
  updated_at         timestamptz default now()
);

-- ── BOM per work order ──────────────────────────────────────
create table public.wo_bom_items (
  id            bigint generated always as identity primary key,
  work_order_id bigint not null references public.work_orders(id),
  s_no          integer,
  qty           numeric not null default 1,
  unit          text,
  description   text not null,
  part_no       text,
  remark        text,
  department    text not null,
  qty_dispensed numeric not null default 0,
  stock_item_id bigint,                    -- no FK: no stock table exists yet
  created_at    timestamptz default now()
);

create table public.wo_bom_dispense_log (
  id           bigint generated always as identity primary key,
  bom_item_id  bigint not null references public.wo_bom_items(id),
  qty          numeric not null check (qty > 0),
  dispensed_by uuid references public.app_users(id),
  dispensed_at timestamptz default now(),
  note         text
);

-- ── Audit ───────────────────────────────────────────────────
create table public.activity_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  text not null,
  action     text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_by uuid references public.app_users(id),
  department text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- TODO: functions, triggers, RLS policies, storage bucket
-- ============================================================
