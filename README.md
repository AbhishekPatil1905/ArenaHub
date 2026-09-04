# AI Turf Booking App

Mini project (Indira University, B.Sc. AI & ML, Sem III) — an
AI-powered turf discovery and booking app for Pune, covering both PCMC
and PMC, inspired by BookMyShow's booking flow.

- **`/backend`** — Express API: live OpenStreetMap (Overpass API) sweep
  across PCMC + PMC (cached in Supabase, no key or billing needed), a
  real booking schedule with a database-level uniqueness constraint (no
  double-booking), and a proxy for the three GenAI features so the
  Anthropic key never touches the browser.
- **`/frontend`** — React + Vite + Tailwind client: Home & discovery,
  AI Pick, turf detail with slot grid + AI review summary, a chat/voice
  assistant, and a My Bookings screen with cancel.

## Setup order

1. `backend/README.md` — Supabase + Anthropic keys (no Google/billing
   needed), run the server, populate the live turf cache.
2. `frontend/README.md` — point it at the running backend, `npm run dev`.

## Repo structure

```
ai-turf-booking-app/
├── backend/
│   ├── db/            (Supabase client + schema.sql)
│   ├── routes/         (turfs.js, bookings.js, ai.js)
│   ├── localities.js   (PCMC + PMC seed points)
│   └── server.js
└── frontend/
    └── src/
        ├── App.jsx      (all screens)
        └── main.jsx
```
