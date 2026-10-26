-- ============================================================
-- 027 — حذف أمر شغل بكل اللي يخصه (المدير بس)
-- • الدالة delete_work_order بتتأكد إن المستخدم مدير، وبتحذف كل حاجة في transaction واحدة:
--   لو أي خطوة فشلت مفيش حاجة بتتحذف.
-- • بتحذف: البنود، قائمة الإنتاج وسجلاتها ومراحل الصاج، الـ BOM وسجل الصرف وإذون الصرف،
--   Total BOM، حالات الأقسام وسجل الحالات، الملفات وربطها بالبنود، الإنتاجية اليومية،
--   طلبات الشراء القديمة، أوامر الشراء المرتبطة ببنودها، ونواقص وبيانات التجميع لو الجداول موجودة.
-- • سجل النشاط (activity_log) مابيتحذفش، وبيتسجل فيه الحذف بنسخة من بيانات الأمر.
-- • صور أوامر الشراء في الـ Storage مابتتحذفش من هنا.
-- • كلمة المرور بتتراجع في الواجهة قبل ما الدالة تتنادي.
-- Safe to re-run.
-- ============================================================

create or replace function public.delete_work_order(p_wo_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  public.app_users;
  v_wo    public.work_orders;
  v_items bigint[];
  v_prod  bigint[];
  v_bom   bigint[];
  v_po    bigint[];
  v_counts jsonb;
  n int;
begin
  select * into v_user from public.app_users where id = auth.uid();
  if v_user.id is null or v_user.role is distinct from 'manager' then
    raise exception 'حذف أمر الشغل للمدير بس';
  end if;

  select * into v_wo from public.work_orders where id = p_wo_id for update;
  if not found then raise exception 'أمر الشغل غير موجود'; end if;

  select coalesce(array_agg(id), '{}') into v_items from public.work_order_items  where wo_id = p_wo_id;
  select coalesce(array_agg(id), '{}') into v_prod  from public.wo_production_items where work_order_id = p_wo_id;
  select coalesce(array_agg(id), '{}') into v_bom   from public.wo_bom_items        where work_order_id = p_wo_id;
  select coalesce(array_agg(id), '{}') into v_po    from public.purchase_orders     where wo_id = p_wo_id;

  v_counts := jsonb_build_object(
    'items', cardinality(v_items), 'production_items', cardinality(v_prod),
    'bom_items', cardinality(v_bom), 'purchase_orders', cardinality(v_po));

  -- بنتخطى حماية البنود المعتمدة وتحديث حالة الأمر من البنود (الأمر نفسه هيتحذف)
  perform set_config('eg.item_flow', 'on', true);
  perform set_config('eg.wo_sync', 'on', true);

  -- الإنتاج: سجلات المراحل والإنتاج قبل البنود نفسها
  delete from public.wo_substage_log    where production_item_id = any(v_prod);
  delete from public.wo_item_substages  where production_item_id = any(v_prod);
  delete from public.wo_production_log  where production_item_id = any(v_prod);
  delete from public.wo_production_items where work_order_id = p_wo_id;

  -- الـ BOM: سجل الصرف قبل البنود (إذون الصرف بتتحذف مع الأمر cascade)
  delete from public.wo_bom_dispense_log where bom_item_id = any(v_bom);
  delete from public.wo_bom_items        where work_order_id = p_wo_id;

  -- التجميع الميكانيكي (جداول اتعملت برا الـ migrations، فبنتأكد إنها موجودة الأول)
  if to_regclass('public.assembly_shortages') is not null then
    execute 'delete from public.assembly_shortages where item_id = any($1)' using v_items;
  end if;
  if to_regclass('public.item_assembly') is not null then
    execute 'delete from public.item_assembly where item_id = any($1)' using v_items;
  end if;

  -- الملفات (ربطها بالبنود في file_items بيتحذف cascade)
  delete from public.files where wo_id = p_wo_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('files', n);

  delete from public.daily_productivity where wo_id = p_wo_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('productivity', n);

  delete from public.purchases where wo_id = p_wo_id;
  delete from public.purchase_items  where purchase_order_id = any(v_po);
  delete from public.purchase_orders where id = any(v_po);

  -- سجل في النشاط قبل الحذف النهائي
  insert into public.activity_log (table_name, record_id, action, changed_by, old_data, new_data)
  values ('work_orders', p_wo_id::text, 'DELETE', v_user.id, to_jsonb(v_wo), jsonb_build_object('deleted', v_counts));

  -- الأمر نفسه: البنود وحالات الأقسام وسجل الحالات و Total BOM وإذون الصرف بتتحذف cascade
  delete from public.work_orders where id = p_wo_id;

  return jsonb_build_object('wo_number', v_wo.wo_number, 'deleted', v_counts);
end $$;

notify pgrst, 'reload schema';
