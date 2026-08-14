import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";

import { buildCors } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;

    // Action: generate a report and archive it
    if (action === "generate") {
      const { reportType, title, period, userId, sendEmail, recipients } = body;
      
      // Fetch data for report
      const reportData = await generateReportData(supabase, reportType);

      // Archive it
      const { data: archive, error: archiveError } = await supabase
        .from("board_report_archives")
        .insert({
          report_type: reportType,
          title,
          content: reportData,
          generated_by: userId,
          is_scheduled: body.isScheduled || false,
          metadata: { recipients: recipients || [], period },
        })
        .select()
        .single();

      if (archiveError) throw archiveError;

      // Send in-app notifications to board members
      const { data: boardMembers } = await supabase
        .from("profiles")
        .select("user_id, role")
        .in("role", ["RMD", "CRO", "ERMSC", "EC", "RCB", "ADMIN"]);

      if (boardMembers) {
        const notifications = boardMembers.map((member) => ({
          user_id: member.user_id,
          title: "New Board Report Available",
          message: `"${title}" for ${period} has been generated and is ready for review.`,
          type: "info",
          category: "system",
          resource_type: "board_report",
          resource_id: archive.id,
        }));

        await supabase.from("notifications").insert(notifications);
      }

      // Send email if Resend is configured and requested
      if (sendEmail && resendApiKey && recipients && recipients.length > 0) {
        await sendReportEmail(resendApiKey, title, period, recipients, reportData);
      }

      return new Response(
        JSON.stringify({ success: true, archiveId: archive.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: run all active schedules
    if (action === "run-schedules") {
      const now = new Date();
      
      const { data: schedules } = await supabase
        .from("report_schedules")
        .select("*")
        .eq("is_active", true)
        .or(`next_run_at.is.null,next_run_at.lte.${now.toISOString()}`);

      if (!schedules || schedules.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No schedules due" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results = [];

      for (const schedule of schedules) {
        try {
          const reportData = await generateReportData(supabase, schedule.report_type);

          // Archive
          const { data: archive } = await supabase
            .from("board_report_archives")
            .insert({
              report_type: schedule.report_type,
              title: schedule.title,
              content: reportData,
              generated_by: schedule.created_by,
              is_scheduled: true,
              metadata: { schedule_id: schedule.id, recipients: schedule.recipients, period: getPeriodLabel(schedule.frequency) },
            })
            .select()
            .single();

          // Notify board members
          const { data: boardMembers } = await supabase
            .from("profiles")
            .select("user_id")
            .in("role", ["RMD", "CRO", "ERMSC", "EC", "RCB", "ADMIN"]);

          if (boardMembers && archive) {
            const notifications = boardMembers.map((m) => ({
              user_id: m.user_id,
              title: "Scheduled Report Generated",
              message: `"${schedule.title}" has been auto-generated and archived.`,
              type: "info",
              category: "system",
              resource_type: "board_report",
              resource_id: archive.id,
            }));
            await supabase.from("notifications").insert(notifications);
          }

          // Send email
          if (resendApiKey && schedule.recipients && schedule.recipients.length > 0) {
            await sendReportEmail(
              resendApiKey,
              schedule.title,
              getPeriodLabel(schedule.frequency),
              schedule.recipients,
              reportData
            );
          }

          // Update schedule
          const nextRun = calculateNextRun(schedule.frequency);
          await supabase
            .from("report_schedules")
            .update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() })
            .eq("id", schedule.id);

          results.push({ scheduleId: schedule.id, status: "success" });
        } catch (err) {
          console.error(`Schedule ${schedule.id} failed:`, err);
          results.push({ scheduleId: schedule.id, status: "error", error: String(err) });
        }
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- Helper functions ---

async function generateReportData(supabase: any, reportType: string) {
  const { data: risks } = await supabase.from("risks").select("*");
  const { data: controls } = await supabase.from("risk_controls").select("*");
  const { data: bcps } = await supabase.from("business_continuity_plans").select("*");

  const r = risks || [];
  const c = controls || [];
  const b = bcps || [];

  const total = r.length;
  const open = r.filter((x: any) => x.status !== "Mitigated").length;
  const mitigated = r.filter((x: any) => x.status === "Mitigated").length;
  const escalated = r.filter((x: any) => x.status === "Escalated").length;
  const high = r.filter((x: any) => x.inherent_likelihood * x.inherent_impact >= 15).length;
  const avgResidual = total > 0
    ? Math.round(r.reduce((s: number, x: any) => s + x.residual_likelihood * x.residual_impact, 0) / total * 10) / 10
    : 0;

  const catCounts: Record<string, number> = {};
  r.forEach((x: any) => { catCounts[x.category] = (catCounts[x.category] || 0) + 1; });

  const base = {
    summary: { total, open, mitigated, escalated, high, avgResidual },
    categories: catCounts,
    generatedAt: new Date().toISOString(),
  };

  if (reportType === "annual" || reportType === "emergency") {
    const totalBudget = r.reduce((s: number, x: any) => s + (Number(x.mitigation_budget) || 0), 0);
    const totalSpent = r.reduce((s: number, x: any) => s + (Number(x.mitigation_budget_spent) || 0), 0);
    return {
      ...base,
      budget: { totalBudget, totalSpent, utilization: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0 },
      bcp: {
        total: b.length,
        ready: b.filter((x: any) => x.status === "Ready").length,
        needsReview: b.filter((x: any) => x.status === "Needs Review").length,
        overdue: b.filter((x: any) => x.test_status === "Overdue").length,
      },
      controls: { total: c.length, active: c.filter((x: any) => x.status === "active").length },
    };
  }

  return {
    ...base,
    controls: { total: c.length, active: c.filter((x: any) => x.status === "active").length },
    topRisks: r
      .sort((a: any, b: any) => (b.residual_likelihood * b.residual_impact) - (a.residual_likelihood * a.residual_impact))
      .slice(0, 5)
      .map((x: any) => ({ title: x.title, score: x.residual_likelihood * x.residual_impact, status: x.status })),
  };
}

async function sendReportEmail(
  apiKey: string,
  title: string,
  period: string,
  recipients: string[],
  reportData: any
) {
  const summary = reportData.summary;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: #1a1a2e; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">📊 ${title}</h1>
        <p style="margin: 8px 0 0; opacity: 0.8;">Period: ${period} | Generated: ${new Date().toLocaleDateString()}</p>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <h2 style="color: #333; font-size: 18px;">Executive Summary</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Total Risks</td><td style="padding: 8px; text-align: right; font-weight: bold;">${summary.total}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Open Risks</td><td style="padding: 8px; text-align: right; font-weight: bold;">${summary.open}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Mitigated</td><td style="padding: 8px; text-align: right; font-weight: bold;">${summary.mitigated}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">High Priority (≥15)</td><td style="padding: 8px; text-align: right; font-weight: bold; color: #dc2626;">${summary.high}</td></tr>
          <tr><td style="padding: 8px;">Avg Residual Score</td><td style="padding: 8px; text-align: right; font-weight: bold;">${summary.avgResidual}</td></tr>
        </table>
        <p style="color: #666; font-size: 13px; margin-top: 24px;">
          This is an automated report from the Risk Management Portal. Log in to view the full report and download the PDF.
        </p>
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Risk Management <reports@resend.dev>",
        to: recipients,
        subject: `${title} - ${period}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
    }
  } catch (e) {
    console.error("Email send failed:", e);
  }
}

function getPeriodLabel(frequency: string): string {
  const now = new Date();
  switch (frequency) {
    case "weekly": return `Week of ${now.toLocaleDateString()}`;
    case "monthly": return `${now.toLocaleString("default", { month: "long" })} ${now.getFullYear()}`;
    case "quarterly": return `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
    case "annually": return `${now.getFullYear()}`;
    default: return now.toLocaleDateString();
  }
}

function calculateNextRun(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case "weekly": return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "monthly": return new Date(now.getFullYear(), now.getMonth() + 1, 1);
    case "quarterly": return new Date(now.getFullYear(), now.getMonth() + 3, 1);
    case "annually": return new Date(now.getFullYear() + 1, 0, 1);
    default: return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}
