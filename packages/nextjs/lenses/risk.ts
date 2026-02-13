/**
 * Risk Lens
 *
 * Analyzes a decision for potential risks, blind spots, and tradeoffs.
 * SERVER-ONLY: Do not import from client/UI code.
 */

import "server-only";
import { openai } from "@/llm";
import type { LLMMessage } from "@/llm/types";
import type {
  DecisionIntake,
  Posture,
  RiskLensOutput,
  BlindSpot,
  Tradeoff,
  LensQuestion,
  Clarification,
} from "@/types/decision";

// JSON Schema for structured output
const RISK_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "How confident are you in this analysis given the information provided",
    },
    top_risks: {
      type: "array",
      items: { type: "string" },
      description: "The most significant risks associated with this decision (3-7 items)",
    },
    assumptions_detected: {
      type: "array",
      items: { type: "string" },
      description: "Assumptions the decision-maker appears to be making",
    },
    blind_spots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string", description: "The area or category of the blind spot" },
          description: { type: "string", description: "What is being overlooked" },
        },
        required: ["area", "description"],
        additionalProperties: false,
      },
      description: "Areas the decision-maker may not be considering",
    },
    tradeoffs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          option: { type: "string", description: "The option or path being considered" },
          upside: { type: "string", description: "The potential benefit" },
          downside: { type: "string", description: "The potential cost or risk" },
        },
        required: ["option", "upside", "downside"],
        additionalProperties: false,
      },
      description: "Key tradeoffs to consider",
    },
    remaining_uncertainty: {
      type: "array",
      items: { type: "string" },
      description: "Information that would improve this analysis if known",
    },
    questions_to_answer_next: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_id: { type: "string" },
          lens: { type: "string", const: "risk" },
          question_text: { type: "string" },
          answer_type: { type: "string", enum: ["enum", "boolean", "numeric", "short_text"] },
          options: {
            type: ["array", "null"],
            items: { type: "string" },
            description: "Options for enum type, null otherwise",
          },
          required: { type: "boolean" },
        },
        required: ["question_id", "lens", "question_text", "answer_type", "options", "required"],
        additionalProperties: false,
      },
      description: "Follow-up questions that would help clarify risks (0-3 questions, only if critical gaps exist)",
    },
  },
  required: [
    "confidence",
    "top_risks",
    "assumptions_detected",
    "blind_spots",
    "tradeoffs",
    "remaining_uncertainty",
    "questions_to_answer_next",
  ],
  additionalProperties: false,
} as const;

function getPostureInstruction(posture: Posture, leaningDirection?: string): string {
  switch (posture) {
    case "explore":
      return "The user is exploring this decision openly. Provide balanced analysis of risks across all options.";
    case "pressure_test":
      return `The user is leaning toward: "${leaningDirection}". Actively challenge this direction - look for risks they may be downplaying or ignoring because of their bias toward this choice.`;
    case "surface_risks":
      return "The user specifically wants to understand risks. Be thorough and don't soften the risks. Surface even uncomfortable possibilities.";
    case "generate_alternatives":
      return "The user wants to explore alternatives. For each risk you identify, consider whether it points to an alternative approach that might avoid that risk.";
  }
}

function formatClarificationsForPrompt(clarifications: Clarification[]): string {
  if (!clarifications.length) return "";
  const lines = clarifications.flatMap((c) =>
    c.answers.map((a) => `- ${a.question_id} (${a.lens}): ${String(a.answer)}`)
  );
  return `\n\n## Follow-up answers from the user\n${lines.join("\n")}\n\nUse these answers to refine your risk analysis. Do not ask the same questions again.`;
}

export function buildRiskPrompt(
  intake: DecisionIntake,
  clarifications: Clarification[] = []
): LLMMessage[] {
  const postureInstruction = getPostureInstruction(
    intake.posture,
    intake.posture === "pressure_test" ? intake.leaning_direction : undefined
  );

  const systemPrompt = `You are a risk analyst helping someone think through an important decision. Your job is to surface risks, assumptions, and blind spots they may not have considered.

${postureInstruction}

Be specific and actionable. Avoid generic advice. Ground your analysis in the specific situation described.

If critical information is missing that would significantly change your risk assessment, include 1-3 focused follow-up questions. Only ask questions if the gaps are significant.`;

  let userContent = `## Decision Context

**Situation:** ${intake.situation}

**Constraints:** ${intake.constraints}

${intake.knowns_assumptions ? `**What I know / am assuming:** ${intake.knowns_assumptions}` : ""}

${intake.unknowns ? `**What I don't know:** ${intake.unknowns}` : ""}

Analyze the risks of this decision.`;
  userContent += formatClarificationsForPrompt(clarifications);

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

interface RawRiskOutput {
  confidence: "high" | "medium" | "low";
  top_risks: string[];
  assumptions_detected: string[];
  blind_spots: Array<{ area: string; description: string }>;
  tradeoffs: Array<{ option: string; upside: string; downside: string }>;
  remaining_uncertainty: string[];
  questions_to_answer_next: Array<{
    question_id: string;
    lens: "risk";
    question_text: string;
    answer_type: "enum" | "boolean" | "numeric" | "short_text";
    options: string[] | null;
    required: boolean;
  }>;
}

export function parseRiskOutput(parsed: unknown): RiskLensOutput {
  const raw = parsed as RawRiskOutput;

  // Map to our types with defaults for safety
  const output: RiskLensOutput = {
    lens: "risk",
    confidence: raw.confidence ?? "medium",
    top_risks: raw.top_risks ?? [],
    assumptions_detected: raw.assumptions_detected ?? [],
    blind_spots: (raw.blind_spots ?? []).map(
      (b): BlindSpot => ({
        area: b.area,
        description: b.description,
      })
    ),
    tradeoffs: (raw.tradeoffs ?? []).map(
      (t): Tradeoff => ({
        option: t.option,
        upside: t.upside,
        downside: t.downside,
      })
    ),
    remaining_uncertainty: raw.remaining_uncertainty ?? [],
    questions_to_answer_next: (raw.questions_to_answer_next ?? []).map(
      (q): LensQuestion => ({
        question_id: q.question_id,
        lens: "risk",
        question_text: q.question_text,
        answer_type: q.answer_type,
        options: q.options ?? undefined,
        required: q.required,
      })
    ),
  };

  return output;
}

export async function runRiskLens(
  intake: DecisionIntake,
  clarifications: Clarification[] = []
): Promise<RiskLensOutput> {
  const messages = buildRiskPrompt(intake, clarifications);

  const response = await openai.run(messages, {
    schema: RISK_OUTPUT_SCHEMA,
    temperature: 0.7,
    maxTokens: 2048,
  });

  if (!response.parsed) {
    throw new Error("Risk lens did not return valid structured output");
  }

  return parseRiskOutput(response.parsed);
}
