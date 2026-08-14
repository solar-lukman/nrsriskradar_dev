import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { z } from "npm:zod@3.23.8";

import { buildCors } from "../_shared/cors.ts";

async function hashPassphrase(passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.slice(0, 16));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return base64Encode(hashArray);
}

// Strip dangerous script/HTML tag characters + control chars while preserving
// legitimate narrative content. Storage is parameterized (no SQLi risk), so
// this focuses on stopping stored-XSS payloads from ever entering the DB.
const sanitize = (raw: unknown): string =>
  typeof raw === "string"
    ? raw
        .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
        .replace(/<\/?[a-z][^>]*>/gi, "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .trim()
    : "";

// Cap: 5 files, 10MB each (base64-encoded increases payload ~33%).
const AttachmentSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  file_type: z.string().trim().max(150).optional().nullable(),
  // base64 payload (no data: URL prefix)
  data: z.string().min(1).max(15_000_000),
});

const SubmissionSchema = z.object({
  category: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(10_000),
  date_of_incident: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "Invalid date format")
    .optional()
    .nullable(),
  location: z.string().trim().max(500).optional().nullable(),
  individuals_involved: z.string().trim().max(2_000).optional().nullable(),
  evidence_description: z.string().trim().max(5_000).optional().nullable(),
  passphrase: z.string().min(6).max(200),
  turnstile_token: z.string().min(10).max(4096).optional(),
  attachments: z.array(AttachmentSchema).max(5).optional(),
});

const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]+,/, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

