/**
 * LLM Provider Types
 *
 * IMPORTANT: These modules are server-only.
 * Do not import from client/UI code.
 */

export type LLMProvider = "openai" | "anthropic";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequestOptions {
  /** Model identifier (provider-specific) */
  model?: string;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for response randomness (0-1) */
  temperature?: number;
  /** Optional JSON schema for structured output */
  schema?: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  /** Parsed JSON if schema was provided and response is valid JSON */
  parsed?: unknown;
  /** Token usage stats */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Provider-specific metadata */
  meta?: {
    model: string;
    provider: LLMProvider;
    finishReason?: string;
  };
}

export interface LLMError {
  code: string;
  message: string;
  provider: LLMProvider;
  retryable: boolean;
}

/**
 * Common interface for LLM providers
 */
export interface LLMClient {
  run(prompt: string | LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse>;
}
