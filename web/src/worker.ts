import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env {
  ASSETS: Fetcher;
  BACKEND_URL: string;
  BACKEND_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  LOCAL_DEMO?: string;
  API_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const reads = new Set(["/api/status", "/api/topics", "/api/bodies", "/api/search", "/api/classifications", "/api/evaluation", "/api/digitalisation", "/api/digitalisation/benchmark"]);
const writes = new Set(["/api/fact-checks", "/api/topics", "/api/topics/draft", "/api/brief", "/api/research/search", "/api/research/analyse"]);
export function allowed(method: string, path: string): boolean {
  return method === "GET" && (reads.has(path) || /^\/api\/affairs\/\d+$/.test(path)) ||
    method === "POST" && (writes.has(path) || /^\/api\/fact-checks\/[a-f0-9]{32}\/sentences\/\d+$/.test(path) || /^\/api\/affairs\/\d+\/(classify|review)$/.test(path));
}

function secured(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {status: response.status, headers});
}
function failure(status: number, detail: string): Response {
  return secured(Response.json({detail}, {status}));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const local = env.LOCAL_DEMO === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!url.pathname.startsWith("/api/")) {
      if (!["/", "/index.html", "/assets/app.js", "/assets/focus.js", "/assets/factcheck.js", "/assets/style.css"].includes(url.pathname) || !["GET", "HEAD"].includes(request.method)) return failure(404, "Not found");
      return secured(await env.ASSETS.fetch(request));
    }
    if (!allowed(request.method, url.pathname)) return failure(404, "API route not exposed");
    if (url.search.length > 12000) return failure(414, "Query too long");
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return failure(403, "Cross-origin requests disabled");
    let identity = "local";
    if (!local) {
      if (!env.BACKEND_TOKEN || !env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN?.match(/^[a-z0-9-]+\.cloudflareaccess\.com$/)) return failure(503, "Remote API requires Access and backend authentication configuration");
      const token = request.headers.get("cf-access-jwt-assertion");
      if (!token) return failure(401, "Cloudflare Access login required");
      try {
        const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
        let keys = keysets.get(issuer);
        if (!keys) { keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)); keysets.set(issuer, keys); }
        const verified = await jwtVerify(token, keys, {issuer, audience: env.ACCESS_AUD, algorithms: ["RS256"]});
        if (!verified.payload.sub) return failure(401, "Access subject missing");
        identity = verified.payload.sub;
      } catch { return failure(401, "Invalid Access token"); }
    }
    if (!env.API_LIMITER || !(await env.API_LIMITER.limit({key: identity})).success) return failure(429, "Request limit reached. Retry in a minute.");
    let backend: URL;
    try { backend = new URL(env.BACKEND_URL); } catch { return failure(503, "Backend not configured"); }
    if (backend.username || backend.password || backend.pathname !== "/" || backend.search || backend.hash ||
      (!local && backend.protocol !== "https:") || (local && !["http:", "https:"].includes(backend.protocol))) return failure(503, "Invalid backend origin");
    let body: string | undefined;
    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(415, "JSON required");
      const reader = request.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 32768) { await reader.cancel(); return failure(413, "Request too large"); }
          chunks.push(chunk.value);
        }
      }
      body = await new Blob(chunks as BlobPart[]).text();
      try { JSON.parse(body); } catch { return failure(400, "Invalid JSON"); }
    }
    const headers = new Headers({"Content-Type": "application/json"});
    if (env.BACKEND_TOKEN) headers.set("Authorization", `Bearer ${env.BACKEND_TOKEN}`);
    try {
      const response = await fetch(new URL(url.pathname + url.search, backend), {method: request.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(180000)});
      if (response.status >= 300 && response.status < 400) return failure(502, "Backend redirects are disabled");
      if (response.status >= 500) return failure(502, "Backend unavailable. Retry later; completed classifications are cached.");
      return secured(new Response(response.body, {status: response.status, headers: {"Content-Type": response.headers.get("content-type") || "application/json", "Content-Disposition": response.headers.get("content-disposition") || "inline"}}));
    } catch (error) {
      if (local) console.error("Local backend request failed:", error instanceof Error ? error.message : "Unknown error");
      return failure(502, "Backend unreachable or timed out. Check the backend service.");
    }
  }
};
