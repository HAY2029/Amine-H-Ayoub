import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getDeviceId } from "@/utils/deviceInfo";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

/** True when a real Supabase anon key is configured. */
export const hasValidSupabaseKey = (): boolean =>
  !!supabaseUrl && !!supabaseAnonKey && supabaseAnonKey !== "placeholder";

/**
 * No-op query builder: every chained method returns itself, and
 * resolving the promise yields { data: null, error: null }.
 * This prevents 401 errors when no Supabase key is configured.
 */
const NOOP_RESULT = { data: null, error: null, count: null, status: 200, statusText: "OK" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopBuilder: any = new Proxy(
  {},
  {
    get(_target, _prop) {
      // .then / .catch / .finally → make it thenable (Promise-like)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (_prop === "then") return (resolve: any) => Promise.resolve(NOOP_RESULT).then(resolve);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (_prop === "catch") return (reject: any) => Promise.resolve(NOOP_RESULT).catch(reject);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (_prop === "finally") return (cb: any) => Promise.resolve(NOOP_RESULT).finally(cb);
      // Any other chained call (.select, .eq, .single, .upsert, etc.) → return self
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (..._args: any[]) => noopBuilder;
    },
  }
);

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return async (input, init) => {
    // If device is offline, safely return empty response to prevent network failures
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const method = (init?.method || "GET").toUpperCase();
      const mockBody = method === "GET" ? "[]" : "{}";
      return new Response(mockBody, {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
    }

    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : "";
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    try {
      const devId = getDeviceId();
      if (devId) {
        headers.set('x-device-id', devId);
      }
    } catch {
      // ignore
    }
    return fetch(input, { ...init, headers });
  };
}

function createSafeClient(): SupabaseClient {
  if (hasValidSupabaseKey()) {
    let devId = "";
    try { devId = getDeviceId(); } catch { /* ignore */ }

    return createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
      global: {
        headers: {
          "Cache-Control": "no-cache",
          ...(devId ? { "x-device-id": devId } : {}),
        },
        fetch: createSupabaseFetch(supabaseAnonKey),
      },
    });
  }

  // When no key is available, return a proxy that silently no-ops every call.
  // This prevents ALL 401 errors across the entire app without touching each file.
  console.debug("[supabase] No valid API key — running in offline mode (no network requests).");
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      // .from(), .functions.invoke(), .auth, .storage, etc. → return noopBuilder
      if (prop === "functions") {
        return { invoke: () => Promise.resolve(NOOP_RESULT) };
      }
      if (prop === "from" || prop === "rpc") {
        return () => noopBuilder;
      }
      if (prop === "auth") {
        return {
          getSession: () => Promise.resolve({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        };
      }
      if (prop === "storage") {
        return { from: () => noopBuilder };
      }
      // Catch-all for any other property
      return () => noopBuilder;
    },
  });
}

// Create a safe supabase client - won't crash or make failing requests if credentials are missing
export const supabase = createSafeClient();
