import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase.rpc('check_bcp_test_reminders');
    if (error) {
      console.error('check_bcp_test_reminders failed:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const created = (data ?? []) as Array<{
      notification_id: string;
      user_id: string;
      title: string;
      message: string;
    }>;

    // Fan out email reminders (respects each user's notification preferences)
    let emailed = 0;
    for (const n of created) {
      try {
        const res = await supabase.functions.invoke('send-notification-email', {
          body: {
            userId: n.user_id,
            title: n.title,
            message: n.message,
            category: 'bcp_change',
            type: 'info',
          },
        });
        if (!res.error) emailed++;
      } catch (e) {
        console.error('email reminder failed for', n.user_id, e);
      }
    }

    console.log(`BCP test reminders: ${created.length} notifications, ${emailed} emails`);

    return new Response(
      JSON.stringify({ success: true, notifications: created.length, emails: emailed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
