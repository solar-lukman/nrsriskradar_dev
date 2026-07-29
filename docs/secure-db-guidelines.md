# Secure Database & Supabase Handling

These rules are enforced during peer review and by `npm run lint:db-safety`.

## 1. Never build SQL from strings

- Use the typed Supabase client (`supabase.from('risks').select(...)`) or a parameterised RPC.
- Never call `supabase.rpc('execute_sql', { sql: ... })` or an equivalent generic SQL runner.
- Inside edge functions, do not concatenate or template-string user input into SQL passed to `rpc`.

```ts
// ❌ Forbidden
await supabase.rpc('execute_sql', { sql: `SELECT * FROM risks WHERE id = '${riskId}'` });

// ✅ Allowed
await supabase.from('risks').select('*').eq('id', riskId);

// ✅ Allowed — parameterised, typed RPC
await supabase.rpc('apply_workflow_transition', { p_risk_id: riskId, p_action: 'approve' });
```

## 2. Validate all edge-function input with Zod

```ts
const Body = z.object({
  riskId: z.string().uuid(),
  action: z.enum(['submit', 'approve', 'return']),
  reason: z.string().max(1000).optional(),
});
const parsed = Body.safeParse(await req.json());
if (!parsed.success) {
  return new Response(JSON.stringify({ error: parsed.error.flatten() }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
```

## 3. New `public` tables ship with GRANT + RLS in the same migration

```sql
CREATE TABLE public.foo (...);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.foo TO authenticated;
GRANT ALL ON public.foo TO service_role;
-- GRANT SELECT ON public.foo TO anon;  -- only if policy allows

ALTER TABLE public.foo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "..." ON public.foo FOR SELECT TO authenticated USING (...);
```

Missing any of these steps means the table is either inaccessible or wide open.

## 4. Role checks go through `has_role()`

- Server + RLS: use the security-definer `public.has_role(auth.uid(), 'ADMIN')` helper. Never join `profiles.role` inside a policy on `profiles` (recursion).
- Client: read the resolved role from `AuthContext`. Never trust `localStorage`, `sessionStorage`, cookies, or hidden form fields for authorization.

```ts
// ❌ Forbidden — trivially bypassable
if (localStorage.getItem('role') === 'ADMIN') { ... }

// ✅ Allowed
const { role } = useAuth();
if (role === 'ADMIN') { ... }
```

## 5. Time-dependent rules go in triggers, not CHECK constraints

`CHECK (expire_at > now())` is not immutable and breaks restores. Move that logic into a `BEFORE INSERT/UPDATE` trigger.

## 6. CORS on every edge-function response

```ts
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

// success AND error paths:
return new Response(JSON.stringify(payload),
  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
```

## 7. Never log or return secrets

- Do not log `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, connector keys, or JWTs.
- Do not put the service role key in browser code.
- On Lovable Cloud, the service role key and DB password are not user-accessible — do not instruct users to fetch them.

## 8. Pre-review checks

```bash
npm run lint:db-safety      # local static scan
```

Additionally, before merging a migration, run the Supabase linter against the target project and address any critical findings (missing RLS, missing policies, exposed sensitive columns) or document why the flag is intentional.
