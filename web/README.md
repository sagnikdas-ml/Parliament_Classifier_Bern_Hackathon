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

## PoliBot: document chat and optional speech

PoliBot is an isolated floating widget on the existing journalist page. Generate
**Summarize Results** or open a record's **Evidence** and choose **Explain Document**,
then ask follow-up questions in its chat box. The original news, history,
classification and research workflows remain available.

Briefings are extractive: FastAPI reloads canonical cached records, checks
classification currency and quotation matches, and reuses cached English
translations. A briefing shows at most three source previews from ten current
records without making a new Apertus call. Missing evidence is reported explicitly.

Chat uses the selected Apertus model with the submitted article (unverified
context), stored assessments, source metadata, conversation history and original
document passages. It retrieves question-relevant cached text independently of
classification quotations: up to eight excerpts from three documents. Selected
record mode stays within that record; research mode can search the local catalogue
for related records. Missing extracted text can be fetched for two known affairs,
with an eight-second timeout per request. Long documents are excerpted; this is
not exhaustive archive retrieval or live web research.

Answers are concise and in English. Document-based answers include canonical
source links; general conceptual explanations are labeled **General background**
and do not verify a specific event or law. Missing citations do not prevent an
explanation of why a claim is unverified. Source interpretation still depends on
Apertus and needs human review. Chat sends the last three question/answer pairs to
the configured inference provider for reference resolution; these are not evidence.
Conversation state stays in browser memory and clears on a new briefing or context.

### Integration and configuration

No new dependencies are required beyond the existing Python and frontend lockfiles.
Copy the root `.env.example` to `.env`, fill in backend credentials, then run:

```sh
bash scripts/run_demo.sh
```

The launcher loads the Git-ignored `.env`. `KEERA_API_KEY` enables Apertus (the
existing `.key` fallback also works). `ELEVENLABS_API_KEY` enables optional speech;
`ELEVENLABS_VOICE_ID` overrides the default voice. Never commit keys or place them
in frontend assets, browser storage or public Wrangler vars. Text works without
ElevenLabs. The optional voice checkbox narrates briefings; chat replies are text.

FastAPI endpoints are `GET /api/polibot/status` and POSTs to
`/api/polibot/summary`, `/api/polibot/chat`, and `/api/polibot/speech`. Existing
backend authentication and origin checks apply. The Worker explicitly exposes
these routes and widget assets, retains Access/rate limits, and allows same-origin
blob audio through CSP. Speech accepts bounded source context rather than arbitrary
narration. A snapshot fingerprint prevents speaking or discussing obsolete evidence.

Speech uses ElevenLabs' [Create speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert),
`eleven_multilingual_v2`, and MP3 output, with a 25-second timeout, 3 MB response cap,
two concurrent calls per process and no response caching. **Stop Speaking** aborts
pending browser requests and reclaims local audio; it cannot cancel provider work
or charges already incurred. Voice access, quota, retention and billing depend on
the configured ElevenLabs account. Production hosting still needs the backend and
Access configuration documented above.

### Validation

The 97-test Python suite and six Worker tests pass, as does the frontend dry-run
build. Coverage includes citation and source revalidation, stale snapshots, scoped
document retrieval, bounded downloads, missing credentials, provider failures,
chat history validation, authentication and gateway audio forwarding. Chrome checks
exercised the widget, document modal, playback/Stop behavior, pending-request
cancellation, text fallback, mobile bounds and reduced motion. Live Apertus 8B/70B
checks covered assessment explanations, general background and reasoning from
document text; a live ElevenLabs request returned valid MP3 audio. Production
browser autoplay behavior and independent answer-quality evaluation remain open.
