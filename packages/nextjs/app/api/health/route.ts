import { NextResponse } from "next/server";
import database from "../../../server/config/database.js";

/**
 * Health check endpoint
 * GET /api/health
 */
export async function GET() {
  try {
    await database.connect();

    if (!database.db) {
      return NextResponse.json(
        { status: "error", message: "Database not connected" },
        { status: 503 }
      );
    }

    // Simple ping to verify connection
    await database.db.command({ ping: 1 });

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Health check error:", message);
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}
