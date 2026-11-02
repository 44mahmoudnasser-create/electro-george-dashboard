-- ============================================================
-- 028 — مجموعات الأقسام (لصفحة الحضور)
-- • كل قسم بيتقسم لمجموعات، كل مجموعة ليها مشرف (درجته "مشرف") وأعضاء (فني أو مساعد)
-- • العضو في مجموعة واحدة بس، ولازم يكون من نفس قسم المجموعة
-- • منفصلة عن assembly_groups (بتاعة متابعة التجميع) علشان مايأثروش على بعض
-- • القراءة لأي مستخدم، والتعديل للمدير أو أدمن نفس القسم
-- Safe to re-run.
-- ============================================================

create table if not exists public.department_groups (
  id            bigserial primary key,
  department    text not null,                 -- نفس قيمة technicians.department
  name          text not null,
  supervisor_id bigint references public.technicians(id) on delete set null,
  created_at    timestamptz default now()
);
create index if not exists department_groups_dept_idx on public.department_groups (department);

create table if not exists public.department_group_members (
  group_id bigint not null references public.department_groups(id) on delete cascade,
  tech_id  bigint not null references public.technicians(id) on delete cascade,
  primary key (group_id, tech_id),
  unique (tech_id)                             -- الفني في مجموعة واحدة بس
);

-- المشرف لازم يكون درجته "مشرف" ومن نفس القسم
create or replace function public.department_groups_check()
returns trigger language plpgsql as $$
begin
  if new.supervisor_id is not null and not exists (
    select 1 from public.technicians t
    where t.id = new.supervisor_id and t.grade = 'مشرف'
      and lower(coalesce(t.department, '')) = lower(new.department)
  ) then
    raise exception 'المشرف لازم يكون بدرجة مشرف ومن نفس القسم';
  end if;
  return new;
end $$;

drop trigger if exists department_groups_check on public.department_groups;
create trigger department_groups_check before insert or update on public.department_groups
  for each row execute function public.department_groups_check();

-- العضو لازم يكون فني أو مساعد ومن نفس قسم المجموعة
create or replace function public.department_group_members_check()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.technicians t
    join public.department_groups g on g.id = new.group_id
    where t.id = new.tech_id and t.grade in ('فني', 'مساعد')
      and lower(coalesce(t.department, '')) = lower(g.department)
  ) then
    raise exception 'العضو لازم يكون فني أو مساعد ومن نفس قسم المجموعة';
  end if;
  return new;
end $$;

drop trigger if exists department_group_members_check on public.department_group_members;
create trigger department_group_members_check before insert or update on public.department_group_members
  for each row execute function public.department_group_members_check();

-- مين يقدر يعدّل مجموعات قسم: المدير، أو أدمن القسم ده
create or replace function public.can_manage_department(p_department text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid()
      and (u.role = 'manager' or (u.role = 'admin' and lower(coalesce(u.department, '')) = lower(p_department)))
  )
$$;

alter table public.department_groups enable row level security;
alter table public.department_group_members enable row level security;

drop policy if exists department_groups_read on public.department_groups;
create policy department_groups_read on public.department_groups for select to authenticated using (true);
drop policy if exists department_groups_write on public.department_groups;
create policy department_groups_write on public.department_groups for all to authenticated
  using (public.can_manage_department(department))
  with check (public.can_manage_department(department));

drop policy if exists department_group_members_read on public.department_group_members;
create policy department_group_members_read on public.department_group_members for select to authenticated using (true);
drop policy if exists department_group_members_write on public.department_group_members;
create policy department_group_members_write on public.department_group_members for all to authenticated
  using (exists (select 1 from public.department_groups g where g.id = group_id and public.can_manage_department(g.department)))
  with check (exists (select 1 from public.department_groups g where g.id = group_id and public.can_manage_department(g.department)));
