// Test-only helper (not used by any production function).
//
// Most edge functions in this repo call the native `Deno.serve(handler)` at
// module top level. To unit-test the handler logic without binding a real
// network listener, we monkey-patch `Deno.serve` to capture the handler
// function before dynamically importing the module, then restore the
// original afterwards.
export async function loadServeHandler(
  modulePath: string,
  baseUrl: string,
  bust = true,
): Promise<(req: Request) => Response | Promise<Response>> {
  const original = Deno.serve;
  let captured: ((req: Request) => Response | Promise<Response>) | undefined;

  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (arg: any, maybe?: any) => {
    if (typeof arg === "function") {
      captured = arg;
    } else if (arg && typeof arg.handler === "function") {
      captured = arg.handler;
    } else if (typeof maybe === "function") {
      captured = maybe;
    }
    return {
      finished: Promise.resolve(),
      shutdown: () => Promise.resolve(),
      ref: () => {},
      unref: () => {},
      addr: { transport: "tcp", hostname: "localhost", port: 0 },
    } as unknown as Deno.HttpServer;
  };

  try {
    // Resolve against the *caller's* module URL, not this helper's, then add a
    // cache-buster so each test re-executes the module top level.
    const resolved = new URL(modulePath, baseUrl).href;
    const url = bust ? `${resolved}?t=${Date.now()}-${Math.random()}` : resolved;
    await import(url);
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = original;
  }

  if (!captured) {
    throw new Error(`Deno.serve was never invoked while importing ${modulePath}`);
  }
  return captured;
}

// Minimal fetch router for stubbing `globalThis.fetch` while a handler runs.
// `routes` are tried in order; the first whose `match` returns true handles
// the request. Throws if nothing matches, to surface un-mocked calls loudly.
export type FetchRoute = {
  match: (url: string, init?: RequestInit) => boolean;
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>;
};

export function installFetchStub(routes: FetchRoute[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const effectiveInit = input instanceof Request
      ? { method: input.method, headers: input.headers, body: undefined, ...init }
      : init;
    for (const route of routes) {
      if (route.match(url, effectiveInit)) {
        return await route.respond(url, effectiveInit);
      }
    }
    throw new Error(`Unmocked fetch call in test: ${url}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Builds a syntactically valid, unsigned JWT so libraries like
// `supabase-js`'s `getClaims()` accept the structure (header.payload.sig)
// and fall back to a real `getUser()` network call instead of short-
// circuiting on `AuthInvalidJwtError: Invalid JWT structure`. The signature
// segment is not cryptographically valid -- these tests never verify it,
// they only rely on the stubbed `/auth/v1` fetch route.
export function makeTestJwt(payload: Record<string, unknown> = {}): string {
  const base64url = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    sub: "user-uuid",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  };
  return `${base64url(header)}.${base64url(body)}.testsig`;
}
