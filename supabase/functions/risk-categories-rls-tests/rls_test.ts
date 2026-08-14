// Automated RLS tests for public.risk_categories
//
// Verifies that ONLY users with the ADMIN role can insert / update / delete
// rows in `risk_categories`, and that all other authenticated users are
// blocked at the database layer (RLS / policy violation).
//
// The tests use the service role to provision two ephemeral users
// (one ADMIN, one non-admin) and then operate as each user via
// short-lived user JWTs. All test artifacts are cleaned up afterwards.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";

// These are live integration tests: they provision real auth users against a
// real project. They are skipped unless RLS_INTEGRATION=1 is set *and* the
// Supabase env vars are present, so `deno test supabase/functions` stays
// hermetic in CI and on developer machines.
const RLS_INTEGRATION_ENABLED =
  Deno.env.get("RLS_INTEGRATION") === "1" &&
  Boolean(SUPABASE_URL && SERVICE_ROLE && ANON_KEY);

if (!RLS_INTEGRATION_ENABLED) {
  console.warn(
    "Skipping risk_categories RLS integration tests (set RLS_INTEGRATION=1 plus SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY to run them).",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type SeededUser = {
  userId: string;
  email: string;
  password: string;
};

async function seedUser(role: "ADMIN" | "RC"): Promise<SeededUser> {
  const email = `rls-${role.toLowerCase()}-${crypto.randomUUID()}@test.local`;
  const password = `T3st!${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const userId = data.user.id;

  // handle_new_user trigger creates a profile row with default role 'USER'.
  // Force the desired role on both profiles and user_roles.
  const { error: pErr } = await admin
    .from("profiles")
    .update({ role })
    .eq("user_id", userId);
  if (pErr) throw pErr;

  const { error: rErr } = await admin
    .from("user_roles")
    .upsert(
      { user_id: userId, role, assigned_by: userId },
      { onConflict: "user_id,role" },
    );
  if (rErr) throw rErr;

  return { userId, email, password };
}

async function clientFor(user: SeededUser) {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return c;
}

async function cleanupUser(userId: string) {
  await admin.from("user_roles").delete().eq("user_id", userId);
  await admin.from("profiles").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}

async function cleanupCategory(name: string) {
  await admin.from("risk_categories").delete().eq("name", name);
}

Deno.test({
  name: "ADMIN can insert / update / delete risk_categories",
  ignore: !RLS_INTEGRATION_ENABLED,
  async fn() {
  const adminUser = await seedUser("ADMIN");
  const adminClient = await clientFor(adminUser);
  const catName = `rls-test-admin-${crypto.randomUUID()}`;

  try {
    const { data: inserted, error: insErr } = await adminClient
      .from("risk_categories")
      .insert({
        name: catName,
        risk_type: "institutional",
        is_active: true,
        display_order: 999,
      })
      .select()
      .single();
    assertEquals(insErr, null, `admin insert should succeed: ${insErr?.message}`);
    assert(inserted?.id, "inserted row should have id");

    const { error: updErr } = await adminClient
      .from("risk_categories")
      .update({ description: "rls-test-updated" })
      .eq("id", inserted!.id);
    assertEquals(updErr, null, `admin update should succeed: ${updErr?.message}`);

    const { error: delErr } = await adminClient
      .from("risk_categories")
      .delete()
      .eq("id", inserted!.id);
    assertEquals(delErr, null, `admin delete should succeed: ${delErr?.message}`);
  } finally {
    await cleanupCategory(catName);
    await cleanupUser(adminUser.userId);
  }
  },
});

Deno.test({
  name: "Non-admin (RC) is blocked from insert / update / delete on risk_categories",
  ignore: !RLS_INTEGRATION_ENABLED,
  async fn() {
  const rcUser = await seedUser("RC");
  const rcClient = await clientFor(rcUser);

  // Seed a row via service role so update/delete have a target.
  const seedName = `rls-test-rc-${crypto.randomUUID()}`;
  const { data: seeded, error: seedErr } = await admin
    .from("risk_categories")
    .insert({
      name: seedName,
      risk_type: "institutional",
      is_active: true,
      display_order: 998,
    })
    .select()
    .single();
  if (seedErr) throw seedErr;

  try {
    // INSERT must be blocked
    const { data: insData, error: insErr } = await rcClient
      .from("risk_categories")
      .insert({
        name: `rls-test-rc-insert-${crypto.randomUUID()}`,
        risk_type: "institutional",
        is_active: true,
      })
      .select();
    assert(
      insErr || (insData?.length ?? 0) === 0,
      "non-admin INSERT should be blocked by RLS",
    );

    // UPDATE must affect 0 rows (RLS USING fails silently for non-matching users)
    const { data: updData, error: updErr } = await rcClient
      .from("risk_categories")
      .update({ description: "should-not-apply" })
      .eq("id", seeded!.id)
      .select();
    assert(
      updErr || (updData?.length ?? 0) === 0,
      "non-admin UPDATE should affect 0 rows under RLS",
    );

    // Verify nothing actually changed
    const { data: after } = await admin
      .from("risk_categories")
      .select("description")
      .eq("id", seeded!.id)
      .single();
    assert(
      after?.description !== "should-not-apply",
      "non-admin UPDATE must not modify the row",
    );

    // DELETE must affect 0 rows
    const { data: delData, error: delErr } = await rcClient
      .from("risk_categories")
      .delete()
      .eq("id", seeded!.id)
      .select();
    assert(
      delErr || (delData?.length ?? 0) === 0,
      "non-admin DELETE should affect 0 rows under RLS",
    );

    const { data: stillThere } = await admin
      .from("risk_categories")
      .select("id")
      .eq("id", seeded!.id)
      .single();
    assert(stillThere?.id === seeded!.id, "row must still exist after non-admin delete attempt");
  } finally {
    await cleanupCategory(seedName);
    await cleanupUser(rcUser.userId);
  }
  },
});
