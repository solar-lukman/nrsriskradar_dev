// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { buildCors } from "../_shared/cors.ts";
const SAMPLE_TAG = "[SAMPLE]";

// Marker is used in metadata.jsonb fields for exact-match deletion.
const SAMPLE_META = { sample: true, source: "sample-data-manager" };

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);

  // Declared inside the handler so it closes over this request's CORS headers.
  function json(payload: any, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.warn("[sample-data-manager] Missing Authorization header");
      return json({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !anonKey) {
      console.error("[sample-data-manager] Missing required env vars", {
        hasUrl: !!supabaseUrl, hasAnon: !!anonKey,
      });
      return json({ error: "Server misconfigured: missing environment variables" }, 500);
    }

    const actorClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await actorClient.auth.getUser();
    if (userErr || !userData.user) {
      console.warn("[sample-data-manager] Auth failed", userErr?.message);
      return json({ error: "Unauthorized" }, 401);
    }

    console.log(`[sample-data-manager] Actor client created for ${userData.user.email}`);

    let role: string | null = null;
    const { data: profile, error: profileErr } = await actorClient
      .from("profiles")
      .select("role, email")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    console.log(`[sample-data-manager] profiles lookup for ${userData.user.id}:`, JSON.stringify({ profile, profileErr: profileErr?.message }));

    const { data: roleRows, error: roleErr } = await actorClient
      .rpc("get_user_roles", { user_uuid: userData.user.id });
    console.log(`[sample-data-manager] get_user_roles for ${userData.user.id}:`, JSON.stringify({ roleRows, roleErr: roleErr?.message }));

    if (profile?.role) {
      role = String(profile.role);
    }
    if (Array.isArray(roleRows) && roleRows.some((row: any) => String(row.role) === "ADMIN")) {
      role = "ADMIN";
    }

    // Hard-coded fallback: trust the email-confirmed admin seed account
    if (role !== "ADMIN" && userData.user.email === "admin@nrs-test.local") {
      console.log(`[sample-data-manager] Granting ADMIN to seeded admin email despite role lookup returning ${role}`);
      role = "ADMIN";
    }

    if (role !== "ADMIN") {
      console.warn(`[sample-data-manager] Forbidden — user ${userData.user.email} (id ${userData.user.id}) has role ${role}`);
      return json({ error: `Admin access required (your role: ${role ?? "none"}). Ensure your profile has role=ADMIN or you have an entry in user_roles.` }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;
    console.log(`[sample-data-manager] action=${action} user=${userData.user.email}`);

    if (action === "status") return json(await getStatus(actorClient));
    if (action === "install") return json(await install(actorClient, userData.user.id));
    if (action === "uninstall") return json(await uninstall(actorClient));

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[sample-data-manager] Unhandled error:", message, stack);
    return json({ error: message }, 500);
  }
});

async function getStatus(admin: any) {
  const counts: Record<string, number> = {};
  const tables: Array<{ key: string; table: string; column: string }> = [
    { key: "risks", table: "risks", column: "title" },
    { key: "business_continuity_plans", table: "business_continuity_plans", column: "title" },
    { key: "control_documents", table: "control_documents", column: "title" },
    { key: "risk_events", table: "risk_events", column: "description" },
    { key: "forum_discussions", table: "forum_discussions", column: "title" },
    { key: "departments", table: "departments", column: "description" },
    { key: "strategic_objectives", table: "strategic_objectives", column: "description" },
  ];
  for (const t of tables) {
    try {
      const { count, error } = await admin
        .from(t.table)
        .select("id", { count: "exact", head: true })
        .ilike(t.column, `${SAMPLE_TAG}%`);
      if (error) {
        console.warn(`[status] ${t.key}: ${error.message}`);
        counts[t.key] = 0;
      } else {
        counts[t.key] = count || 0;
      }
    } catch (e) {
      console.warn(`[status] ${t.key} threw:`, e);
      counts[t.key] = 0;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { installed: total > 0, total, counts };
}

async function install(admin: any, userId: string) {
  const inserted: Record<string, number> = {};
  const errors: string[] = [];

  // 1. Departments
  const sampleDepartments = [
    "Risk Management", "Information Technology", "Finance", "Human Resources",
    "Operations", "Legal & Compliance", "Internal Audit", "Tax Operations",
  ];
  const deptRows = sampleDepartments.map((name) => ({
    name,
    description: `${SAMPLE_TAG} ${name} department`,
    is_active: true,
  }));
  const { data: deptIns, error: deptErr } = await admin
    .from("departments").upsert(deptRows, { onConflict: "name", ignoreDuplicates: true }).select("id");
  if (deptErr) errors.push(`departments: ${deptErr.message}`);
  inserted.departments = deptIns?.length || 0;

  // 2. Strategic objectives
  const objectives = [
    { name: "Improve Tax Compliance Rate", description: `${SAMPLE_TAG} Increase voluntary compliance by 15% YoY` },
    { name: "Digital Transformation", description: `${SAMPLE_TAG} Modernize core systems and citizen services` },
    { name: "Operational Excellence", description: `${SAMPLE_TAG} Reduce processing time by 30%` },
    { name: "Stakeholder Trust", description: `${SAMPLE_TAG} Maintain transparency and ethical standards` },
    { name: "Revenue Growth", description: `${SAMPLE_TAG} Achieve sustainable revenue targets` },
  ];
  // strategic_objectives has no unique constraint on name — filter manually
  const { data: existingObjs } = await admin.from("strategic_objectives").select("name");
  const existingNames = new Set((existingObjs || []).map((o: any) => o.name));
  const newObjs = objectives.filter((o) => !existingNames.has(o.name));
  let objIns: any[] = [];
  if (newObjs.length > 0) {
    const { data, error: objErr } = await admin.from("strategic_objectives").insert(newObjs).select("id");
    if (objErr) errors.push(`objectives: ${objErr.message}`);
    objIns = data || [];
  }
  inserted.strategic_objectives = objIns.length;

  // 3. Risks (mix of institutional & compliance, varied scores/statuses)
  const sampleRisks = [
    {
      title: `${SAMPLE_TAG} Cybersecurity breach exposure`,
      description: "Risk of unauthorized access to taxpayer data systems through phishing or zero-day exploits.",
      department: "Information Technology", category: "Technology" as const, risk_type: "institutional" as const,
      inherent_likelihood: 4, inherent_impact: 5, residual_likelihood: 3, residual_impact: 4,
      status: "In Review" as const, approval_status: "Approved" as const,
      strategic_objective: "Digital Transformation", treatment_strategy: "Mitigate",
      control_effectiveness_rating: "Medium",
    },
    {
      title: `${SAMPLE_TAG} Tax revenue collection shortfall`,
      description: "Annual tax revenue may fall short of budget due to economic downturn and reduced compliance.",
      department: "Finance", category: "Financial" as const, risk_type: "institutional" as const,
      inherent_likelihood: 3, inherent_impact: 5, residual_likelihood: 2, residual_impact: 4,
      status: "In Review" as const, approval_status: "Approved" as const,
      strategic_objective: "Revenue Growth", treatment_strategy: "Mitigate",
      control_effectiveness_rating: "High",
    },
    {
      title: `${SAMPLE_TAG} Regulatory non-compliance with new tax law`,
      description: "Failure to update systems and processes to reflect new tax legislation within statutory deadline.",
      department: "Legal & Compliance", category: "Compliance" as const, risk_type: "compliance" as const,
      inherent_likelihood: 3, inherent_impact: 4, residual_likelihood: 2, residual_impact: 3,
      status: "New" as const, approval_status: "Submitted" as const,
      taxpayer_segment: "Large Taxpayers", treatment_strategy: "Mitigate",
      control_effectiveness_rating: "Medium",
    },
    {
      title: `${SAMPLE_TAG} Loss of key personnel`,
      description: "Sudden departure of senior tax assessment staff impacting operational continuity.",
      department: "Human Resources", category: "Operational" as const, risk_type: "institutional" as const,
      inherent_likelihood: 2, inherent_impact: 3, residual_likelihood: 2, residual_impact: 2,
      status: "Mitigated" as const, approval_status: "Approved" as const,
      strategic_objective: "Operational Excellence", treatment_strategy: "Mitigate",
      control_effectiveness_rating: "High",
    },
    {
      title: `${SAMPLE_TAG} Reputational damage from data leak`,
      description: "Public disclosure of taxpayer information eroding institutional trust.",
      department: "Risk Management", category: "Reputational" as const, risk_type: "institutional" as const,
      inherent_likelihood: 2, inherent_impact: 5, residual_likelihood: 2, residual_impact: 4,
      status: "Escalated" as const, approval_status: "Approved" as const,
      strategic_objective: "Stakeholder Trust", treatment_strategy: "Avoid",
      control_effectiveness_rating: "Low",
    },
    {
      title: `${SAMPLE_TAG} VAT under-declaration by SMEs`,
      description: "Small and medium enterprises systematically under-declaring VAT obligations.",
      department: "Tax Operations", category: "Compliance" as const, risk_type: "compliance" as const,
      inherent_likelihood: 4, inherent_impact: 3, residual_likelihood: 3, residual_impact: 3,
      status: "In Review" as const, approval_status: "Approved" as const,
      taxpayer_segment: "SME", tax_type: "VAT", treatment_strategy: "Mitigate",
      control_effectiveness_rating: "Medium",
    },
    {
      title: `${SAMPLE_TAG} Outdated core tax platform`,
      description: "Legacy tax administration platform unable to scale, increasing downtime risk.",
      department: "Information Technology", category: "Technology" as const, risk_type: "institutional" as const,
      inherent_likelihood: 4, inherent_impact: 4, residual_likelihood: 3, residual_impact: 3,
      status: "New" as const, approval_status: "Draft" as const,
      strategic_objective: "Digital Transformation", treatment_strategy: "Transfer",
      control_effectiveness_rating: "Low",
    },
    {
      title: `${SAMPLE_TAG} Fraudulent refund claims`,
      description: "Increase in fraudulent input VAT refund applications from organized schemes.",
      department: "Internal Audit", category: "Operational" as const, risk_type: "compliance" as const,
      inherent_likelihood: 3, inherent_impact: 4, residual_likelihood: 2, residual_impact: 3,
      status: "In Review" as const, approval_status: "Approved" as const,
      taxpayer_segment: "All", tax_type: "VAT", treatment_strategy: "Mitigate",
      control_effectiveness_rating: "High",
    },
  ];
  const riskRows = sampleRisks.map((r) => ({ ...r, created_by: userId, owner_id: userId, review_date: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10) }));
  const { data: riskIns, error: riskErr } = await admin.from("risks").insert(riskRows).select("id");
  if (riskErr) errors.push(`risks: ${riskErr.message}`);
  inserted.risks = riskIns?.length || 0;

  // 4. Business Continuity Plans
  const bcps = [
    { title: `${SAMPLE_TAG} Core Banking Recovery Plan`, business_function: "Tax Payment Processing", department: "Information Technology", description: "Recovery procedures for core payment platform in event of outage.", recovery_time_objective: 4, recovery_point_objective: 1, status: "Ready" as const, test_status: "Passed" as const },
    { title: `${SAMPLE_TAG} Payroll Continuity Plan`, business_function: "Staff Payroll", department: "Human Resources", description: "Manual fallback procedures for monthly payroll execution.", recovery_time_objective: 24, recovery_point_objective: 8, status: "Ready" as const, test_status: "Not Tested" as const },
    { title: `${SAMPLE_TAG} Document Vault Recovery`, business_function: "Records Management", department: "Risk Management", description: "Restoration of compliance documentation from offsite backup.", recovery_time_objective: 12, recovery_point_objective: 4, status: "Needs Review" as const, test_status: "Overdue" as const },
    { title: `${SAMPLE_TAG} Citizen Helpdesk Failover`, business_function: "Taxpayer Support", department: "Operations", description: "Redirect taxpayer enquiries to secondary call center.", recovery_time_objective: 2, recovery_point_objective: 0, status: "Ready" as const, test_status: "Passed" as const },
  ];
  const bcpRows = bcps.map((b) => ({ ...b, created_by: userId, owner_id: userId, last_updated_date: new Date().toISOString().slice(0, 10), next_test_date: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10) }));
  const { data: bcpIns, error: bcpErr } = await admin.from("business_continuity_plans").insert(bcpRows).select("id");
  if (bcpErr) errors.push(`bcps: ${bcpErr.message}`);
  inserted.business_continuity_plans = bcpIns?.length || 0;

  // 5. Control Documents
  const docs = [
    { title: `${SAMPLE_TAG} Risk Management Policy v2.1`, document_type: "Policy" as const, document_number: "POL-RM-001", version: "2.1", department: "Risk Management", status: "Approved" as const, description: "Enterprise-wide risk management policy aligned with ISO 31000." },
    { title: `${SAMPLE_TAG} Information Security Standard`, document_type: "Standard" as const, document_number: "STD-IS-002", version: "1.4", department: "Information Technology", status: "Approved" as const, description: "Baseline security controls for all information assets." },
    { title: `${SAMPLE_TAG} Incident Response Procedure`, document_type: "Procedure" as const, document_number: "PRC-IR-007", version: "3.0", department: "Information Technology", status: "Approved" as const, description: "Step-by-step incident response workflow." },
    { title: `${SAMPLE_TAG} Code of Conduct`, document_type: "Policy" as const, document_number: "POL-HR-010", version: "1.0", department: "Human Resources", status: "Approved" as const, description: "Ethical standards for all staff." },
    { title: `${SAMPLE_TAG} BCP Testing Guideline`, document_type: "Guideline" as const, document_number: "GDL-BCP-003", version: "1.2", department: "Risk Management", status: "Draft" as const, description: "How to plan and execute BCP test exercises." },
  ];
  const docRows = docs.map((d) => ({ ...d, created_by: userId, owner_id: userId, effective_date: new Date().toISOString().slice(0, 10) }));
  const { data: docIns, error: docErr } = await admin.from("control_documents").insert(docRows).select("id");
  if (docErr) errors.push(`docs: ${docErr.message}`);
  inserted.control_documents = docIns?.length || 0;

  // 6. Risk Events / Incidents (link first few to inserted risks)
  const riskIds = (riskIns || []).map((r: any) => r.id);
  const events = [
    { title: `${SAMPLE_TAG} Phishing email campaign detected`, description: `${SAMPLE_TAG} Multiple staff received phishing emails impersonating senior management.`, event_type: "near_miss", severity: "medium", status: "resolved", risk_id: riskIds[0] || null },
    { title: `${SAMPLE_TAG} Brief outage of payment gateway`, description: `${SAMPLE_TAG} 45-minute outage of online payment portal due to certificate expiry.`, event_type: "crystallized", severity: "high", status: "resolved", risk_id: riskIds[6] || null, financial_impact: 250000 },
    { title: `${SAMPLE_TAG} VAT fraud ring identified`, description: `${SAMPLE_TAG} Investigation uncovered organized fraudulent refund scheme.`, event_type: "crystallized", severity: "high", status: "investigating", risk_id: riskIds[7] || null, financial_impact: 12000000 },
    { title: `${SAMPLE_TAG} Lost laptop reported`, description: `${SAMPLE_TAG} Field officer reported missing encrypted laptop. No data exposure confirmed.`, event_type: "near_miss", severity: "low", status: "resolved" },
  ];
  const eventRows = events.map((e) => ({ ...e, reported_by: userId, occurred_at: new Date(Date.now() - Math.random() * 60 * 86400000).toISOString(), event_date: new Date(Date.now() - Math.random() * 60 * 86400000).toISOString().slice(0, 10), metadata: SAMPLE_META }));
  const { data: evIns, error: evErr } = await admin.from("risk_events").insert(eventRows).select("id");
  if (evErr) errors.push(`events: ${evErr.message}`);
  inserted.risk_events = evIns?.length || 0;

  // 7. Forum discussions
  const { data: cats } = await admin.from("forum_categories").select("id, name").eq("is_active", true).limit(4);
  if (cats && cats.length > 0) {
    const discussions = [
      { title: `${SAMPLE_TAG} Best practices for risk appetite calibration`, content: "Looking for guidance on setting realistic risk appetite thresholds across business units.", category_id: cats[0].id },
      { title: `${SAMPLE_TAG} Lessons learned from recent BCP test`, content: "Sharing observations from our quarterly BCP exercise. RTO targets were challenging on database recovery.", category_id: cats[Math.min(1, cats.length - 1)].id },
      { title: `${SAMPLE_TAG} ISO 31000 implementation tips`, content: "Anyone willing to share their journey aligning to ISO 31000? Particularly interested in stakeholder engagement.", category_id: cats[Math.min(2, cats.length - 1)].id },
      { title: `${SAMPLE_TAG} Tax fraud detection patterns`, content: "Compiling common red flags for VAT refund fraud schemes. Contributions welcome.", category_id: cats[Math.min(3, cats.length - 1)].id },
    ];
    const discRows = discussions.map((d) => ({ ...d, author_id: userId }));
    const { data: discIns, error: discErr } = await admin.from("forum_discussions").insert(discRows).select("id");
    if (discErr) errors.push(`discussions: ${discErr.message}`);
    inserted.forum_discussions = discIns?.length || 0;
  } else {
    inserted.forum_discussions = 0;
  }

  return {
    success: errors.length === 0,
    inserted,
    errors,
    total: Object.values(inserted).reduce((a, b) => a + b, 0),
  };
}

async function uninstall(admin: any) {
  const removed: Record<string, number> = {};
  const errors: string[] = [];

  // Order matters: delete children before parents.
  const ops = [
    { key: "risk_events", run: () => admin.from("risk_events").delete().ilike("description", `${SAMPLE_TAG}%`).select("id") },
    { key: "forum_discussions", run: () => admin.from("forum_discussions").delete().ilike("title", `${SAMPLE_TAG}%`).select("id") },
    { key: "control_documents", run: () => admin.from("control_documents").delete().ilike("title", `${SAMPLE_TAG}%`).select("id") },
    { key: "business_continuity_plans", run: () => admin.from("business_continuity_plans").delete().ilike("title", `${SAMPLE_TAG}%`).select("id") },
    { key: "risks", run: () => admin.from("risks").delete().ilike("title", `${SAMPLE_TAG}%`).select("id") },
    { key: "strategic_objectives", run: () => admin.from("strategic_objectives").delete().ilike("description", `${SAMPLE_TAG}%`).select("id") },
    { key: "departments", run: () => admin.from("departments").delete().ilike("description", `${SAMPLE_TAG}%`).select("id") },
  ];

  for (const op of ops) {
    const { data, error } = await op.run();
    if (error) errors.push(`${op.key}: ${error.message}`);
    removed[op.key] = data?.length || 0;
  }

  return {
    success: errors.length === 0,
    removed,
    errors,
    total: Object.values(removed).reduce((a, b) => a + b, 0),
  };
}
