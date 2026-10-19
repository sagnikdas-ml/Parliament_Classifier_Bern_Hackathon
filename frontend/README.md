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
