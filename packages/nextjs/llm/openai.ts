/**
 * OpenAI LLM Provider
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

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 4096;

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw createError("MISSING_API_KEY", "OPENAI_API_KEY environment variable is not set");
  }
  return key;
}

function createError(code: string, message: string, retryable = false): LLMError {
  return { code, message, provider: "openai", retryable };
}

function normalizeMessages(prompt: string | LLMMessage[]): LLMMessage[] {
  if (typeof prompt === "string") {
    return [{ role: "user", content: prompt }];
  }
  return prompt;
}

export async function run(
  prompt: string | LLMMessage[],
  options: LLMRequestOptions = {}
): Promise<LLMResponse> {
  const apiKey = getApiKey();
  const messages = normalizeMessages(prompt);
  const model = options.model ?? DEFAULT_MODEL;

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: options.temperature ?? 0.7,
  };

  // Add JSON schema for structured output if provided
  if (options.schema) {
    requestBody.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response",
        strict: true,
        schema: options.schema,
      },
    };
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error?.error?.message ?? `OpenAI API error: ${response.status}`;
    const retryable = response.status >= 500 || response.status === 429;
    throw createError(`HTTP_${response.status}`, message, retryable);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";

  let parsed: unknown;
  if (options.schema) {
    try {
      parsed = JSON.parse(content);
    } catch {
      // Content wasn't valid JSON despite schema request
    }
  }

  return {
    content,
    parsed,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
    meta: {
      model: data.model ?? model,
      provider: "openai",
      finishReason: choice?.finish_reason,
    },
  };
}

// Export a client object matching the LLMClient interface
export const openai: LLMClient = { run };
