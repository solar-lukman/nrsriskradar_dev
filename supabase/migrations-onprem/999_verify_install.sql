-- =====================================================================
-- RiskRadar — On-Premise Post-Install Verification
-- Run AFTER bootstrap AND all application migrations.
-- =====================================================================

\echo '=== 1. Extension check ==='
SELECT extname FROM pg_extension
WHERE extname IN ('pgcrypto','uuid-ossp','pg_trgm','pg_stat_statements','pg_cron','pg_net')
ORDER BY extname;

\echo '=== 2. Required roles ==='
SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role','authenticator')
ORDER BY rolname;

\echo '=== 3. Public tables missing GRANT to authenticated ==='
SELECT c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
ORDER BY c.relname;

\echo '=== 4. Public tables without RLS enabled ==='
SELECT c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY c.relname;

\echo '=== 5. Public tables with RLS but zero policies (locked) ==='
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
GROUP BY c.relname
HAVING count(p.polname) = 0
ORDER BY c.relname;

\echo '=== 6. Critical enums present ==='
SELECT t.typname, count(e.enumlabel) AS labels
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('user_role','risk_status','approval_status','risk_type','risk_category')
GROUP BY t.typname ORDER BY t.typname;

\echo '=== 7. Critical tables present ==='
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('profiles','user_roles','risks','business_continuity_plans',
                     'risk_events','whistleblow_cases','system_audit_logs',
                     'departments','risk_categories','notifications')
ORDER BY table_name;

\echo '=== 8. Row counts (should be zero on a fresh install) ==='
SELECT 'profiles' AS t, count(*) FROM public.profiles
UNION ALL SELECT 'user_roles', count(*) FROM public.user_roles
UNION ALL SELECT 'risks', count(*) FROM public.risks
UNION ALL SELECT 'business_continuity_plans', count(*) FROM public.business_continuity_plans;

\echo '=== Verification complete ==='
