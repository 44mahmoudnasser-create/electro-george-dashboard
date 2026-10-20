-- ============================================================
-- 005 — الأدوات والعهد
-- • كتالوج الأدوات (قابلة للإضافة من الواجهة)
-- • أدوات قابلة لإعادة الاستخدام: كل قطعة ليها رقم تسلسلي
-- • أدوات مستهلكة: بالكمية بس
-- • العهدة بتتسجل على الفني، وكل حركة (صرف/استهلاك/ارتجاع/تلف/فقد) في سجل
-- • الكمية محمية داخل الداتابيز (مايتعداش المتاح، ولا رد أكتر من المعهود)
-- • الصلاحية: admin و manager بس
-- Safe to re-run.
-- ============================================================

create table if not exists public.tools (
  id            bigint generated always as identity primary key,
  name          text not null,
  category      text,
  is_consumable boolean not null default false,
  unit          text not null default 'عدد',
  department    text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists tools_name_dept_uq on public.tools (name, coalesce(department, ''));

create table if not exists public.tool_items (
  id         bigint generated always as identity primary key,
  tool_id    bigint not null references public.tools(id),
  serial_no  text not null unique,
  status     text not null default 'متاح' check (status in ('متاح','مع فني','تالف','مفقود')),
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists tool_items_tool_idx on public.tool_items (tool_id, status);

create table if not exists public.custody (
  id           bigint generated always as identity primary key,
  tech_id      bigint not null references public.technicians(id),
  tool_id      bigint not null references public.tools(id),
  tool_item_id bigint references public.tool_items(id),   -- للأدوات القابلة لإعادة الاستخدام
  qty          numeric not null check (qty > 0),           -- المصروف
  open_qty     numeric not null check (open_qty >= 0),     -- اللي لسه عند الفني
  department   text,
  issued_at    date not null default current_date,
  status       text not null default 'مستلمة'
               check (status in ('مستلمة','مرتجعة','مستهلكة','تالفة','مفقودة')),
  note         text,
  created_by   uuid references public.app_users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists custody_tech_idx on public.custody (tech_id, status);

create table if not exists public.custody_events (
  id          bigint generated always as identity primary key,
  custody_id  bigint not null references public.custody(id),
  event       text not null check (event in ('صرف','استهلاك','ارتجاع','تلف','فقد')),
  qty         numeric not null check (qty > 0),
  note        text,
  created_by  uuid references public.app_users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists custody_events_idx on public.custody_events (custody_id);

-- ───────────── helper: صلاحية المستخدم الحالي ─────────────
create or replace function public.require_custody_role()
returns text language plpgsql as $$
declare v_role text;
begin
  select role into v_role from public.app_users where id = auth.uid();
  if v_role is null or v_role not in ('admin','manager') then
    raise exception 'مش مسموحلك تعدّل العهد';
  end if;
  return v_role;
end $$;

-- ───────────── إضافة أرقام تسلسلية لأداة قابلة لإعادة الاستخدام ─────────────
create or replace function public.add_tool_items(p_tool_id bigint, p_serials text[])
returns int language plpgsql as $$
declare
  v_tool  public.tools;
  v_s     text;
  v_n     int := 0;
begin
  perform public.require_custody_role();
  select * into v_tool from public.tools where id = p_tool_id;
  if not found then raise exception 'الأداة غير موجودة'; end if;
  if v_tool.is_consumable then raise exception 'الأدوات المستهلكة ماتتسجلش بأرقام تسلسلية'; end if;

  foreach v_s in array p_serials loop
    v_s := btrim(v_s);
    if v_s = '' then continue; end if;
    if exists (select 1 from public.tool_items where serial_no = v_s) then
      raise exception 'الرقم التسلسلي % موجود قبل كده', v_s;
    end if;
    insert into public.tool_items (tool_id, serial_no) values (p_tool_id, v_s);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ───────────── صرف عهدة لفني ─────────────
-- أداة مستهلكة: p_qty كمية، p_serial_ids = null
-- أداة قابلة لإعادة الاستخدام: p_serial_ids = قطع متاحة (كل قطعة سطر عهدة)
create or replace function public.issue_custody(
  p_tech_id bigint, p_tool_id bigint, p_qty numeric,
  p_serial_ids bigint[] default null, p_note text default null)
returns int language plpgsql as $$
declare
  v_tool   public.tools;
  v_tech   public.technicians;
  v_item   public.tool_items;
  v_id     bigint;
  v_id_in  bigint;
  v_n      int := 0;
begin
  perform public.require_custody_role();
  select * into v_tool from public.tools where id = p_tool_id;
  if not found or not v_tool.active then raise exception 'الأداة غير متاحة'; end if;
  select * into v_tech from public.technicians where id = p_tech_id;
  if not found then raise exception 'الفني غير موجود'; end if;

  if v_tool.is_consumable then
    if p_serial_ids is not null then raise exception 'الأداة المستهلكة ماتتسجلش بأرقام تسلسلية'; end if;
    if p_qty is null or p_qty <= 0 then raise exception 'أدخل كمية صحيحة'; end if;
    insert into public.custody (tech_id, tool_id, qty, open_qty, department, note)
    values (p_tech_id, p_tool_id, p_qty, p_qty, v_tech.department, p_note)
    returning id into v_id;
    insert into public.custody_events (custody_id, event, qty, note)
    values (v_id, 'صرف', p_qty, p_note);
    return 1;
  end if;

  -- قابلة لإعادة الاستخدام
  if p_serial_ids is null or cardinality(p_serial_ids) = 0 then
    raise exception 'اختار قطعة واحدة على الأقل برقمها التسلسلي';
  end if;
  foreach v_id_in in array p_serial_ids loop
    select * into v_item from public.tool_items where id = v_id_in for update;
    if not found or v_item.tool_id <> p_tool_id then raise exception 'القطعة مش تبع الأداة دي'; end if;
    if v_item.status <> 'متاح' then
      raise exception 'القطعة % مش متاحة (%)', v_item.serial_no, v_item.status;
    end if;
    update public.tool_items set status = 'مع فني' where id = v_id_in;
    insert into public.custody (tech_id, tool_id, tool_item_id, qty, open_qty, department, note)
    values (p_tech_id, p_tool_id, v_id_in, 1, 1, v_tech.department, p_note)
    returning id into v_id;
    insert into public.custody_events (custody_id, event, qty, note)
    values (v_id, 'صرف', 1, p_note);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ───────────── حركة على عهدة: استهلاك / ارتجاع / تلف / فقد ─────────────
create or replace function public.custody_event(
  p_custody_id bigint, p_event text, p_qty numeric, p_note text default null)
returns jsonb language plpgsql as $$
declare
  v_c      public.custody;
  v_tool   public.tools;
  v_new_st text;
  v_open   numeric;
begin
  perform public.require_custody_role();
  select * into v_c from public.custody where id = p_custody_id for update;
  if not found then raise exception 'سطر العهدة غير موجود'; end if;
  if v_c.open_qty <= 0 then raise exception 'العهدة دي مقفولة ومفيهاش حاجة عند الفني'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'أدخل كمية صحيحة'; end if;
  if p_qty > v_c.open_qty then
    raise exception 'الكمية (%) أكبر من اللي عند الفني (%)', p_qty, v_c.open_qty;
  end if;

  select * into v_tool from public.tools where id = v_c.tool_id;

  if v_tool.is_consumable then
    if p_event not in ('استهلاك','ارتجاع','تلف','فقد') then raise exception 'حركة غير معروفة'; end if;
  else
    if p_qty <> 1 then raise exception 'القطعة دي وحدة واحدة'; end if;
    if p_event = 'استهلاك' then raise exception 'الأداة دي قابلة لإعادة الاستخدام ماتتستهلكش'; end if;
    if p_event not in ('ارتجاع','تلف','فقد') then raise exception 'حركة غير معروفة'; end if;
  end if;

  v_open := v_c.open_qty - p_qty;

  v_new_st := case
    when v_open > 0 then 'مستلمة'
    when p_event = 'استهلاك' then 'مستهلكة'
    when p_event = 'ارتجاع' then 'مرتجعة'
    when p_event = 'تلف' then 'تالفة'
    else 'مفقودة' end;

  update public.custody set open_qty = v_open, status = v_new_st where id = p_custody_id;

  -- القطعة القابلة لإعادة الاستخدام بترجع للمخزن أو تتسجل تالفة/مفقودة
  if v_c.tool_item_id is not null and v_open = 0 then
    update public.tool_items set status = case p_event
        when 'ارتجاع' then 'متاح'
        when 'تلف' then 'تالف'
        else 'مفقود' end
     where id = v_c.tool_item_id;
  end if;

  insert into public.custody_events (custody_id, event, qty, note)
  values (p_custody_id, p_event, p_qty, p_note);

  return jsonb_build_object('open_qty', v_open, 'status', v_new_st);
end $$;

-- ───────────── Realtime (اختياري) ─────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='custody') then
      alter publication supabase_realtime add table public.custody;
    end if;
  end if;
end $$;