// Verify a Cloudflare Turnstile token. Returns true if the token is valid
// (or if verification is disabled because no secret is configured — this
// keeps local dev usable without a secret).
async function verifyTurnstile(token: string | undefined, ip: string): Promise<{ ok: boolean; reason?: string }> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    // No secret configured -> feature disabled, allow through.
    return { ok: true };
  }
  if (!token) return { ok: false, reason: "missing_token" };

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip && ip !== "unknown") body.append("remoteip", ip);

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const data = await res.json();
    if (data?.success === true) return { ok: true };
    return { ok: false, reason: (data?.["error-codes"] ?? []).join(",") || "verification_failed" };
  } catch (err) {
    console.error("Turnstile verify error:", err);
    return { ok: false, reason: "verify_exception" };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const parsed = SubmissionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const category = sanitize(parsed.data.category);
    const subject = sanitize(parsed.data.subject);
    const description = sanitize(parsed.data.description);
    const location = parsed.data.location ? sanitize(parsed.data.location) : null;
    const individuals_involved = parsed.data.individuals_involved ? sanitize(parsed.data.individuals_involved) : null;
    const evidence_description = parsed.data.evidence_description ? sanitize(parsed.data.evidence_description) : null;
    const date_of_incident = parsed.data.date_of_incident || null;
    const passphrase = parsed.data.passphrase;

    // Create service-role client (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // --- Rate limiting / abuse protection --------------------------------
    // Derive a caller identity from proxy headers + a lightweight fingerprint
    // (user-agent + accept-language). Neither reveals reporter identity, but
    // together they let us throttle a single spammer without blocking others.
    const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
    const ip =
      forwardedFor.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const ua = req.headers.get('user-agent') ?? '';
    const lang = req.headers.get('accept-language') ?? '';
    const fpBuf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${ip}|${ua}|${lang}`),
    );
    const fingerprint = base64Encode(new Uint8Array(fpBuf));

    // --- Human verification (Cloudflare Turnstile) ----------------------
    // Blocks automated spam / bot floods before we consume any DB writes.
    // Disabled automatically when TURNSTILE_SECRET_KEY is not configured.
    const captcha = await verifyTurnstile(parsed.data.turnstile_token, ip);
    if (!captcha.ok) {
      await supabase.from('whistleblow_submission_attempts').insert({
        ip_address: ip,
        fingerprint,
        succeeded: false,
      });
      return new Response(
        JSON.stringify({
          error: 'Human verification failed. Please complete the challenge and try again.',
          reason: captcha.reason,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: rlData, error: rlError } = await supabase.rpc(
      'check_whistleblow_rate_limit',
      { _ip: ip, _fingerprint: fingerprint },
    );

    if (!rlError && rlData && (rlData as any).allowed === false) {
      // Log the blocked attempt so investigators can see abuse patterns
      await supabase.from('whistleblow_submission_attempts').insert({
        ip_address: ip,
        fingerprint,
        succeeded: false,
      });
      return new Response(
        JSON.stringify({
          error:
            'Too many submissions from this source. Please wait a few minutes before trying again.',
          retry_after_minutes: (rlData as any).window_minutes ?? 10,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': '600',
          },
        },
      );
    }

    // Generate case reference using sequence
    const { data: seqData, error: seqError } = await supabase.rpc('nextval_whistleblow_seq');
    
    let caseNumber: number;
    if (seqError) {
      // Fallback: count existing cases + 1
      const { count } = await supabase.from('whistleblow_cases').select('*', { count: 'exact', head: true });
      caseNumber = (count || 0) + 1;
    } else {
      caseNumber = seqData;
    }

    const year = new Date().getFullYear();
    const caseReference = `WB-${year}-${String(caseNumber).padStart(5, '0')}`;

    // Hash passphrase
    const passphraseHash = await hashPassphrase(passphrase);

    // Insert case
    const { data: caseData, error: insertError } = await supabase
      .from('whistleblow_cases')
      .insert({
        case_reference: caseReference,
        reporter_passphrase_hash: passphraseHash,
        category,
        subject,
        description,
        date_of_incident: date_of_incident || null,
        location: location || null,
        individuals_involved: individuals_involved || null,
        evidence_description: evidence_description || null,
        status: 'Submitted'
      })
      .select('id, case_reference')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to submit report' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Record the successful attempt for rate-limit accounting
    await supabase.from('whistleblow_submission_attempts').insert({
      ip_address: ip,
      fingerprint,
      succeeded: true,
    });

    // Create audit log entry
    await supabase.from('whistleblow_audit_log').insert({
      case_id: caseData.id,
      action: 'case_submitted',
      new_value: 'Submitted',
      details: { category, subject }
    });

    // Notify RMD and ADMIN users
    const { data: investigators } = await supabase
      .from('profiles')
      .select('user_id')
      .in('user_id', 
        (await supabase.from('user_roles').select('user_id').in('role', ['RMD', 'ADMIN'])).data?.map(r => r.user_id) || []
      );

    if (investigators && investigators.length > 0) {
      const notifications = investigators.map(inv => ({
        user_id: inv.user_id,
        title: 'New Whistleblow Case Submitted',
        message: `A new whistleblow case ${caseReference} has been submitted under category "${category}". Immediate review required.`,
        type: 'warning',
        category: 'whistleblow',
        resource_type: 'whistleblow_case',
        resource_id: caseData.id
      }));
      await supabase.from('notifications').insert(notifications);
    }

    // Upload evidence attachments (best-effort; report succeeds even if any fail)
    const uploadResults: { file_name: string; ok: boolean; error?: string }[] = [];
    const attachments = parsed.data.attachments ?? [];
    for (const att of attachments) {
      try {
        if (att.file_type && !ALLOWED_MIME.has(att.file_type)) {
          uploadResults.push({ file_name: att.file_name, ok: false, error: 'unsupported_type' });
          continue;
        }
        const bytes = base64ToBytes(att.data);
        if (bytes.byteLength > 10 * 1024 * 1024) {
          uploadResults.push({ file_name: att.file_name, ok: false, error: 'too_large' });
          continue;
        }
        const path = `${caseData.id}/${crypto.randomUUID()}-${safeName(att.file_name)}`;
        const { error: upErr } = await supabase.storage
          .from('whistleblow-evidence')
          .upload(path, bytes, {
            contentType: att.file_type || 'application/octet-stream',
            upsert: false,
          });
        if (upErr) {
          uploadResults.push({ file_name: att.file_name, ok: false, error: upErr.message });
          continue;
        }
        await supabase.from('whistleblow_attachments').insert({
          case_id: caseData.id,
          uploaded_by_type: 'reporter',
          file_name: att.file_name,
          file_path: path,
          file_type: att.file_type || null,
          file_size: bytes.byteLength,
        });
        uploadResults.push({ file_name: att.file_name, ok: true });
      } catch (e) {
        uploadResults.push({ file_name: att.file_name, ok: false, error: 'upload_exception' });
      }
    }

    return new Response(JSON.stringify({
      case_reference: caseData.case_reference,
      attachments: uploadResults,
      message: 'Report submitted successfully. Save your case reference and passphrase for follow-up.'
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Submission error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
