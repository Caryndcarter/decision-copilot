import { NextResponse } from "next/server";
import type { LLMProviderName } from "@/types/decision";

/**
 * GET /api/decision/providers
 * Returns which LLM providers are configured (have API keys set).
 * Used so the UI only offers choices that will work.
 */
export async function GET(): Promise<NextResponse<{ providers: LLMProviderName[] }>> {
  const providers: LLMProviderName[] = [];
  if (process.env.OPENAI_API_KEY?.trim()) {
    providers.push("openai");
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    providers.push("anthropic");
  }
  return NextResponse.json({ providers });
}
