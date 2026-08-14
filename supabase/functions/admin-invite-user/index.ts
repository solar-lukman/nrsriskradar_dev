import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { buildCors } from "../_shared/cors.ts";
type Role =
  | "RC" | "RR" | "RO" | "RMD" | "CRO" | "ERMSC"
  | "EC" | "RCB" | "SUPERVISOR" | "ADMIN" | "USER";

interface InviteBody {
  email: string;
  full_name?: string;
  department?: string;
  roles: Role[];
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller is ADMIN
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: profile } = await admin
      .from("profiles").select("role").eq("user_id", userRes.user.id).maybeSingle();
    if (profile?.role !== "ADMIN") {
      return new Response(JSON.stringify({ error: "Admins only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as InviteBody;
    if (!body?.email || !Array.isArray(body.roles) || body.roles.length === 0) {
      return new Response(JSON.stringify({ error: "email and roles[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectTo = `${new URL(req.url).origin.replace(/\/functions.*$/, "")}/`;
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      body.email,
      {
        data: {
          full_name: body.full_name ?? body.email.split("@")[0],
          department: body.department ?? "General",
        },
        redirectTo,
      }
    );
    if (inviteErr || !invited.user) {
      return new Response(JSON.stringify({ error: inviteErr?.message ?? "invite failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = body.roles.map((role) => ({
      user_id: invited.user!.id, role, assigned_by: userRes.user!.id,
    }));
    const { error: roleErr } = await admin.from("user_roles").insert(rows);
    if (roleErr) {
      return new Response(JSON.stringify({
        warning: "User invited but role assignment failed", details: roleErr.message,
        user_id: invited.user.id,
      }), { status: 207, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.rpc("log_system_audit", {
      p_user_id: userRes.user.id,
      p_action: "user_invited",
      p_category: "authentication",
      p_resource_type: "profile",
      p_resource_id: invited.user.id,
      p_details: { email: body.email, roles: body.roles, department: body.department ?? null },
      p_severity: "medium",
    });

    return new Response(JSON.stringify({ ok: true, user_id: invited.user.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
