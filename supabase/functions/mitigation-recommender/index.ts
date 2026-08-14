import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCors } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { riskId } = await req.json();

    if (!riskId) {
      return new Response(JSON.stringify({ error: 'Risk ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Generating mitigation recommendations for risk:', riskId);

    // Fetch the risk details
    const { data: risk, error: riskError } = await supabase
      .from('risks')
      .select('*')
      .eq('id', riskId)
      .single();

    if (riskError || !risk) {
      console.error('Error fetching risk:', riskError);
      return new Response(JSON.stringify({ error: 'Risk not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch existing controls for this risk
    const { data: controls } = await supabase
      .from('risk_controls')
      .select('*')
      .eq('risk_id', riskId);

    // Fetch similar risks that have been mitigated for best practices
    const { data: similarMitigatedRisks } = await supabase
      .from('risks')
      .select('title, category, mitigation_plan, mitigation_actions, status')
      .eq('category', risk.category)
      .eq('status', 'Mitigated')
      .neq('id', riskId)
      .limit(5);

    const riskScore = risk.residual_likelihood * risk.residual_impact;
    const riskLevel = riskScore >= 20 ? 'Critical' : riskScore >= 15 ? 'High' : riskScore >= 8 ? 'Medium' : 'Low';

    const prompt = `You are an enterprise risk management expert. Analyze the following risk and provide comprehensive mitigation recommendations.

RISK DETAILS:
- Title: ${risk.title}
- Description: ${risk.description}
- Category: ${risk.category}
- Department: ${risk.department || 'Not specified'}
- Current Risk Level: ${riskLevel} (Score: ${riskScore})
- Inherent Likelihood: ${risk.inherent_likelihood}/5, Impact: ${risk.inherent_impact}/5
- Residual Likelihood: ${risk.residual_likelihood}/5, Impact: ${risk.residual_impact}/5
- Current Mitigation Plan: ${risk.mitigation_plan || 'None'}
- Current Status: ${risk.status}

EXISTING CONTROLS (${controls?.length || 0}):
${controls?.map(c => `- ${c.control_name}: ${c.control_description || 'No description'} (Effectiveness: ${c.effectiveness_rating}%)`).join('\n') || 'No controls defined'}

SIMILAR MITIGATED RISKS FOR REFERENCE:
${similarMitigatedRisks?.map(r => `- ${r.title}: ${r.mitigation_plan || 'No plan documented'}`).join('\n') || 'No similar mitigated risks found'}

Based on this information, provide mitigation recommendations in the following JSON structure:
{
  "summary": "Brief executive summary of the risk and recommended approach (2-3 sentences)",
  "strategies": [
    {
      "title": "Strategy title",
      "description": "Detailed description of the mitigation strategy",
      "type": "preventive|detective|corrective|compensating",
      "priority": "high|medium|low",
      "estimatedCost": "low|medium|high",
      "implementationTime": "immediate|short-term|medium-term|long-term",
      "expectedImpactReduction": "Percentage or qualitative description"
    }
  ],
  "controls": [
    {
      "name": "Control name",
      "description": "Control description",
      "type": "preventive|detective|corrective",
      "frequency": "continuous|daily|weekly|monthly|quarterly|annual"
    }
  ],
  "kpis": [
    {
      "name": "KPI name",
      "description": "What to measure",
      "target": "Target value or threshold"
    }
  ],
  "bestPractices": ["Industry best practice 1", "Best practice 2"],
  "warnings": ["Potential pitfall 1", "Risk to watch 2"]
}

Provide 3-5 strategies, 2-4 controls, 2-3 KPIs, 3-5 best practices, and 2-3 warnings.`;

    console.log('Calling Lovable AI for mitigation recommendations...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an enterprise risk management expert specializing in ISO 31000 compliance. Always respond with valid JSON only, no markdown formatting.'
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Rate limit exceeded. Please try again in a moment.',
          code: 'RATE_LIMIT'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'AI service credits exhausted. Please add credits to continue.',
          code: 'PAYMENT_REQUIRED'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing recommendations...');

    // Parse the JSON response
    let recommendations;
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3);
      }
      recommendations = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw content:', content);
      throw new Error('Failed to parse AI recommendations');
    }

    console.log('Successfully generated mitigation recommendations');

    return new Response(JSON.stringify({
      success: true,
      riskId,
      riskTitle: risk.title,
      riskCategory: risk.category,
      currentRiskLevel: riskLevel,
      recommendations,
      generatedAt: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in mitigation-recommender:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
