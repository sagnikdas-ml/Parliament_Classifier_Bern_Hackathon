# ParlaRadar interface

React, Vite, Tailwind, and Framer Motion power the default two-view interface:
**News fact-check** and **Policy map**. Hover a checked sentence to open its evidence dossier on the right; click it to keep the dossier pinned. The map expands affairs into linked topics, authors, and dates.

## Run

Start the API from the repository root with `bash scripts/run_demo.sh`. For local UI development:

```sh
cd frontend
npm ci
npm run dev
```

Vite serves `http://127.0.0.1:5173` and proxies API calls to the local FastAPI server on port 8000. The app uses live backend data and reports failures directly; it does not replace results with demos. Build the production UI from the repository root with `npm --prefix frontend run build`; FastAPI serves it at `/`.

## PoliBot

The floating PoliBot is a native React component in both views and uses the same
Paper/Dusk theme variables. On the scanner it follows the current server run and
completed sentences; pinning a sentence scopes the briefing to that sentence.
On the policy map it receives up to ten displayed affair IDs, with a pinned record
included and selected even if it falls outside the first ten.

Use **Summarize Results**, or select a document and **Explain Document**, then ask
follow-up questions. Chat uses the existing `/api/polibot/chat` document retrieval
and Apertus endpoint. Optional English narration uses the existing server-side
ElevenLabs integration. Neither key is exposed in React or Vite configuration.
Changing stories, pinned documents, models or views clears stale context and stops
pending speech. Closing the widget or **Stop Speaking** cancels browser requests
and playback. Provider work already submitted may still incur usage.

The original widget stays available at `/legacy`. Configuration and backend
limitations are documented in `../web/README.md`. Run `npm test` for context and
request-client tests, and `npm run build` for the production bundle.

Integration checks cover scanner and map contexts, chat/citations, optional MP3
playback and Stop, theme changes, mobile navigation clearance and reduced motion.
The current upstream UI can stall its exit animation when switching views after a
completed check; this also reproduced with untouched main, so the bot integration
leaves navigation unchanged. A fresh page load at `/#map` opens the policy map.
