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

    const { rows, sourceSystem, userId } = await req.json();

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw new Error('No data rows provided');
    }

    if (!userId) throw new Error('User ID is required');

    console.log(`Processing ${rows.length} rows from ${sourceSystem || 'unknown'} system`);

    // Send data to AI for risk identification
    const systemPrompt = `You are an expert enterprise risk analyst specializing in identifying risks from operational and business data. 
Analyze the provided data rows from a Line of Business system and identify potential risks.

For each identified risk, classify it according to ISO 31000 categories:
- Strategic, Operational, Financial, Compliance, Technology, Reputational, Environmental, Human Resources

Rate likelihood and impact on a 1-5 scale:
1 = Very Low, 2 = Low, 3 = Medium, 4 = High, 5 = Very High

Be thorough but avoid duplicates. Group related data points into single risks where appropriate.`;

    const sampleRows = rows.slice(0, 50); // Limit to 50 rows for AI context
    const columnHeaders = Object.keys(sampleRows[0]);

    const userPrompt = `Analyze this data imported from a "${sourceSystem || 'Line of Business'}" system.

DATA COLUMNS: ${columnHeaders.join(', ')}

DATA ROWS (${sampleRows.length} of ${rows.length} total):
${JSON.stringify(sampleRows, null, 2)}

Identify all potential risks from this data. For each risk provide:
- A clear title
- Description of the risk
- Category (Strategic/Operational/Financial/Compliance/Technology/Reputational/Environmental/Human Resources)
- Department affected
- Inherent likelihood (1-5) and impact (1-5) 
- Residual likelihood and impact (1-5) assuming basic controls
- Suggested mitigation plan
- Confidence level in the risk identification (0-100%)
- Source data reference (which rows/fields informed this risk)`;

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
            name: 'identify_risks',
            description: 'Return identified risks from the analyzed data',
            parameters: {
              type: 'object',
              properties: {
                risks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      category: { type: 'string', enum: ['Strategic', 'Operational', 'Financial', 'Compliance', 'Technology', 'Reputational', 'Environmental', 'Human Resources'] },
                      department: { type: 'string' },
                      inherent_likelihood: { type: 'integer', minimum: 1, maximum: 5 },
                      inherent_impact: { type: 'integer', minimum: 1, maximum: 5 },
                      residual_likelihood: { type: 'integer', minimum: 1, maximum: 5 },
                      residual_impact: { type: 'integer', minimum: 1, maximum: 5 },
                      mitigation_plan: { type: 'string' },
                      confidence: { type: 'integer', minimum: 0, maximum: 100 },
                      source_reference: { type: 'string' }
                    },
                    required: ['title', 'description', 'category', 'inherent_likelihood', 'inherent_impact', 'residual_likelihood', 'residual_impact', 'confidence']
                  }
                },
                summary: { type: 'string', description: 'Overall summary of risk analysis' },
                data_quality_notes: { type: 'string', description: 'Notes on data quality or limitations' }
              },
              required: ['risks', 'summary'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'identify_risks' } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', code: 'RATE_LIMIT' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Please add credits.', code: 'PAYMENT_REQUIRED' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errorText);
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    let result = null;

    if (aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      result = JSON.parse(aiData.choices[0].message.tool_calls[0].function.arguments);
    }

    if (!result || !result.risks || result.risks.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        identifiedRisks: [],
        summary: 'No risks identified from the provided data.',
        savedCount: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`AI identified ${result.risks.length} risks`);

    return new Response(JSON.stringify({
      success: true,
      identifiedRisks: result.risks,
      summary: result.summary,
      dataQualityNotes: result.data_quality_notes || null,
      sourceSystem: sourceSystem || 'Unknown',
      rowsAnalyzed: sampleRows.length,
      totalRows: rows.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in lob-data-import:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
