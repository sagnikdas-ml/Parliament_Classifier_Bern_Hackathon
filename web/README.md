# PoliNews frontend

The main demo needs no Node build: from the repository root run
`bash scripts/run_demo.sh`, then open http://127.0.0.1:8000.
The classification lab is at `/admin`; the journalist workspace is at `/`.

The default screen checks news sentence by sentence, combines political scope with archive evidence, and flags uncertain political claims for editorial review. Apolitical sentences are excluded from review notices. The research tab sends a natural-language question to `/api/research/search`, shows
up to ten date-filtered candidates, and processes `/api/research/analyse` one affair
at a time. This avoids a single long ten-affair Worker request. English titles and
source passages are machine translations; originals remain available in Evidence.
The research tab uses viewport-sized pagination instead of full-page scrolling.

## Exercise the Worker locally

With the Python backend running on port 8000:

```sh
cd web
npm ci
npm test
npm run build
npm run dev
```

Open the local Wrangler URL (normally http://localhost:8787). Both servers must
remain running. Local mode allows unauthenticated loopback use only. Never expose
the development servers to the internet. `/admin`, `/chat`, and batch-management
routes deliberately are not forwarded; use the direct local backend for these.

Local gateway smoke check:

```sh
curl --fail http://localhost:8787/api/status
curl -o /dev/null -w '%{http_code}\n' http://localhost:8787/api/jobs
```

The first command returns collection counts; the second must return `404`.

## Deploy later, not needed for this demo

1. Provision a persistent Python backend reachable through HTTPS. Keep its single
   DuckDB writer and existing file locking; do not share the database among replicas.
2. Set `PARL_BACKEND_TOKEN` on that backend to a strong random secret and restart it.
   With this setting every backend route requires the bearer token. Keep Apertus
   credentials on this backend, never in frontend assets or Wrangler variables.
3. Configure the same secret with `npx wrangler secret put BACKEND_TOKEN`.
4. Set `BACKEND_URL` to its HTTPS origin, without a path or credentials.
5. Configure a Cloudflare Access self-hosted application for your intended domain,
   with an explicit allow policy. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` from
   that application. Add your custom-domain route to Wrangler configuration.
6. Run tests and `npm run build`, then `npm run deploy` when authorized.

Production intentionally disables workers.dev and preview URLs. All API routes,
including reads, require cryptographically verified Access JWTs and the backend
secret. Static frontend assets contain no data or credentials. Missing security
configuration fails closed. The gateway does not forward browser cookies, arbitrary
headers, arbitrary URLs, redirects, SQL, or administrator/batch endpoints.

The request limiter caps API calls per Access subject; it is not a monthly billing
cap. Configure provider-side spend limits before granting broader access. POST
bodies are capped at 32 KiB. Proxy timeouts do not cancel a backend classification;
retrying can retrieve its cached result. There is no scheduled monitoring service.

Do not enable body/query logging or add analytics containing research interests.
Disable or sanitize backend/reverse-proxy access logs. The local launcher disables
Uvicorn access logs. Install dependency/security updates before remote deployment.

References: [Worker static asset binding](https://developers.cloudflare.com/workers/static-assets/binding/),
[Access JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
