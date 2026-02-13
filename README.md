# Decision Copilot

A decision-support app that helps you think through important decisions using three analysis lenses (Risk, Reversibility, People), optional follow-up questions, and an AI-generated decision brief.

## What it does

1. **Intake** — You describe the situation, constraints, and choose a posture (Explore, Pressure test, Surface risks, Generate alternatives). For “Pressure test” you also indicate what you’re leaning toward.

2. **Three-lens analysis** — The app runs three lenses in parallel:
   - **Risk** — Top risks, assumptions, blind spots, tradeoffs, remaining uncertainty.
   - **Reversibility** — Irreversible steps, safe-to-try-first options.
   - **People** — Stakeholder impacts (who’s affected, how, positive/negative/neutral), execution risks.

3. **Clarification (optional)** — If a lens needs more information, it can ask follow-up questions. You answer with Yes/No/Unknown, numbers, percentages, short text, or options. The analysis is then re-run with your answers so the model doesn’t repeat the same questions.

4. **Decision brief** — After lenses (and any clarification), an AI synthesis produces a brief: a short title, summary, recommendation, key considerations, and next steps, with a generated-at timestamp.

Runs are stored in MongoDB (or in-memory if MongoDB is unavailable). The result page shows context, all three lens outputs, the clarification form when needed, and the decision brief.

## Tech stack

- **App:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS.
- **LLM:** OpenAI (structured outputs for lenses and brief). Server-only.
- **Data:** MongoDB for run persistence; optional migrations package.
- **Monorepo:** npm workspaces (`packages/nextjs`, `packages/migrations`, etc.).

## MongoDB persistence layer

We added a persistence layer so every decision run is stored and can be loaded later.

- **Where:** `packages/nextjs/lib/db/runs.ts` — server-only; used by the decision run API route. DB connection/config lives in `packages/nextjs/server/config/database.js`.
- **What it does:**
  - **insertRun(result)** — Persists a new run (after initial intake or when creating a run).
  - **getRun(run_id)** — Fetches a run by ID (used when submitting clarification and for GET `/api/decision/run?run_id=xxx`).
  - **replaceRun(run_id, result)** — Updates an existing run (e.g. after clarification re-run).
- **Storage:** When `MONGODB_URI` is set and the app can connect, runs are stored in MongoDB (collection: `runs`). When MongoDB is unavailable (e.g. not configured, network error), the layer falls back to an in-memory store so the app still runs; those runs are lost on restart.
- **Why:** Persisting runs lets users return to a result (e.g. via `/run/result?run_id=xxx`), submit clarification for an existing run, and keeps a history of runs in the database.

## Project structure

```
decision-copilot/
├── packages/
│   ├── nextjs/                 # Next.js app
│   │   ├── app/
│   │   │   ├── page.tsx        # Home
│   │   │   ├── intake/         # Intake form
│   │   │   ├── run/result/     # Result + clarification form
│   │   │   └── api/decision/run/  # POST run (intake or clarification)
│   │   ├── lenses/             # Risk, Reversibility, People, Brief (AI)
│   │   ├── llm/                # OpenAI (and optional Anthropic) client
│   │   ├── lib/db/             # Run persistence (MongoDB + in-memory fallback)
│   │   ├── server/             # Express server / DB config (if used)
│   │   └── types/              # decision.ts (intake, lenses, brief, run)
│   └── migrations/             # DB migrations
├── testing/                    # Request/response samples, test scripts
├── .env                        # See "Environment" below
└── package.json               # Workspace root; dev/build/migrate scripts
```

## Getting started

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- (Optional) MongoDB — local or Atlas. If not configured or unreachable, the app falls back to an in-memory store (runs lost on restart).

### Install and run

```bash
npm install
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000). Use “Start a decision intake” to begin.

### Environment

Create a `.env` at the repo root. Relevant variables:

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Required for lenses and decision brief. |
| `MONGODB_URI` | Optional. If set and reachable, runs are stored in MongoDB; otherwise in-memory. |

Other env (e.g. `PROJECT_KEY`, `PROJECT_ENV`, `Anthropic API Key`) may be used by other tooling or future features.

### Other scripts

- `npm run build` — Build all workspaces.
- `npm run typecheck` — Type-check all workspaces.
- `npm run migrate:up` / `migrate:down` / `migrate:status` — Run migrations (see `packages/migrations`).
- `npm run mongo:start` / `mongo:stop` — Local MongoDB via Docker (if configured).

## API

- **POST `/api/decision/run`**
  - **Intake:** `{ "type": "intake", "intake": { "situation", "constraints", "posture", ... } }`  
    Runs the three lenses (and brief if no clarification needed). Returns full run result; store or redirect to result page.
  - **Clarification:** `{ "type": "clarification", "decision_id", "run_id", "clarification": { "clarification_round", "answers": [...] } }`  
    Re-runs lenses with user answers and generates the brief. Returns updated run result.

Response includes `status` (e.g. `awaiting_clarification`, `complete`), `lens_outputs`, `clarification_questions` (when applicable), and `decision_brief` (title, generated_at, summary, recommendation, key_considerations, next_steps).

## Clarification question types

- **Yes/No** — Options: Yes, No, Unknown.
- **Numeric** — Free-form number.
- **Percentage** — 0–100, shown with “%” and passed to the model as e.g. “25%”.
- **Short text** — Free-form text.
- **Enum** — Select one of the given options.

Answers are included in re-run prompts; “Unknown” is formatted as “unknown (user didn’t know)” so the model can treat it appropriately.

## License

Private / not specified.
