/**
 * Decision run persistence in MongoDB.
 * Falls back to in-memory store if MongoDB is unreachable (e.g. network timeout).
 * SERVER-ONLY: use from API routes only.
 */

import database from "@/server/config/database.js";
import type { DecisionRunResult } from "@/types/decision";

const COLLECTION = "runs";
const memoryStore = new Map<string, DecisionRunResult>();
let useMemoryFallback = false;

async function ensureConnection(): Promise<boolean> {
  if (useMemoryFallback) return false;
  try {
    await database.connect();
    return true;
  } catch (err) {
    console.warn(
      "MongoDB unavailable, using in-memory store. Runs will not persist across restarts.",
      err instanceof Error ? err.message : err
    );
    useMemoryFallback = true;
    return false;
  }
}

export async function getRun(run_id: string): Promise<DecisionRunResult | null> {
  const connected = await ensureConnection();
  if (!connected) return memoryStore.get(run_id) ?? null;
  const doc = await database.getCollection(COLLECTION).findOne({ run_id });
  return doc as DecisionRunResult | null;
}

export async function insertRun(result: DecisionRunResult): Promise<void> {
  const connected = await ensureConnection();
  if (!connected) {
    memoryStore.set(result.run_id, result);
    return;
  }
  await database.getCollection(COLLECTION).insertOne({
    ...result,
    createdAt: new Date(),
  });
}

export async function replaceRun(run_id: string, result: DecisionRunResult): Promise<void> {
  const connected = await ensureConnection();
  if (!connected) {
    memoryStore.set(run_id, result);
    return;
  }
  await database.getCollection(COLLECTION).updateOne(
    { run_id },
    { $set: { ...result, updatedAt: new Date() } }
  );
}
