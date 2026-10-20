-- ============================================================
-- 006 — إزالة المنتجات القياسية (standard products)
-- ⚠ جدول الحذف ماينفعش يترجع بدون backup. الخطوة 1 بتعمل نسخة في schema backup_006.
-- • بيشيل: standard_products, production_items, bom_items, work_order_products
-- • مايمسّش: wo_production_items, wo_bom_items, wo_* (بيانات الأوامر الفعلية)
-- • خط الإنتاج كان صفحة UI بس، ماعندوش جدول مستقل
-- ============================================================

-- 1) نسخة احتياطية (لازم تشوف إنها اتعملت قبل ما تكمل)
create schema if not exists backup_006;
create table if not exists backup_006.standard_products       as select * from public.standard_products;
create table if not exists backup_006.production_items        as select * from public.production_items;
create table if not exists backup_006.bom_items               as select * from public.bom_items;
create table if not exists backup_006.work_order_products     as select * from public.work_order_products;

-- 2) تأكيد عدد الصفوف قبل الحذف (قارنه بعد الحذف مع الـ backup)
select 'standard_products' as t, count(*) from public.standard_products
union all select 'production_items', count(*) from public.production_items
union all select 'bom_items', count(*) from public.bom_items
union all select 'work_order_products', count(*) from public.work_order_products;

-- 3) الحذف (بالترتيب: اللي عنده FK الأول)
drop table if exists public.work_order_products;
drop table if exists public.production_items;
drop table if exists public.bom_items;
drop table if exists public.standard_products;

-- 4) تأكيد إن الجداول اتشالت وإن نسخة الـ backup موجودة
select table_schema, table_name from information_schema.tables
where (table_schema = 'public' and table_name in ('standard_products','production_items','bom_items','work_order_products'))
   or table_schema = 'backup_006';

-- 5) لما تتأكد إن كل حاجة تمام (بعد أسبوع مثلاً) امسح النسخة:
-- drop schema backup_006 cascade;
