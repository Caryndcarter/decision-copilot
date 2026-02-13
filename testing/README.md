# Testing the decision run API

## Prerequisites

- **MongoDB** running (e.g. `npm run mongo:start` from repo root).
- **`.env`** in repo root with `MONGODB_URI` (e.g. `mongodb://localadmin:localpassword@localhost:27447`).
- **Next.js** dev server: `npm run dev` from repo root (or `npm run dev` in `packages/nextjs`).

## 1. Test intake (persists to MongoDB)

From repo root:

```bash
./testing/test-api.sh
```

Or with an explicit request file:

```bash
./testing/test-api.sh testing/requests/explore-db-switch.json
```

- The response is printed and saved under `testing/responses/`.
- Copy `run_id` and `decision_id` from the response if you want to test clarification or check the DB.

## 2. Verify the run is in MongoDB

**Option A – mongosh**

```bash
mongosh "mongodb://localadmin:localpassword@localhost:27447" --eval 'db.getSiblingDB("decision-copilot").runs.find().pretty()'
```

**Option B – MongoDB Compass**

- Connect to `mongodb://localadmin:localpassword@localhost:27447`.
- Open database `decision-copilot`, collection `runs`.
- You should see one document per run (intake + lens output, etc.).

## 3. Test clarification (reads/updates from MongoDB)

1. From a previous intake response, note `decision_id` and `run_id`.
2. Create a request file (e.g. `testing/requests/clarification.json`) with:

```json
{
  "type": "clarification",
  "decision_id": "<PASTE_DECISION_ID>",
  "run_id": "<PASTE_RUN_ID>",
  "clarification": {
    "clarification_round": 1,
    "answers": [
      { "question_id": "q1", "lens": "risk", "answer": "Intermediate", "answer_type": "enum" },
      { "question_id": "q2", "lens": "risk", "answer": true, "answer_type": "boolean" },
      { "question_id": "q3", "lens": "risk", "answer": 50, "answer_type": "numeric" }
    ]
  }
}
```

Replace `question_id` values with the ones from your intake response’s `clarification_questions`, and set answers to match the types.

3. Run:

```bash
./testing/test-api.sh testing/requests/clarification.json
```

You should get back the updated run with `status: "complete"` and a new `decision_brief` / `lens_outputs`.

## 4. Test persistence across restarts

1. Run an intake with `./testing/test-api.sh` and note the `run_id`.
2. Stop the Next.js dev server (Ctrl+C), then start it again (`npm run dev`).
3. Call the clarification endpoint with that same `run_id` (step 3 above).

If the run is found and updated, runs are persisting in MongoDB across restarts.
