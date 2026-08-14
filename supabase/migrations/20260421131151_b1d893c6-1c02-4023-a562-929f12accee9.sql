-- Step 1: Enum additions only. Must commit before values can be referenced.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='user_role' AND e.enumlabel='SUPERVISOR') THEN
    ALTER TYPE public.user_role ADD VALUE 'SUPERVISOR';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='risk_type') THEN
    CREATE TYPE public.risk_type AS ENUM ('institutional', 'compliance');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='risk_status' AND e.enumlabel='Crystallized') THEN
    ALTER TYPE public.risk_status ADD VALUE 'Crystallized';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='risk_status' AND e.enumlabel='Draft') THEN
    ALTER TYPE public.risk_status ADD VALUE 'Draft';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='risk_status' AND e.enumlabel='Submitted') THEN
    ALTER TYPE public.risk_status ADD VALUE 'Submitted';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
                 WHERE t.typname='risk_status' AND e.enumlabel='Approved') THEN
    ALTER TYPE public.risk_status ADD VALUE 'Approved';
  END IF;
END $$;