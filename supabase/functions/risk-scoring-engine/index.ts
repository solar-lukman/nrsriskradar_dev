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

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
    
    const { riskId, riskIds, analyzeAll } = await req.json();

    // Fetch risks to analyze based on input
    let risksToAnalyze = [];
    
    if (riskId) {
      const { data: risk, error } = await supabase
        .from('risks')
        .select('*')
        .eq('id', riskId)
        .single();
      
      if (error) throw new Error(`Failed to fetch risk: ${error.message}`);
      risksToAnalyze = [risk];
    } else if (riskIds && Array.isArray(riskIds) && riskIds.length > 0) {
      // Batch analyze specific risks
      const { data: risks, error } = await supabase
        .from('risks')
        .select('*')
        .in('id', riskIds);
      
      if (error) throw new Error(`Failed to fetch risks: ${error.message}`);
      risksToAnalyze = risks || [];
    } else if (analyzeAll) {
      // Analyze all risks
      const { data: risks, error } = await supabase
        .from('risks')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);
      
      if (error) throw new Error(`Failed to fetch risks: ${error.message}`);
      risksToAnalyze = risks || [];
    } else {
      // Default: analyze risks without recent AI scores
      const { data: risks, error } = await supabase
        .from('risks')
        .select('*')
        .or('ai_score_generated_at.is.null,ai_score_status.eq.none')
        .order('updated_at', { ascending: false })
        .limit(10);
      
      if (error) throw new Error(`Failed to fetch risks: ${error.message}`);
      risksToAnalyze = risks || [];
    }

    if (risksToAnalyze.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No risks require scoring analysis',
        results: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Analyzing ${risksToAnalyze.length} risks for score recommendations`);

    const results = [];

    for (const risk of risksToAnalyze) {
      // Fetch assessments for this risk
      const { data: assessments } = await supabase
        .from('risk_assessments')
        .select('*')
        .eq('risk_id', risk.id)
        .order('assessment_date', { ascending: false })
        .limit(10);

      // Fetch controls for this risk
      const { data: controls } = await supabase
        .from('risk_controls')
        .select('*')
        .eq('risk_id', risk.id);

      // Calculate average control effectiveness
      const avgControlEffectiveness = controls?.length
        ? Math.round(controls.reduce((sum, c) => sum + (c.effectiveness_rating || 0), 0) / controls.length)
        : 0;

      // Fetch similar risks in the same category for benchmarking
      const { data: categoryRisks } = await supabase
        .from('risks')
        .select('residual_likelihood, residual_impact, control_effectiveness_score')
        .eq('category', risk.category)
        .neq('id', risk.id)
        .limit(20);

      const categoryBenchmark = categoryRisks?.length
        ? {
            avgLikelihood: Math.round(categoryRisks.reduce((sum, r) => sum + r.residual_likelihood, 0) / categoryRisks.length * 10) / 10,
            avgImpact: Math.round(categoryRisks.reduce((sum, r) => sum + r.residual_impact, 0) / categoryRisks.length * 10) / 10,
            avgControlScore: Math.round(categoryRisks.reduce((sum, r) => sum + (r.control_effectiveness_score || 0), 0) / categoryRisks.length)
          }
        : null;

      // Build context for AI
      const analysisContext = {
        risk: {
          title: risk.title,
          category: risk.category,
          description: risk.description,
          currentScores: {
            inherentLikelihood: risk.inherent_likelihood,
            inherentImpact: risk.inherent_impact,
            residualLikelihood: risk.residual_likelihood,
            residualImpact: risk.residual_impact,
            inherentScore: risk.inherent_likelihood * risk.inherent_impact,
            residualScore: risk.residual_likelihood * risk.residual_impact
          },
          controlEffectiveness: risk.control_effectiveness_score || avgControlEffectiveness,
          targetControlScore: risk.target_control_score || 80,
          mitigationPlan: risk.mitigation_plan,
          status: risk.status
        },
        assessmentHistory: assessments?.map(a => ({
          date: a.assessment_date,
          likelihood: a.likelihood,
          impact: a.impact,
          controlScore: a.control_score
        })) || [],
        controls: controls?.map(c => ({
          name: c.control_name,
          type: c.control_type,
          effectiveness: c.effectiveness_rating,
          status: c.status
        })) || [],
        categoryBenchmark
      };

      console.log(`Analyzing risk: ${risk.title}`);

      // Call AI for scoring recommendation
      const systemPrompt = `You are an expert risk analyst specializing in ISO 31000 risk assessment. Your task is to analyze risk data and recommend optimal residual risk scores based on:
1. Control effectiveness and maturity
2. Historical assessment trends
3. Category benchmarks
4. Mitigation plan implementation

Provide conservative, well-justified scoring recommendations. Use a 1-5 scale for likelihood and impact.`;

      const userPrompt = `Analyze this risk and recommend optimal residual scores:

RISK DETAILS:
- Title: ${analysisContext.risk.title}
- Category: ${analysisContext.risk.category}
- Description: ${analysisContext.risk.description}
- Status: ${analysisContext.risk.status}

CURRENT SCORES:
- Inherent: Likelihood ${analysisContext.risk.currentScores.inherentLikelihood}, Impact ${analysisContext.risk.currentScores.inherentImpact} (Score: ${analysisContext.risk.currentScores.inherentScore})
- Residual: Likelihood ${analysisContext.risk.currentScores.residualLikelihood}, Impact ${analysisContext.risk.currentScores.residualImpact} (Score: ${analysisContext.risk.currentScores.residualScore})

CONTROL EFFECTIVENESS: ${analysisContext.risk.controlEffectiveness}% (Target: ${analysisContext.risk.targetControlScore}%)

ACTIVE CONTROLS:
${analysisContext.controls.length > 0 
  ? analysisContext.controls.map(c => `- ${c.name} (${c.type}): ${c.effectiveness}% effective, Status: ${c.status}`).join('\n')
  : 'No controls documented'}

ASSESSMENT HISTORY (Latest 5):
${analysisContext.assessmentHistory.length > 0
  ? analysisContext.assessmentHistory.slice(0, 5).map(a => `- ${a.date}: L=${a.likelihood}, I=${a.impact}, Control=${a.controlScore}%`).join('\n')
  : 'No assessment history'}

CATEGORY BENCHMARK:
${categoryBenchmark 
  ? `Average for ${risk.category} risks: Likelihood ${categoryBenchmark.avgLikelihood}, Impact ${categoryBenchmark.avgImpact}, Control ${categoryBenchmark.avgControlScore}%`
  : 'No benchmark data available'}

MITIGATION PLAN:
${analysisContext.risk.mitigationPlan || 'Not documented'}

Based on this analysis, recommend optimal residual likelihood and impact scores (1-5 scale) with detailed justification.`;

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
              name: 'recommend_risk_scores',
              description: 'Recommend optimal residual risk scores with justification',
              parameters: {
                type: 'object',
                properties: {
                  recommended_likelihood: { 
                    type: 'integer', 
                    minimum: 1, 
                    maximum: 5,
                    description: 'Recommended residual likelihood score (1-5)'
                  },
                  recommended_impact: { 
                    type: 'integer', 
                    minimum: 1, 
                    maximum: 5,
                    description: 'Recommended residual impact score (1-5)'
                  },
                  confidence: { 
                    type: 'integer', 
                    minimum: 0, 
                    maximum: 100,
                    description: 'Confidence level in recommendation (0-100%)'
                  },
                  reasoning: { 
                    type: 'string',
                    description: 'Detailed justification for the recommended scores'
                  },
                  key_factors: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key factors influencing the recommendation'
                  },
                  improvement_suggestions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Suggestions to further reduce risk scores'
                  }
                },
                required: ['recommended_likelihood', 'recommended_impact', 'confidence', 'reasoning', 'key_factors']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'recommend_risk_scores' } }
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error(`AI error for risk ${risk.id}:`, aiResponse.status, errorText);
        
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ 
            error: 'Rate limit exceeded. Please try again later.',
            code: 'RATE_LIMIT'
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        continue; // Skip this risk and continue with others
      }

      const aiData = await aiResponse.json();
      
      let recommendation = null;
      if (aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
        recommendation = JSON.parse(aiData.choices[0].message.tool_calls[0].function.arguments);
      }

      if (recommendation) {
        // Update risk with AI recommendation
        const { error: updateError } = await supabase
          .from('risks')
          .update({
            ai_recommended_likelihood: recommendation.recommended_likelihood,
            ai_recommended_impact: recommendation.recommended_impact,
            ai_score_reasoning: recommendation.reasoning,
            ai_confidence: recommendation.confidence,
            ai_score_generated_at: new Date().toISOString(),
            ai_score_status: 'pending'
          })
          .eq('id', risk.id);

        if (updateError) {
          console.error(`Failed to update risk ${risk.id}:`, updateError);
        } else {
          results.push({
            riskId: risk.id,
            riskTitle: risk.title,
            currentScore: risk.residual_likelihood * risk.residual_impact,
            recommendedLikelihood: recommendation.recommended_likelihood,
            recommendedImpact: recommendation.recommended_impact,
            recommendedScore: recommendation.recommended_likelihood * recommendation.recommended_impact,
            confidence: recommendation.confidence,
            reasoning: recommendation.reasoning,
            keyFactors: recommendation.key_factors,
            improvementSuggestions: recommendation.improvement_suggestions || []
          });
        }
      }
    }

    console.log(`Completed scoring analysis for ${results.length} risks`);

    return new Response(JSON.stringify({
      success: true,
      results,
      analyzedCount: results.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in risk-scoring-engine:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
