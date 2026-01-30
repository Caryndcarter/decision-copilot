/**
 * Anthropic LLM Provider
 *
 * SERVER-ONLY: Do not import from client/UI code.
 */

import "server-only";
import type {
  LLMClient,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMError,
} from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;
const API_VERSION = "2023-06-01";

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw createError("MISSING_API_KEY", "ANTHROPIC_API_KEY environment variable is not set");
  }
  return key;
}

function createError(code: string, message: string, retryable = false): LLMError {
  return { code, message, provider: "anthropic", retryable };
}

function normalizeMessages(prompt: string | LLMMessage[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  if (typeof prompt === "string") {
    return {
      messages: [{ role: "user", content: prompt }],
    };
  }

  // Extract system message if present (Anthropic handles it separately)
  const systemMessage = prompt.find((m) => m.role === "system");
  const otherMessages = prompt
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  return {
    system: systemMessage?.content,
    messages: otherMessages,
  };
}

export async function run(
  prompt: string | LLMMessage[],
  options: LLMRequestOptions = {}
): Promise<LLMResponse> {
  const apiKey = getApiKey();
  const { system, messages } = normalizeMessages(prompt);
  const model = options.model ?? DEFAULT_MODEL;

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: options.temperature ?? 0.7,
  };

  if (system) {
    requestBody.system = system;
  }

  // Add tool for structured output if schema provided
  // Anthropic uses tool_use for structured JSON output
  if (options.schema) {
    requestBody.tools = [
      {
        name: "structured_response",
        description: "Return a structured response matching the schema",
        input_schema: options.schema,
      },
    ];
    requestBody.tool_choice = { type: "tool", name: "structured_response" };
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error?.error?.message ?? `Anthropic API error: ${response.status}`;
    const retryable = response.status >= 500 || response.status === 429;
    throw createError(`HTTP_${response.status}`, message, retryable);
  }

  const data = await response.json();

  // Extract content - handle both text and tool_use responses
  let content = "";
  let parsed: unknown;

  for (const block of data.content ?? []) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "tool_use" && block.name === "structured_response") {
      parsed = block.input;
      content = JSON.stringify(block.input);
    }
  }

  return {
    content,
    parsed,
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        }
      : undefined,
    meta: {
      model: data.model ?? model,
      provider: "anthropic",
      finishReason: data.stop_reason,
    },
  };
}

// Export a client object matching the LLMClient interface
export const anthropic: LLMClient = { run };
