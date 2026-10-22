-- ============================================================
-- 015 — سياسات الصلاحيات لجداول الأدوات والعهد
-- • القراءة: أي مستخدم مسجل دخول
-- • الكتابة: admin و manager بس
-- • دوال الصرف والارتجاع بقت SECURITY DEFINER (بتفحص الدور جواها)
-- • أي جدول أو دالة مش موجودة بيتتخطى (مع رسالة) — شغّل 005_tools_custody.sql الأول لو فيه جداول ناقصة
-- Safe to re-run.
-- ============================================================

create or replace function public.is_tools_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users u
                 where u.id = auth.uid() and u.role in ('admin','manager'))
$$;

do $$
declare t text;
begin
  foreach t in array array['tools','tool_items','custody','custody_events'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'تخطّيت %: الجدول مش موجود', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s_read" on public.%1$I', t);
    execute format('create policy "%1$s_read" on public.%1$I for select to authenticated using (true)', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (public.is_tools_admin()) with check (public.is_tools_admin())', t);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.require_custody_role()',
    'public.add_tool_items(bigint, text[])',
    'public.issue_custody(bigint, bigint, numeric, bigint[], text)',
    'public.custody_event(bigint, text, numeric, text)'
  ] loop
    if to_regprocedure(f) is null then
      raise notice 'تخطّيت الدالة %: مش موجودة', f;
      continue;
    end if;
    execute 'alter function ' || f || ' security definer set search_path = public';
  end loop;
end $$;

notify pgrst, 'reload schema';
