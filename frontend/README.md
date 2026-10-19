# PoliNews UI: calm editorial interface (React + Vite + Tailwind + Framer Motion)

Two views, no sidebar or navbar (a floating dock; keys `1` / `2` switch):

1. **Policy map**: digitalisation affairs as a typographic wall. Hover softly dims the rest and expands an affair into a
   *multi-parent node*: curves to the ad-hoc "Digitalisation" tag and its 1–3 APS topics. "Reveal evidence" types out the verbatim
   quote and shows whether it is a real passage of the source. Click pins a node, `Esc` releases. An opt-in **Archive run status**
   button shows progress of the backend's archive classification (rate, estimated remaining time, judge agreement, top topics).
2. **Fact-check**: paste a story, pick language and model (Apertus 8B or 70B), a soft scan line reads it sentence by sentence and
   verdicts appear as inline underlines. Click a sentence for a margin note: source ID, author, verbatim quotation, suggested
   correction and a "Human review" switch.

**Easy on the eyes:** warm *Paper* theme by default, soft *Dusk* theme via the dock toggle (follows the system setting on first
visit). Muted sage / terracotta / ochre instead of neon, Newsreader serif for reading, Inter for the interface, IBM Plex Mono only for
IDs and quotations, no scanlines or flashing, slow transitions, and `prefers-reduced-motion` is respected.

## Run

```bash
bash scripts/run_demo.sh        # backend, http://127.0.0.1:8000   (optional: the UI works without it, in demo mode)
cd frontend
npm install                     # first time only
npm run dev                     # http://127.0.0.1:5173
```
`npm run build` makes a production bundle in `dist/`. Deep links: `/#scanner` opens the fact-check, `/#scan` also starts it.

## How it connects

Vite proxies `/api` to the backend and presents the backend's own origin (it rejects cross-origin writes).
Used endpoints: `GET /api/status`, `GET /api/classifications` + `/api/affairs/{id}` (policy map, per model),
`POST /api/fact-checks` (with `model`) and `.../sentences/{i}` (fact-check), `GET /api/jobs` + `/api/jobs/{id}` (archive run, on request only).

## Honest behaviour

- With the backend offline, or an archive of fewer than 1,000 affairs, the UI shows **demo data** and says so. Demo affairs are real
  OpenParlData records with real verbatim quotes; APS labels, scores and verdicts are illustrative.
- A live sentence that fails shows an error; it is never silently replaced by demo data.
- "Archive run status" is opt-in because the backend's `GET /api/jobs` can itself start the archive classification job.
- Judge agreement is agreement with a second LLM, not human-verified accuracy. Time estimates are linear extrapolations.
- "Human review" switches live in the browser session only; the backend has no endpoint for them yet.
- No archive match never means a claim is false: it is shown as unverified.
