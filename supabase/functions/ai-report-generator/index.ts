import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

import { buildCors } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase credentials not configured');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Require authenticated caller (JWT validation) ---
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
    const authClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { reportType = 'executive_summary', filters } = await req.json();

    // Fetch all risks
    let query = supabase.from('risks').select('*');
    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.department) query = query.eq('department', filters.department);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data: risks, error: risksError } = await query.order('created_at', { ascending: false });
    if (risksError) throw new Error(`Failed to fetch risks: ${risksError.message}`);

    // Fetch controls
    const { data: controls } = await supabase.from('risk_controls').select('*');

    // Fetch recent assessments
    const { data: assessments } = await supabase
      .from('risk_assessments')
      .select('*')
      .order('assessment_date', { ascending: false })
      .limit(100);

    // Fetch BCPs
    const { data: bcps } = await supabase.from('business_continuity_plans').select('*');

    // Build stats
    const totalRisks = risks?.length || 0;
    const openRisks = risks?.filter(r => r.status !== 'Mitigated').length || 0;
    const highRisks = risks?.filter(r => (r.inherent_likelihood * r.inherent_impact) >= 15).length || 0;
    const criticalRisks = risks?.filter(r => (r.inherent_likelihood * r.inherent_impact) >= 20).length || 0;

    const categoryBreakdown: Record<string, number> = {};
    const departmentBreakdown: Record<string, number> = {};
    const statusBreakdown: Record<string, number> = {};

    risks?.forEach(r => {
      categoryBreakdown[r.category] = (categoryBreakdown[r.category] || 0) + 1;
      if (r.department) departmentBreakdown[r.department] = (departmentBreakdown[r.department] || 0) + 1;
      statusBreakdown[r.status] = (statusBreakdown[r.status] || 0) + 1;
    });

    const avgResidualScore = totalRisks > 0
      ? Math.round((risks!.reduce((s, r) => s + r.residual_likelihood * r.residual_impact, 0) / totalRisks) * 10) / 10
      : 0;

    const avgControlEffectiveness = controls?.length
      ? Math.round(controls.reduce((s, c) => s + (c.effectiveness_rating || 0), 0) / controls.length)
      : 0;

    // Top 5 risks by score
    const topRisks = [...(risks || [])]
      .sort((a, b) => (b.inherent_likelihood * b.inherent_impact) - (a.inherent_likelihood * a.inherent_impact))
      .slice(0, 5);

    const systemPrompt = `You are a senior risk management consultant producing ${reportType === 'executive_summary' ? 'executive summary reports' : 'detailed risk analysis reports'} for board-level audiences. 
Write in a professional, concise tone. Use clear section headers. Focus on actionable insights and strategic recommendations.
Format your output in clean Markdown with proper headings, bullet points, and emphasis.`;

    const userPrompt = `Generate a comprehensive ${reportType === 'executive_summary' ? 'Executive Summary' : 'Detailed Risk Analysis'} report based on this organizational risk data:

OVERVIEW:
- Total Risks: ${totalRisks}
- Open Risks: ${openRisks}
- High Priority: ${highRisks}
- Critical: ${criticalRisks}
- Average Residual Score: ${avgResidualScore}/25
- Average Control Effectiveness: ${avgControlEffectiveness}%
- Active Controls: ${controls?.length || 0}
- BCP Plans: ${bcps?.length || 0}

CATEGORY DISTRIBUTION:
${Object.entries(categoryBreakdown).map(([k, v]) => `- ${k}: ${v} risks`).join('\n')}

STATUS BREAKDOWN:
${Object.entries(statusBreakdown).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

DEPARTMENT DISTRIBUTION:
${Object.entries(departmentBreakdown).map(([k, v]) => `- ${k}: ${v} risks`).join('\n') || 'Not specified'}

TOP 5 RISKS:
${topRisks.map((r, i) => `${i + 1}. "${r.title}" (${r.category}) - Score: ${r.inherent_likelihood * r.inherent_impact}, Status: ${r.status}`).join('\n')}

RECENT ASSESSMENT ACTIVITY: ${assessments?.length || 0} assessments recorded

Generate the report with these sections:
1. Executive Overview
2. Key Risk Indicators & Metrics
3. Top Risks Analysis
4. Risk Landscape Assessment (by category and department)
5. Control Effectiveness Summary
6. Emerging Risk Trends
7. Strategic Recommendations
8. Action Items & Next Steps

Include specific data points and percentages. Make recommendations actionable and prioritized.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded.', code: 'RATE_LIMIT' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required.', code: 'PAYMENT_REQUIRED' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('AI report generation failed');
    }

    const aiData = await aiResponse.json();
    const reportContent = aiData.choices?.[0]?.message?.content || 'Report generation failed.';

    return new Response(JSON.stringify({
      success: true,
      report: reportContent,
      reportType,
      generatedAt: new Date().toISOString(),
      stats: {
        totalRisks, openRisks, highRisks, criticalRisks,
        avgResidualScore, avgControlEffectiveness,
        categoryBreakdown, statusBreakdown, departmentBreakdown,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-report-generator:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
