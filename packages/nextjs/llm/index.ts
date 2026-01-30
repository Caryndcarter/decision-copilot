/**
 * LLM Provider Module
 *
 * SERVER-ONLY: Do not import from client/UI code.
 * The `server-only` import will throw a build error if used in client code.
 *
 * Usage:
 *   import { openai, anthropic } from "@/llm";
 *   const response = await openai.run("Hello, world!");
 *   const structured = await anthropic.run("Analyze this", { schema: mySchema });
 */

import "server-only";

export * from "./types";
export { openai, run as runOpenAI } from "./openai";
export { anthropic, run as runAnthropic } from "./anthropic";
