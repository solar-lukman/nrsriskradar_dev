import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

import { buildCors } from "../_shared/cors.ts";
interface NotificationEmailRequest {
  userId: string;
  title: string;
  message: string;
  category: string;
  type: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = buildCors(req);
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, title, message, category, type }: NotificationEmailRequest = await req.json();

    // Get user preferences and profile
    const { data: preferences } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('user_id', userId)
      .single();

    if (!profile || !preferences || !preferences.email_enabled) {
      return new Response(
        JSON.stringify({ message: 'User email notifications disabled or user not found' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check category-specific preferences
    const shouldSendEmail = (() => {
      switch (category) {
        case 'risk_update':
          return preferences.risk_updates_email;
        case 'bcp_change':
          return preferences.bcp_changes_email;
        case 'document_upload':
          return preferences.document_uploads_email;
        case 'system':
        case 'user_action':
          return preferences.system_alerts_email;
        default:
          return true;
      }
    })();

    if (!shouldSendEmail) {
      return new Response(
        JSON.stringify({ message: 'Email notification disabled for this category' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Here you would integrate with your email service (Resend, SendGrid, etc.)
    // For now, we'll log the email that would be sent
    console.log('Email notification would be sent:', {
      to: profile.email,
      name: profile.full_name,
      subject: `[Risk Management Portal] ${title}`,
      message: message,
      category: category,
      type: type
    });

    // If you have Resend configured, uncomment and use this:
    /*
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      const { Resend } = await import('npm:resend@2.0.0');
      const resend = new Resend(resendApiKey);

      const emailResponse = await resend.emails.send({
        from: "Risk Management Portal <noreply@yourdomain.com>",
        to: [profile.email],
        subject: `[Risk Management Portal] ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${title}</h2>
            <p style="color: #666; line-height: 1.6;">${message}</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              This is an automated notification from the Risk Management Portal. 
              You can manage your notification preferences in your account settings.
            </p>
          </div>
        `
      });

      console.log("Email sent successfully:", emailResponse);
    }
    */

    return new Response(
      JSON.stringify({ message: 'Email notification processed successfully' }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-notification-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

Deno.serve(handler);