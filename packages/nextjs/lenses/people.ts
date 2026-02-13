/**
 * People Lens
 *
 * Focuses on stakeholder impacts and execution risks for a decision.
 * SERVER-ONLY: Do not import from client/UI code.
 */

import "server-only";
import { openai } from "@/llm";
import type { LLMMessage } from "@/llm/types";
import type {
  DecisionIntake,
  Posture,
  PeopleLensOutput,
  BlindSpot,
  Tradeoff,
  LensQuestion,
  Clarification,
  StakeholderImpact,
} from "@/types/decision";

const PEOPLE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "How confident you are in this analysis given the information provided",
    },
    stakeholder_impacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stakeholder: { type: "string", description: "Who is affected (role, team, or group)" },
          impact: { type: "string", description: "How this decision affects them" },
          sentiment: {
            type: "string",
            enum: ["positive", "negative", "neutral"],
            description: "Whether the impact is positive, negative, or neutral",
          },
        },
        required: ["stakeholder", "impact", "sentiment"],
        additionalProperties: false,
      },
      description: "Key stakeholders and how the decision impacts them (3-7 items)",
    },
    execution_risks: {
      type: "array",
      items: { type: "string" },
      description:
        "Risks to successful execution: adoption, resistance, capability gaps, coordination (3-7 items)",
    },
    assumptions_detected: {
      type: "array",
      items: { type: "string" },
      description: "Assumptions the decision-maker appears to be making about people and execution",
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
      description: "Stakeholder or execution areas the decision-maker may not be considering",
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
      description: "Key tradeoffs involving people or execution",
    },
    remaining_uncertainty: {
      type: "array",
      items: { type: "string" },
      description: "Information about stakeholders or execution that would improve this analysis",
    },
    questions_to_answer_next: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_id: { type: "string" },
          lens: { type: "string", const: "people" },
          question_text: { type: "string" },
          answer_type: { type: "string", enum: ["enum", "boolean", "numeric", "percentage", "short_text"] },
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
      description: "Follow-up questions that would help clarify stakeholder or execution impacts (0-3 questions, only if critical gaps exist)",
    },
  },
  required: [
    "confidence",
    "stakeholder_impacts",
    "execution_risks",
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
      return "The user is exploring this decision openly. Surface who is affected and what execution risks matter across options.";
    case "pressure_test":
      return `The user is leaning toward: "${leaningDirection}". Stress-test this by identifying who might resist, who is left out, and what could derail execution.`;
    case "surface_risks":
      return "The user wants to understand risks. Be thorough on stakeholder impacts and execution risks; don't soften the people side.";
    case "generate_alternatives":
      return "The user wants to explore alternatives. For each stakeholder or execution risk, consider whether a different approach could reduce impact or risk.";
  }
}

function formatClarificationsForPrompt(clarifications: Clarification[]): string {
  if (!clarifications.length) return "";
  const lines = clarifications.flatMap((c) =>
    c.answers.map((a) => {
      let text: string;
      if (a.answer === "unknown") text = "unknown (user didn't know)";
      else if (a.answer_type === "percentage" && typeof a.answer === "number") text = `${a.answer}%`;
      else text = String(a.answer);
      return `- ${a.question_id} (${a.lens}): ${text}`;
    })
  );
  return `\n\n## Follow-up answers from the user\n${lines.join("\n")}\n\nUse these answers to refine your people and execution analysis. Do not ask the same questions again.`;
}

export function buildPeoplePrompt(
  intake: DecisionIntake,
  clarifications: Clarification[] = []
): LLMMessage[] {
  const postureInstruction = getPostureInstruction(
    intake.posture,
    intake.posture === "pressure_test" ? intake.leaning_direction : undefined
  );

  const systemPrompt = `You are an advisor helping someone think through the people and execution side of an important decision. Your job is to identify:
1. Stakeholder impacts — who is affected (teams, roles, partners) and how (positive, negative, neutral).
2. Execution risks — what could derail or complicate implementation: adoption, resistance, capability gaps, coordination, dependencies.

${postureInstruction}

Be specific and actionable. Ground your analysis in the specific situation described.

If critical information is missing that would significantly change your stakeholder or execution analysis, include 1-3 focused follow-up questions. Only ask questions if the gaps are significant.`;

  let userContent = `## Decision Context

**Situation:** ${intake.situation}

**Constraints:** ${intake.constraints}

${intake.knowns_assumptions ? `**What I know / am assuming:** ${intake.knowns_assumptions}` : ""}

${intake.unknowns ? `**What I don't know:** ${intake.unknowns}` : ""}

Analyze stakeholder impacts and execution risks for this decision.`;
  userContent += formatClarificationsForPrompt(clarifications);

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

interface RawPeopleOutput {
  confidence: "high" | "medium" | "low";
  stakeholder_impacts: Array<{ stakeholder: string; impact: string; sentiment: string }>;
  execution_risks: string[];
  assumptions_detected: string[];
  blind_spots: Array<{ area: string; description: string }>;
  tradeoffs: Array<{ option: string; upside: string; downside: string }>;
  remaining_uncertainty: string[];
  questions_to_answer_next: Array<{
    question_id: string;
    lens: "people";
    question_text: string;
    answer_type: "enum" | "boolean" | "numeric" | "percentage" | "short_text";
    options: string[] | null;
    required: boolean;
  }>;
}

export function parsePeopleOutput(parsed: unknown): PeopleLensOutput {
  const raw = parsed as RawPeopleOutput;

  const output: PeopleLensOutput = {
    lens: "people",
    confidence: raw.confidence ?? "medium",
    stakeholder_impacts: (raw.stakeholder_impacts ?? []).map(
      (s): StakeholderImpact => ({
        stakeholder: s.stakeholder,
        impact: s.impact,
        sentiment:
          s.sentiment === "positive" || s.sentiment === "negative" || s.sentiment === "neutral"
            ? s.sentiment
            : "neutral",
      })
    ),
    execution_risks: raw.execution_risks ?? [],
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
        lens: "people",
        question_text: q.question_text,
        answer_type: q.answer_type,
        options: q.options ?? undefined,
        required: q.required,
      })
    ),
  };

  return output;
}

export async function runPeopleLens(
  intake: DecisionIntake,
  clarifications: Clarification[] = []
): Promise<PeopleLensOutput> {
  const messages = buildPeoplePrompt(intake, clarifications);

  const response = await openai.run(messages, {
    schema: PEOPLE_OUTPUT_SCHEMA,
    temperature: 0.7,
    maxTokens: 2048,
  });

  if (!response.parsed) {
    throw new Error("People lens did not return valid structured output");
  }

  return parsePeopleOutput(response.parsed);
}
