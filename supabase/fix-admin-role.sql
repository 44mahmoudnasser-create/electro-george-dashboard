-- ============================================================
-- STEP 1: Check current users and their roles
-- ============================================================
SELECT u.id, u.email, au.role
FROM auth.users u
LEFT JOIN public.app_users au ON au.id = u.id
ORDER BY u.created_at;

-- ============================================================
-- STEP 2: If app_users row is missing for your account,
--         insert it manually (replace the email below):
-- ============================================================
-- INSERT INTO public.app_users (id, email, role)
-- SELECT id, email, 'admin'
-- FROM auth.users
-- WHERE email = 'YOUR_EMAIL_HERE'
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- ============================================================
-- STEP 3: Set your account as admin (replace email):
-- ============================================================
UPDATE public.app_users
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL_HERE'
);

-- ============================================================
-- STEP 4: Verify
-- ============================================================
SELECT u.email, au.role
FROM auth.users u
JOIN public.app_users au ON au.id = u.id;
