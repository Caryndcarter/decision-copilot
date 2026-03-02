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
const DEFAULT_MODEL = "claude-sonnet-4-6";
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

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
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

  const rawBody = await response.text();

  if (!response.ok) {
    let message = `Anthropic API error: ${response.status}`;
    if (rawBody?.trim()) {
      try {
        const error = JSON.parse(rawBody) as { error?: { message?: string }; message?: string };
        message = error?.error?.message ?? error?.message ?? message;
      } catch {
        message = rawBody.slice(0, 200);
      }
    }
    const retryable = response.status >= 500 || response.status === 429;
    throw createError(`HTTP_${response.status}`, message, retryable);
  }

  let data: Record<string, unknown>;
  if (!rawBody?.trim()) {
    throw createError("EMPTY_RESPONSE", "Anthropic returned an empty response", true);
  }
  try {
    data = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw createError("INVALID_JSON", `Anthropic response was not valid JSON: ${rawBody.slice(0, 100)}`, true);
  }

  // Extract content - handle both text and tool_use responses
  let content = "";
  let parsed: unknown;

  for (const block of data.content ?? []) {
    if ((block as { type?: string }).type === "text") {
      const text = (block as { text?: string }).text ?? "";
      content += text;
      // If we requested schema but got no tool_use, model may have returned JSON in text
      if (!parsed && text.trim().startsWith("{")) {
        const obj = safeJsonParse(text.trim());
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          parsed = obj;
        }
      }
    } else if (
      (block as { type?: string; name?: string }).type === "tool_use" &&
      (block as { name?: string }).name === "structured_response"
    ) {
      const input = (block as { input?: unknown }).input;
      if (input !== undefined && input !== null) {
        parsed = typeof input === "string" ? safeJsonParse(input) : input;
        content = typeof parsed === "object" && parsed !== null ? JSON.stringify(parsed) : String(input);
      }
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
