# Refreshed VLR and Classic

The default route `/` explores a bundled historical VCT 2025 dataset: 71 maps, 14 teams, February 20–June 22. Models train on Masters Bangkok and score held-out Masters Toronto maps. It computes genuine Elo, logistic and blended probabilities locally; dataset label conflicts and calibration limits remain visible. There is no live feed in the refreshed default.

```
/                       Historical model explorer
/api/vlr/*              Historical predict, series, metrics
/classic                Original FastAPI prediction form
/classic/dashboard      Original dashboard
/classic/history        Existing browser prediction history
/dashboard, /history    Redirect to Classic counterparts
```

Classic retains `NEXT_PUBLIC_API_BASE` (default http://localhost:8000), the existing `theme` and `vlr-prediction-history` browser keys, live and calibrated API calls, exports and saved predictions. Modern keys are namespaced `vlr-modern:*`. Switching between experiences uses a full document load, isolating CSS and runtime preferences. Browser history survives only on the same origin; changing domain, port or browser is not a storage migration.

From `frontend/`:

```
npm ci
npm test -- --run
npx tsc --noEmit
npm run build
cp -R public .next/standalone/public
cp -R .next/static .next/standalone/.next/static
PORT=3240 HOSTNAME=127.0.0.1 node .next/standalone/server.js
```

Explicit file tracing includes all nine historical CSV/JSON files in standalone output. Fonts are local: refreshed Inter/JetBrains Mono and preserved Classic Geist/Geist Mono Latin assets, with licenses in public/fonts. Source attribution is in licenses/VLR-PROVENANCE.md.

The Python backend, model caches and personal SQLite databases are outside this frontend migration. Original FastAPI availability and live provider/model results require separate verification with the real configured backend. Local browser acceptance uses owned synthetic history and does not prove live predictions.
