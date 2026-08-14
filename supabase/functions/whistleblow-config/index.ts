import { buildCors } from "../_shared/cors.ts";

// Returns non-secret client configuration for the whistleblow form.
// The Turnstile site key is public by design (it appears in the widget
// markup), so serving it from an edge function keeps it out of the
// committed frontend bundle while still being safely exposed.
Deno.serve((req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const siteKey = Deno.env.get("TURNSTILE_SITE_KEY") ?? "";
  return new Response(
    JSON.stringify({ turnstile_site_key: siteKey }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
