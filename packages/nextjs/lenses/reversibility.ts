/**
 * Reversibility Lens
 *
 * Analyzes a decision for what's reversible vs. irreversible and what's safe to try first.
 * SERVER-ONLY: Do not import from client/UI code.
 */

import "server-only";
import { openai } from "@/llm";
import type { LLMMessage } from "@/llm/types";
import type {
  DecisionIntake,
  Posture,
  ReversibilityLensOutput,
  BlindSpot,
  Tradeoff,
  LensQuestion,
  Clarification,
} from "@/types/decision";

const REVERSIBILITY_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "How confident are you in this analysis given the information provided",
    },
    irreversible_steps: {
      type: "array",
      items: { type: "string" },
      description:
        "Steps or commitments that would be hard or impossible to undo once taken (3-7 items)",
    },
    safe_to_try_first: {
      type: "array",
      items: { type: "string" },
      description:
        "Low-commitment steps or experiments the decision-maker could try first with minimal downside (3-7 items)",
    },
    assumptions_detected: {
      type: "array",
      items: { type: "string" },
      description: "Assumptions the decision-maker appears to be making about reversibility",
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
      description: "Areas the decision-maker may not be considering regarding reversibility",
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
      description: "Key tradeoffs related to reversibility",
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
          lens: { type: "string", const: "reversibility" },
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
      description: "Follow-up questions that would help clarify reversibility (0-3 questions, only if critical gaps exist)",
    },
  },
  required: [
    "confidence",
    "irreversible_steps",
    "safe_to_try_first",
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
      return "The user is exploring this decision openly. Identify what's reversible vs irreversible and what they could try first with low commitment.";
    case "pressure_test":
      return `The user is leaning toward: "${leaningDirection}". Stress-test this by naming what would be hard to undo if they go this way, and what they could try before committing.`;
    case "surface_risks":
      return "The user wants to understand risks. Focus on irreversible steps and what could lock them in; suggest safe experiments first.";
    case "generate_alternatives":
      return "The user wants to explore alternatives. For each irreversible step, consider whether there's a reversible path or a smaller step to try first.";
  }
}

function formatClarificationsForPrompt(clarifications: Clarification[]): string {
  if (!clarifications.length) return "";
  const lines = clarifications.flatMap((c) =>
    c.answers.map((a) => {
      const text = a.answer === "unknown" ? "unknown (user didn't know)" : String(a.answer);
      return `- ${a.question_id} (${a.lens}): ${text}`;
    })
  );
  return `\n\n## Follow-up answers from the user\n${lines.join("\n")}\n\nUse these answers to refine your reversibility analysis. Do not ask the same questions again.`;
}

export function buildReversibilityPrompt(
  intake: DecisionIntake,
  clarifications: Clarification[] = []
): LLMMessage[] {
  const postureInstruction = getPostureInstruction(
    intake.posture,
    intake.posture === "pressure_test" ? intake.leaning_direction : undefined
  );

  const systemPrompt = `You are an advisor helping someone think through the reversibility of an important decision. Your job is to identify:
1. What would be hard or impossible to undo once done (irreversible steps).
2. What they could try first with minimal commitment (safe to try first).

${postureInstruction}

Be specific and actionable. Ground your analysis in the specific situation described. Emphasize "what's reversible vs. irreversible" and "what's safe to try first."

If critical information is missing that would change your reversibility analysis, include 1-3 focused follow-up questions. Only ask questions if the gaps are significant.`;

  let userContent = `## Decision Context

**Situation:** ${intake.situation}

**Constraints:** ${intake.constraints}

${intake.knowns_assumptions ? `**What I know / am assuming:** ${intake.knowns_assumptions}` : ""}

${intake.unknowns ? `**What I don't know:** ${intake.unknowns}` : ""}

Analyze what's reversible vs. irreversible in this decision, and what's safe to try first.`;
  userContent += formatClarificationsForPrompt(clarifications);

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

interface RawReversibilityOutput {
  confidence: "high" | "medium" | "low";
  irreversible_steps: string[];
  safe_to_try_first: string[];
  assumptions_detected: string[];
  blind_spots: Array<{ area: string; description: string }>;
  tradeoffs: Array<{ option: string; upside: string; downside: string }>;
  remaining_uncertainty: string[];
  questions_to_answer_next: Array<{
    question_id: string;
    lens: "reversibility";
    question_text: string;
    answer_type: "enum" | "boolean" | "numeric" | "short_text";
    options: string[] | null;
    required: boolean;
  }>;
}

export function parseReversibilityOutput(parsed: unknown): ReversibilityLensOutput {
  const raw = parsed as RawReversibilityOutput;

  const output: ReversibilityLensOutput = {
    lens: "reversibility",
    confidence: raw.confidence ?? "medium",
    irreversible_steps: raw.irreversible_steps ?? [],
    safe_to_try_first: raw.safe_to_try_first ?? [],
    assumptions_detected: raw.assumptions_detected ?? [],
    blind_spots: (raw.blind_spots ?? []).map(
      (b): BlindSpot => ({ area: b.area, description: b.description })
    ),
    tradeoffs: (raw.tradeoffs ?? []).map(
      (t): Tradeoff => ({ option: t.option, upside: t.upside, downside: t.downside })
    ),
    remaining_uncertainty: raw.remaining_uncertainty ?? [],
    questions_to_answer_next: (raw.questions_to_answer_next ?? []).map(
      (q): LensQuestion => ({
        question_id: q.question_id,
        lens: "reversibility",
        question_text: q.question_text,
        answer_type: q.answer_type,
        options: q.options ?? undefined,
        required: q.required,
      })
    ),
  };

  return output;
}

export async function runReversibilityLens(
  intake: DecisionIntake,
  clarifications: Clarification[] = []
): Promise<ReversibilityLensOutput> {
  const messages = buildReversibilityPrompt(intake, clarifications);

  const response = await openai.run(messages, {
    schema: REVERSIBILITY_OUTPUT_SCHEMA,
    temperature: 0.7,
    maxTokens: 2048,
  });

  if (!response.parsed) {
    throw new Error("Reversibility lens did not return valid structured output");
  }

  return parseReversibilityOutput(response.parsed);
}
