import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

import { buildCors } from "../_shared/cors.ts";
async function hashPassphrase(passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.slice(0, 16));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return base64Encode(hashArray);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { case_reference, passphrase, action, message } = body;

    if (!case_reference || !passphrase) {
      return new Response(JSON.stringify({ error: 'Case reference and passphrase are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find case
    const { data: caseData, error: caseError } = await supabase
      .from('whistleblow_cases')
      .select('*')
      .eq('case_reference', case_reference.trim().toUpperCase())
      .single();

    if (caseError || !caseData) {
      return new Response(JSON.stringify({ error: 'Case not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify passphrase
    const passphraseHash = await hashPassphrase(passphrase);
    if (passphraseHash !== caseData.reporter_passphrase_hash) {
      return new Response(JSON.stringify({ error: 'Invalid passphrase' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle actions
    if (action === 'send_message' && message) {
      // Reporter sends a message
      await supabase.from('whistleblow_messages').insert({
        case_id: caseData.id,
        sender_type: 'reporter',
        sender_id: null,
        message: message,
        is_read: false
      });

      // Audit log
      await supabase.from('whistleblow_audit_log').insert({
        case_id: caseData.id,
        action: 'reporter_message_sent',
        details: { message_length: message.length }
      });

      // Notify assigned investigator
      if (caseData.assigned_to) {
        await supabase.from('notifications').insert({
          user_id: caseData.assigned_to,
          title: 'New Reporter Message',
          message: `Anonymous reporter has sent a new message on case ${case_reference}.`,
          type: 'info',
          category: 'whistleblow',
          resource_type: 'whistleblow_case',
          resource_id: caseData.id
        });
      }
    }

    // Get messages (hide investigator identities)
    const { data: messages } = await supabase
      .from('whistleblow_messages')
      .select('id, sender_type, message, is_read, created_at')
      .eq('case_id', caseData.id)
      .order('created_at', { ascending: true });

    // Get audit timeline (limited info for reporter)
    const { data: timeline } = await supabase
      .from('whistleblow_audit_log')
      .select('action, new_value, created_at')
      .eq('case_id', caseData.id)
      .in('action', ['case_submitted', 'status_changed', 'case_escalated', 'case_resolved'])
      .order('created_at', { ascending: true });

    // Return sanitized case data (no internal details)
    return new Response(JSON.stringify({
      case_reference: caseData.case_reference,
      category: caseData.category,
      subject: caseData.subject,
      status: caseData.status,
      priority: caseData.priority,
      created_at: caseData.created_at,
      resolution_summary: caseData.status === 'Resolved' || caseData.status === 'Closed' ? caseData.resolution_summary : null,
      resolution_date: caseData.resolution_date,
      messages: (messages || []).map(m => ({
        ...m,
        sender_label: m.sender_type === 'reporter' ? 'You' : 'Investigation Team'
      })),
      timeline: timeline || []
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Follow-up error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
