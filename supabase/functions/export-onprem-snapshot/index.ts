// Admin-only edge function: dumps every application table to NDJSON files
// in the private `onprem-exports` storage bucket, plus a manifest with
// signed download URLs (1-hour TTL). Bypasses RLS via service role.
//
// Auth: caller must have a valid JWT AND profiles.role = 'ADMIN'.
// Every invocation is written to system_audit_logs (data_export / high).

import { createClient } from "npm:@supabase/supabase-js@2";

import { buildCors } from "../_shared/cors.ts";
// FK-safe order: lookups → identity → risks → dependents → audit/logs
const TABLES: string[] = [
  // lookups & config
  "departments",
  "risk_categories",
  "strategic_objectives",
  "risk_scoring_matrix",
  "risk_appetite_config",
  "treatment_strategy_status_map",
  "system_settings",
  "number_sequences",
  "assessment_templates",
  "template_sections",
  "template_questions",
  "template_category_links",
  // identity
  "profiles",
  "user_roles",
  "notification_preferences",
  // core risk
  "risks",
  "risk_assessments",
  "risk_controls",
  "risk_mitigation_tasks",
  "risk_mitigation_task_history",
  "risk_attachments",
  "risk_events",
  "risk_history",
  "approval_history",
  // bcp
  "business_continuity_plans",
  "bcp_version_history",
  "recovery_checklists",
  // documents & forum
  "control_documents",
  "document_acknowledgments",
  "forum_categories",
  "forum_discussions",
  "forum_posts",
  "forum_votes",
  "forum_moderation_logs",
  "training_modules",
  // whistleblow (PII-sensitive; can be excluded)
  "whistleblow_cases",
  "whistleblow_messages",
  "whistleblow_audit_log",
  // reports & backups
  "report_schedules",
  "board_report_archives",
  "backup_configurations",
  "backup_logs",
  "backup_restore_operations",
  // ai
  "ai_predictions",
  // notifications
  "notifications",
  // audit tails (last so any earlier writes are captured)
  "risk_audit_logs",
  "risk_category_audit_logs",
  "bcp_audit_logs",
  "bcp_schema_check_logs",
  "user_activity_logs",
  "user_login_history",
  "auth_failed_attempts",
  "system_audit_logs",
];

const WHISTLEBLOW_TABLES = new Set([
  "whistleblow_cases",
  "whistleblow_messages",
  "whistleblow_audit_log",
]);

const PAGE = 1000;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const BUCKET = "onprem-exports";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const jwt = authHeader.replace("Bearer ", "");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } =
      await userClient.auth.getClaims(jwt);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(url, service, {
      auth: { persistSession: false },
    });

    // Verify ADMIN
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile || profile.role !== "ADMIN") {
      return json({ error: "Forbidden: ADMIN role required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const excludeWhistleblow: boolean = !!body.excludeWhistleblow;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const prefix = `${stamp}`;
    const results: Array<{ table: string; rows: number; path: string }> = [];

    const tables = TABLES.filter(
      (t) => !(excludeWhistleblow && WHISTLEBLOW_TABLES.has(t)),
    );

    for (const table of tables) {
      let from = 0;
      let total = 0;
      const chunks: string[] = [];
      // page through
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await admin
          .from(table)
          .select("*")
          .range(from, from + PAGE - 1);
        if (error) {
          console.error(`Failed to read ${table}:`, error.message);
          return json(
            { error: `Failed to read ${table}: ${error.message}` },
            500,
          );
        }
        if (!data || data.length === 0) break;
        for (const row of data) chunks.push(JSON.stringify(row));
        total += data.length;
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const path = `${prefix}/${table}.ndjson`;
      const body = chunks.length ? chunks.join("\n") + "\n" : "";
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, new Blob([body], { type: "application/x-ndjson" }), {
          upsert: true,
          contentType: "application/x-ndjson",
        });
      if (upErr) {
        return json(
          { error: `Failed to upload ${table}: ${upErr.message}` },
          500,
        );
      }
      results.push({ table, rows: total, path });
    }

    // auth.users minimal export
    const { data: authUsers, error: auErr } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 10000 });
    if (auErr) {
      return json({ error: `Failed to list auth users: ${auErr.message}` }, 500);
    }
    const authNdjson = (authUsers?.users ?? [])
      .map((u) =>
        JSON.stringify({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          email_confirmed_at: u.email_confirmed_at,
          raw_user_meta_data: u.user_metadata ?? {},
          raw_app_meta_data: u.app_metadata ?? {},
        }),
      )
      .join("\n");
    const authPath = `${prefix}/auth_users.ndjson`;
    await admin.storage
      .from(BUCKET)
      .upload(authPath, new Blob([authNdjson], { type: "application/x-ndjson" }), {
        upsert: true,
        contentType: "application/x-ndjson",
      });
    results.push({
      table: "auth_users",
      rows: authUsers?.users?.length ?? 0,
      path: authPath,
    });

    // manifest
    const manifest = {
      exported_at: new Date().toISOString(),
      exported_by: userId,
      exclude_whistleblow: excludeWhistleblow,
      table_order: results.map((r) => r.table),
      row_counts: Object.fromEntries(results.map((r) => [r.table, r.rows])),
      notes: [
        "Passwords are NOT exported. Users must reset via GoTrue password-reset on first on-prem login.",
        "Storage bucket files (risk-attachments etc.) are not included in this snapshot.",
        "Load order matches table_order. Wrap loader in SET session_replication_role = replica; to defer FK checks.",
      ],
    };
    const manifestPath = `${prefix}/manifest.json`;
    await admin.storage
      .from(BUCKET)
      .upload(
        manifestPath,
        new Blob([JSON.stringify(manifest, null, 2)], {
          type: "application/json",
        }),
        { upsert: true, contentType: "application/json" },
      );

    // signed URLs
    const paths = [...results.map((r) => r.path), manifestPath];
    const { data: signed, error: sErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (sErr) {
      return json({ error: `Failed to sign URLs: ${sErr.message}` }, 500);
    }

    // audit log
    await admin.rpc("log_system_audit", {
      p_user_id: userId,
      p_action: "onprem_snapshot_exported",
      p_category: "data_export",
      p_resource_type: "database",
      p_resource_id: null,
      p_details: {
        prefix,
        tables: results.length,
        total_rows: results.reduce((s, r) => s + r.rows, 0),
        exclude_whistleblow: excludeWhistleblow,
      },
      p_severity: "high",
    });

    return json({
      prefix,
      manifest_path: manifestPath,
      results,
      signed_urls: signed,
      expires_in_seconds: SIGNED_URL_TTL_SECONDS,
    });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});


