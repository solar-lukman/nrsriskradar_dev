import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

import { buildCors } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase credentials not configured');
      throw new Error('Supabase credentials not configured');
    }

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

    // Fetch historical risk data
    console.log('Fetching risk data for analysis...');
    
    const { data: risks, error: risksError } = await supabase
      .from('risks')
      .select('*')
      .order('created_at', { ascending: false });

    if (risksError) {
      console.error('Error fetching risks:', risksError);
      throw new Error(`Failed to fetch risks: ${risksError.message}`);
    }

    // Fetch risk audit logs for trend analysis
    const { data: auditLogs, error: auditError } = await supabase
      .from('risk_audit_logs')
      .select('*')
      .order('performed_at', { ascending: false })
      .limit(100);

    if (auditError) {
      console.error('Error fetching audit logs:', auditError);
    }

    // Fetch risk controls for effectiveness analysis
    const { data: controls, error: controlsError } = await supabase
      .from('risk_controls')
      .select('*');

    if (controlsError) {
      console.error('Error fetching controls:', controlsError);
    }

    // Aggregate data for AI analysis
    const categoryDistribution: Record<string, number> = {};
    const statusDistribution: Record<string, number> = {};
    const departmentDistribution: Record<string, number> = {};
    let totalInherentScore = 0;
    let totalResidualScore = 0;
    let highRiskCount = 0;

    (risks || []).forEach((risk: any) => {
      // Category distribution
      categoryDistribution[risk.category] = (categoryDistribution[risk.category] || 0) + 1;
      
      // Status distribution
      statusDistribution[risk.status] = (statusDistribution[risk.status] || 0) + 1;
      
      // Department distribution
      if (risk.department) {
        departmentDistribution[risk.department] = (departmentDistribution[risk.department] || 0) + 1;
      }
      
      // Calculate scores
      const inherentScore = risk.inherent_likelihood * risk.inherent_impact;
      const residualScore = risk.residual_likelihood * risk.residual_impact;
      totalInherentScore += inherentScore;
      totalResidualScore += residualScore;
      
      if (residualScore >= 15) {
        highRiskCount++;
      }
    });

    const avgInherentScore = risks?.length ? (totalInherentScore / risks.length).toFixed(1) : 0;
    const avgResidualScore = risks?.length ? (totalResidualScore / risks.length).toFixed(1) : 0;

    // Calculate control effectiveness
    const avgControlEffectiveness = controls?.length 
      ? ((controls.reduce((sum: number, c: any) => sum + (c.effectiveness_rating || 0), 0) / controls.length)).toFixed(0)
      : 'N/A';

    // Build analysis context
    const analysisContext = {
      totalRisks: risks?.length || 0,
      highRiskCount,
      categoryDistribution,
      statusDistribution,
      departmentDistribution,
      avgInherentScore,
      avgResidualScore,
      avgControlEffectiveness,
      recentChanges: auditLogs?.slice(0, 10).map((log: any) => ({
        action: log.action,
        date: log.performed_at
      })) || [],
      industryContext: 'Nigerian enterprise sector - Oil & Gas, Energy Services'
    };

    console.log('Analysis context prepared:', JSON.stringify(analysisContext, null, 2));

    // Call Lovable AI Gateway for predictive analysis
    const systemPrompt = `You are an expert enterprise risk analyst specializing in ISO 31000 risk management frameworks. You analyze risk data to predict emerging risks and provide actionable insights.

Your predictions should be:
1. Based on patterns in the provided data
2. Relevant to the Nigerian business environment
3. Actionable and specific
4. Rated by confidence level (0-100%)

Focus on:
- Identifying risk categories showing upward trends
- Spotting gaps in risk coverage
- Predicting emerging risks based on industry patterns
- Recommending proactive measures`;

    const userPrompt = `Analyze the following enterprise risk management data and predict emerging risks:

CURRENT RISK PORTFOLIO:
- Total Risks: ${analysisContext.totalRisks}
- High Risk Count: ${analysisContext.highRiskCount}
- Average Inherent Risk Score: ${analysisContext.avgInherentScore}
- Average Residual Risk Score: ${analysisContext.avgResidualScore}
- Average Control Effectiveness: ${analysisContext.avgControlEffectiveness}%

RISK DISTRIBUTION BY CATEGORY:
${Object.entries(analysisContext.categoryDistribution).map(([cat, count]) => `- ${cat}: ${count}`).join('\n')}

RISK DISTRIBUTION BY STATUS:
${Object.entries(analysisContext.statusDistribution).map(([status, count]) => `- ${status}: ${count}`).join('\n')}

DEPARTMENT DISTRIBUTION:
${Object.entries(analysisContext.departmentDistribution).map(([dept, count]) => `- ${dept}: ${count}`).join('\n') || 'No department data available'}

INDUSTRY CONTEXT: ${analysisContext.industryContext}

Based on this analysis, provide 3-5 predictions for emerging risks that the organization should proactively address.`;

    console.log('Calling Lovable AI Gateway...');

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
        tools: [{
          type: 'function',
          function: {
            name: 'generate_risk_predictions',
            description: 'Generate structured risk predictions with confidence scores',
            parameters: {
              type: 'object',
              properties: {
                predictions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      category: { 
                        type: 'string',
                        enum: ['Strategic', 'Operational', 'Financial', 'Compliance', 'Technology', 'Reputational', 'Environmental', 'Human Resources']
                      },
                      title: { type: 'string', description: 'Brief title for the predicted risk' },
                      description: { type: 'string', description: 'Detailed description of the emerging risk' },
                      confidence_score: { type: 'integer', minimum: 0, maximum: 100, description: 'Confidence level 0-100' },
                      risk_factors: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Key factors driving this prediction'
                      },
                      recommended_actions: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Recommended proactive measures'
                      },
                      timeframe: { 
                        type: 'string',
                        enum: ['immediate', 'short-term', 'medium-term', 'long-term'],
                        description: 'Expected timeframe for risk materialization'
                      }
                    },
                    required: ['category', 'title', 'description', 'confidence_score', 'risk_factors', 'recommended_actions', 'timeframe']
                  }
                },
                analysis_summary: { type: 'string', description: 'Overall summary of the risk landscape analysis' }
              },
              required: ['predictions', 'analysis_summary']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'generate_risk_predictions' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'AI credits exhausted. Please add credits to continue.',
          code: 'PAYMENT_REQUIRED'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI Response received:', JSON.stringify(aiData, null, 2));

    // Parse the tool call response
    let predictions = [];
    let analysisSummary = '';

    if (aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      const parsed = JSON.parse(aiData.choices[0].message.tool_calls[0].function.arguments);
      predictions = parsed.predictions || [];
      analysisSummary = parsed.analysis_summary || '';
    }

    // Store predictions in database
    const storedPredictions = [];
    for (const prediction of predictions) {
      const { data: stored, error: storeError } = await supabase
        .from('ai_predictions')
        .insert({
          prediction_type: 'emerging_risk',
          category: prediction.category,
          title: prediction.title,
          description: prediction.description,
          confidence_score: prediction.confidence_score,
          risk_factors: prediction.risk_factors,
          recommended_actions: prediction.recommended_actions,
          data_sources: ['internal_risk_register', 'audit_logs', 'control_effectiveness'],
          metadata: {
            timeframe: prediction.timeframe,
            analysis_context: {
              total_risks: analysisContext.totalRisks,
              high_risk_count: analysisContext.highRiskCount
            }
          }
        })
        .select()
        .single();

      if (storeError) {
        console.error('Error storing prediction:', storeError);
      } else {
        storedPredictions.push(stored);
      }
    }

    console.log(`Stored ${storedPredictions.length} predictions`);

    return new Response(JSON.stringify({
      success: true,
      predictions: storedPredictions,
      analysis_summary: analysisSummary,
      context: {
        total_risks_analyzed: analysisContext.totalRisks,
        categories_covered: Object.keys(analysisContext.categoryDistribution).length,
        generated_at: new Date().toISOString()
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in risk-ai-analysis:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
