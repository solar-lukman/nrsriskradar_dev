-- ============================================================================
-- Demo user seed for on-prem deployments
-- ----------------------------------------------------------------------------
-- Creates 11 role-based demo accounts that back the "Quick Demo Access" tiles
-- on the login page. Idempotent: safe to run multiple times.
--
-- Shared password (all accounts): NrsDemo2026!
--
-- Run against your on-prem Postgres as a superuser, e.g.:
--   sudo docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     < 002_seed_demo_users.sql
-- ============================================================================

BEGIN;

-- pgcrypto provides crypt() / gen_salt() for the bcrypt password hash
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $seed$
DECLARE
  demo_password TEXT := 'NrsDemo2026!';
  rec RECORD;
  v_user_id UUID;
  v_encrypted TEXT;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('rc@nrs-test.local',         'Risk Champion (Demo)',      'RC'),
      ('rr@nrs-test.local',         'Risk Reviewer (Demo)',      'RR'),
      ('ro@nrs-test.local',         'Risk Owner (Demo)',         'RO'),
      ('rmd@nrs-test.local',        'Risk Mgmt Dept (Demo)',     'RMD'),
      ('cro@nrs-test.local',        'Chief Risk Officer (Demo)', 'CRO'),
      ('ec@nrs-test.local',         'Executive Chairman (Demo)', 'EC'),
      ('ermsc@nrs-test.local',      'ERM Steering (Demo)',       'ERMSC'),
      ('rcb@nrs-test.local',        'Board Risk Cmte (Demo)',    'RCB'),
      ('supervisor@nrs-test.local', 'Supervisor (Demo)',         'SUPERVISOR'),
      ('admin@nrs-test.local',      'Administrator (Demo)',      'ADMIN'),
      ('user@nrs-test.local',       'General User (Demo)',       'USER')
    ) AS t(email, full_name, role_code)
  LOOP
    v_encrypted := crypt(demo_password, gen_salt('bf'));

    -- 1) auth.users -- create if missing, otherwise reset the password + confirm email
    SELECT id INTO v_user_id FROM auth.users WHERE email = rec.email;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change, email_change_token_new, email_change_token_current
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        rec.email,
        v_encrypted,
        now(),
        jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', rec.full_name, 'role', rec.role_code),
        now(), now(), '', '', '', '', ''
      );

      -- auth.identities is required for password sign-in on modern GoTrue
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', rec.email, 'email_verified', true),
        'email',
        v_user_id::text,
        now(), now(), now()
      )
      ON CONFLICT DO NOTHING;
    ELSE
      UPDATE auth.users
      SET encrypted_password  = v_encrypted,
          email_confirmed_at  = COALESCE(email_confirmed_at, now()),
          updated_at          = now(),
          raw_user_meta_data  = COALESCE(raw_user_meta_data, '{}'::jsonb)
                                || jsonb_build_object('full_name', rec.full_name, 'role', rec.role_code)
      WHERE id = v_user_id;
    END IF;

    -- 2) public.profiles -- upsert with the correct role
    INSERT INTO public.profiles (user_id, email, full_name, role)
    VALUES (v_user_id, rec.email, rec.full_name, rec.role_code::public.user_role)
    ON CONFLICT (user_id) DO UPDATE
      SET email     = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          role      = EXCLUDED.role;

    -- 3) public.user_roles -- ensure the role row exists
    -- assigned_by is NOT NULL; self-assign for the demo seed
    INSERT INTO public.user_roles (user_id, role, assigned_by)
    VALUES (v_user_id, rec.role_code::public.user_role, v_user_id)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END
$seed$;

COMMIT;

-- Verify
SELECT p.email, p.role AS profile_role, ur.role AS user_role, u.email_confirmed_at IS NOT NULL AS confirmed
FROM public.profiles p
JOIN auth.users u ON u.id = p.user_id
LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
WHERE p.email LIKE '%@nrs-test.local'
ORDER BY p.email;
