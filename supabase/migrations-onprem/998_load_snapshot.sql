-- =====================================================================
-- RiskRadar — On-Premise Data Loader
-- Loads a snapshot exported by the `export-onprem-snapshot` edge function.
--
-- USAGE
--   1. Run bootstrap + application migrations first
--      (000_bootstrap_prereqs.sql then supabase/migrations/*.sql,
--       or the bundled riskradar-onprem.sql).
--   2. Download the snapshot folder from the onprem-exports bucket.
--      It contains manifest.json, <table>.ndjson files, and auth_users.ndjson.
--   3. Convert each *.ndjson to CSV in the same directory. Requires `jq`:
--        for f in *.ndjson; do
--          jq -r '[.[]] | @csv' "$f" > "${f%.ndjson}.csv"
--        done
--      (Or use any equivalent tool that produces a header-less CSV
--       matching the target table's column order — see manifest.json.)
--   4. Place the CSVs in a directory readable by the psql client, e.g.
--      /var/lib/riskradar/snapshot/, and set :snapshot_dir below.
--   5. Run this file with psql from that directory:
--        cd /var/lib/riskradar/snapshot
--        psql -v ON_ERROR_STOP=1 -v snapshot_dir=`pwd` \
--             -f /path/to/998_load_snapshot.sql
--   6. Then run 999_verify_install.sql.
--
-- NOTES
--   - Passwords are NOT restored. Seed auth.users from auth_users.csv via
--     your GoTrue admin API or SQL insert, then trigger a password-reset
--     email for every user on first login.
--   - session_replication_role = replica is used so FK checks defer until
--     COMMIT; ensures cross-table loads succeed regardless of order drift.
--   - Sequences are reset at the end for tables with SERIAL/IDENTITY.
-- =====================================================================

\set ON_ERROR_STOP on
\set snapshot_dir `echo ${snapshot_dir:-$PWD}`

BEGIN;

SET session_replication_role = replica;

-- Lookups & config -----------------------------------------------------
\copy public.departments FROM :'snapshot_dir'/departments.csv CSV
\copy public.risk_categories FROM :'snapshot_dir'/risk_categories.csv CSV
\copy public.strategic_objectives FROM :'snapshot_dir'/strategic_objectives.csv CSV
\copy public.risk_scoring_matrix FROM :'snapshot_dir'/risk_scoring_matrix.csv CSV
\copy public.risk_appetite_config FROM :'snapshot_dir'/risk_appetite_config.csv CSV
\copy public.treatment_strategy_status_map FROM :'snapshot_dir'/treatment_strategy_status_map.csv CSV
\copy public.system_settings FROM :'snapshot_dir'/system_settings.csv CSV
\copy public.number_sequences FROM :'snapshot_dir'/number_sequences.csv CSV
\copy public.assessment_templates FROM :'snapshot_dir'/assessment_templates.csv CSV
\copy public.template_sections FROM :'snapshot_dir'/template_sections.csv CSV
\copy public.template_questions FROM :'snapshot_dir'/template_questions.csv CSV
\copy public.template_category_links FROM :'snapshot_dir'/template_category_links.csv CSV

-- Identity -------------------------------------------------------------
-- auth.users MUST be seeded before profiles (FK).
-- Use auth_users.csv via GoTrue admin API, or a bespoke insert into
-- auth.users. Uncomment the line below only if you know your Postgres
-- role can write to auth.users directly.
-- \copy auth.users(id,email,created_at,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) FROM :'snapshot_dir'/auth_users.csv CSV

\copy public.profiles FROM :'snapshot_dir'/profiles.csv CSV
\copy public.user_roles FROM :'snapshot_dir'/user_roles.csv CSV
\copy public.notification_preferences FROM :'snapshot_dir'/notification_preferences.csv CSV

-- Core risk ------------------------------------------------------------
\copy public.risks FROM :'snapshot_dir'/risks.csv CSV
\copy public.risk_assessments FROM :'snapshot_dir'/risk_assessments.csv CSV
\copy public.risk_controls FROM :'snapshot_dir'/risk_controls.csv CSV
\copy public.risk_mitigation_tasks FROM :'snapshot_dir'/risk_mitigation_tasks.csv CSV
\copy public.risk_mitigation_task_history FROM :'snapshot_dir'/risk_mitigation_task_history.csv CSV
\copy public.risk_attachments FROM :'snapshot_dir'/risk_attachments.csv CSV
\copy public.risk_events FROM :'snapshot_dir'/risk_events.csv CSV
\copy public.risk_history FROM :'snapshot_dir'/risk_history.csv CSV
\copy public.approval_history FROM :'snapshot_dir'/approval_history.csv CSV

-- BCP ------------------------------------------------------------------
\copy public.business_continuity_plans FROM :'snapshot_dir'/business_continuity_plans.csv CSV
\copy public.bcp_version_history FROM :'snapshot_dir'/bcp_version_history.csv CSV
\copy public.recovery_checklists FROM :'snapshot_dir'/recovery_checklists.csv CSV

-- Documents & forum ----------------------------------------------------
\copy public.control_documents FROM :'snapshot_dir'/control_documents.csv CSV
\copy public.document_acknowledgments FROM :'snapshot_dir'/document_acknowledgments.csv CSV
\copy public.forum_categories FROM :'snapshot_dir'/forum_categories.csv CSV
\copy public.forum_discussions FROM :'snapshot_dir'/forum_discussions.csv CSV
\copy public.forum_posts FROM :'snapshot_dir'/forum_posts.csv CSV
\copy public.forum_votes FROM :'snapshot_dir'/forum_votes.csv CSV
\copy public.forum_moderation_logs FROM :'snapshot_dir'/forum_moderation_logs.csv CSV
\copy public.training_modules FROM :'snapshot_dir'/training_modules.csv CSV

-- Whistleblow (skip these three lines if snapshot was exported with excludeWhistleblow)
\copy public.whistleblow_cases FROM :'snapshot_dir'/whistleblow_cases.csv CSV
\copy public.whistleblow_messages FROM :'snapshot_dir'/whistleblow_messages.csv CSV
\copy public.whistleblow_audit_log FROM :'snapshot_dir'/whistleblow_audit_log.csv CSV

-- Reports & backups ----------------------------------------------------
\copy public.report_schedules FROM :'snapshot_dir'/report_schedules.csv CSV
\copy public.board_report_archives FROM :'snapshot_dir'/board_report_archives.csv CSV
\copy public.backup_configurations FROM :'snapshot_dir'/backup_configurations.csv CSV
\copy public.backup_logs FROM :'snapshot_dir'/backup_logs.csv CSV
\copy public.backup_restore_operations FROM :'snapshot_dir'/backup_restore_operations.csv CSV

-- AI -------------------------------------------------------------------
\copy public.ai_predictions FROM :'snapshot_dir'/ai_predictions.csv CSV

-- Notifications --------------------------------------------------------
\copy public.notifications FROM :'snapshot_dir'/notifications.csv CSV

-- Audit tails ----------------------------------------------------------
\copy public.risk_audit_logs FROM :'snapshot_dir'/risk_audit_logs.csv CSV
\copy public.risk_category_audit_logs FROM :'snapshot_dir'/risk_category_audit_logs.csv CSV
\copy public.bcp_audit_logs FROM :'snapshot_dir'/bcp_audit_logs.csv CSV
\copy public.bcp_schema_check_logs FROM :'snapshot_dir'/bcp_schema_check_logs.csv CSV
\copy public.user_activity_logs FROM :'snapshot_dir'/user_activity_logs.csv CSV
\copy public.user_login_history FROM :'snapshot_dir'/user_login_history.csv CSV
\copy public.auth_failed_attempts FROM :'snapshot_dir'/auth_failed_attempts.csv CSV
\copy public.system_audit_logs FROM :'snapshot_dir'/system_audit_logs.csv CSV

SET session_replication_role = DEFAULT;

-- Reset sequences owned by any of the loaded tables so future inserts
-- don't collide with imported primary keys.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           c.relname AS seq_name,
           dep.refobjid::regclass AS owning_table,
           a.attname AS owning_column
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_depend dep ON dep.objid = c.oid AND dep.deptype = 'a'
    JOIN pg_attribute a ON a.attrelid = dep.refobjid AND a.attnum = dep.refobjsubid
    WHERE c.relkind = 'S' AND n.nspname = 'public'
  LOOP
    EXECUTE format(
      'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %s), 1))',
      r.schema_name || '.' || r.seq_name,
      r.owning_column,
      r.owning_table
    );
  END LOOP;
END $$;

COMMIT;

\echo '=== Snapshot load complete. Run 999_verify_install.sql next. ==='
