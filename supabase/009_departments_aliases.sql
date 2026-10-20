-- ============================================================
-- 009 — جدول الأقسام + ربط القيم القديمة بغير ما نغيّرها
-- • مش بنغيّر أي قيمة متخزنة (الفنيين، الملفات، المهارات، أوامر الشراء، app_users)
-- • الجدول بيحدد القسم بـ code ثابت + اسم عربي قابل للتعديل + aliases (القيم القديمة)
-- • resolve_department() بتحوّل أي قيمة قديمة للـ code (بتتجاهل الحروف الكبيرة والمسافات)
-- • تغيير الاسم بعد كده = تعديل في الجدول بس
-- Safe to re-run.
-- ============================================================

create table if not exists public.departments (
  code      text primary key,                 -- ثابت، للمنطق الداخلي بس
  name_ar   text not null,                    -- الاسم اللي بيظهر، قابل للتعديل
  aliases   text[] not null default '{}',     -- كل القيم اللي متخزنة حاليًا وبتشير لنفس القسم
  active    boolean not null default true,
  sort_no   int not null default 0
);

insert into public.departments (code, name_ar, aliases, sort_no) values
  ('SHEET',         'الصاج',              array['SHEET','sheet','الصاج'], 1),
  ('PAINT',         'الدهان',             array['PAINT','paint','الدهان'], 2),
  ('ELEC_ASSEMBLY', 'التجميع الكهربي',    array['ELEC_ASSEMBLY','كهربا','كهربي'], 3),
  ('MECH_ASSEMBLY', 'التجميع الميكانيكي', array['MECH_ASSEMBLY','assembly','ميكاني','ميكانيكي'], 4)
on conflict (code) do nothing;

-- ───────────── التحويل: قيمة قديمة → code ─────────────
create or replace function public.resolve_department(p_raw text)
returns text language sql stable as $$
  select d.code from public.departments d
   where exists (
     select 1 from unnest(d.aliases) a
      where lower(btrim(a)) = lower(btrim(coalesce(p_raw, '')))
   )
   limit 1
$$;

-- ───────────── القسم بتاع المستخدم الحالي (بعد التحويل) ─────────────
create or replace function public.current_dept_code()
returns text language sql stable as $$
  select public.resolve_department(u.department) from public.app_users u where u.id = auth.uid()
$$;

-- ───────────── ربط wo_department_status بجدول الأقسام بدل الـ CHECK الثابت ─────────────
alter table public.wo_department_status
  drop constraint if exists wo_department_status_department_check;
alter table public.wo_department_status
  drop constraint if exists wo_department_status_department_fkey;
alter table public.wo_department_status
  add constraint wo_department_status_department_fkey
  foreign key (department) references public.departments(code);

-- الأوامر الجديدة بتاخد الأقسام المفعّلة من الجدول
create or replace function public.seed_wo_departments() returns trigger
language plpgsql as $$
begin
  insert into public.wo_department_status (wo_id, department)
  select new.id, d.code from public.departments d where d.active
  on conflict do nothing;
  return new;
end $$;

-- ───────────── تحديث حالة قسم (بيستخدم الـ resolver) ─────────────
create or replace function public.set_department_status(p_wo_id bigint, p_dept text, p_status text)
returns jsonb language plpgsql as $$
declare
  v_user   public.app_users;
  v_mycode text;
  v_row    public.wo_department_status;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null then raise exception 'لازم تكون مسجل دخول'; end if;
  v_mycode := public.resolve_department(v_user.department);

  if v_user.role not in ('admin','manager') and v_mycode is distinct from p_dept then
    raise exception 'مش مسموحلك تعدّل حالة قسم تاني';
  end if;

  select * into v_row from public.wo_department_status
   where wo_id = p_wo_id and department = p_dept for update;
  if not found then raise exception 'القسم ده مش مطلوب على الأمر ده'; end if;
  if not v_row.applicable then raise exception 'القسم ده مستبعد من الأمر ده'; end if;

  update public.wo_department_status
     set status = p_status, updated_by = v_user.id, updated_at = now()
   where wo_id = p_wo_id and department = p_dept;

  insert into public.activity_log (table_name, record_id, action, changed_by, department, old_data, new_data)
  values ('wo_department_status', p_wo_id::text || ':' || p_dept, 'UPDATE', v_user.id, p_dept,
          jsonb_build_object('status', v_row.status),
          jsonb_build_object('status', p_status));

  return jsonb_build_object('department', p_dept, 'status', p_status);
end $$;
