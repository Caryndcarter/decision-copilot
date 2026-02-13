/**
 * Decision Brief Synthesis
 *
 * Produces a short title, summary, recommendation, and next steps from
 * intake and lens outputs (and optional clarifications). SERVER-ONLY.
 */

import "server-only";
import { openai } from "@/llm";
import type { LLMMessage } from "@/llm/types";
import type {
  DecisionIntake,
  DecisionBrief,
  LensOutput,
  Clarification,
} from "@/types/decision";

const BRIEF_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description:
        "Short, contextual title for the brief (e.g. 'Recommendation: Proceed with DB switch after staging')",
    },
    summary: {
      type: "string",
      description:
        "2-4 sentence synthesis of the situation and analysis for a busy reader",
    },
    recommendation: {
      type: "string",
      description: "Clear recommendation: what the decision-maker should do next",
    },
    key_considerations: {
      type: "array",
      items: { type: "string" },
      description: "3-7 bullet-worthy considerations to keep in mind",
    },
    next_steps: {
      type: "array",
      items: { type: "string" },
      description: "3-7 concrete next steps the decision-maker can take",
    },
  },
  required: ["title", "summary", "recommendation", "key_considerations", "next_steps"],
  additionalProperties: false,
} as const;

function formatLensOutputs(lensOutputs: LensOutput[]): string {
  const parts: string[] = [];
  for (const out of lensOutputs) {
    if (out.lens === "risk") {
      parts.push(`### Risk lens\n- Top risks: ${(out.top_risks ?? []).join("; ")}`);
      if (out.assumptions_detected?.length)
        parts.push(`- Assumptions: ${out.assumptions_detected.join("; ")}`);
      if (out.blind_spots?.length)
        parts.push(
          `- Blind spots: ${out.blind_spots.map((b) => `${b.area}: ${b.description}`).join("; ")}`
        );
      if (out.tradeoffs?.length)
        parts.push(
          `- Tradeoffs: ${out.tradeoffs.map((t) => `${t.option} (↑ ${t.upside}, ↓ ${t.downside})`).join("; ")}`
        );
      if (out.remaining_uncertainty?.length)
        parts.push(`- Remaining uncertainty: ${out.remaining_uncertainty.join("; ")}`);
    } else if (out.lens === "reversibility") {
      parts.push(
        `### Reversibility lens\n- Irreversible steps: ${(out.irreversible_steps ?? []).join("; ")}`
      );
      if (out.safe_to_try_first?.length)
        parts.push(`- Safe to try first: ${out.safe_to_try_first.join("; ")}`);
      if (out.assumptions_detected?.length)
        parts.push(`- Assumptions: ${out.assumptions_detected.join("; ")}`);
      if (out.tradeoffs?.length)
        parts.push(
          `- Tradeoffs: ${out.tradeoffs.map((t) => `${t.option} (↑ ${t.upside}, ↓ ${t.downside})`).join("; ")}`
        );
    }
  }
  return parts.join("\n");
}

function formatClarifications(clarifications: Clarification[]): string {
  if (!clarifications.length) return "";
  const lines = clarifications.flatMap((c) =>
    c.answers.map((a) => `- ${a.question_id} (${a.lens}): ${String(a.answer)}`)
  );
  return `\n\n## Follow-up answers from the user\n${lines.join("\n")}`;
}

export function buildBriefPrompt(
  intake: DecisionIntake,
  lensOutputs: LensOutput[],
  clarifications: Clarification[] = []
): LLMMessage[] {
  const lensBlock = formatLensOutputs(lensOutputs);
  const clarBlock = formatClarifications(clarifications);

  const systemPrompt = `You are a decision coach. Given a decision context and analyses from risk and reversibility lenses, produce a brief decision brief.

Output:
- title: A short, contextual title (e.g. "Recommendation: Proceed with DB switch after staging" or "Exploring database migration options"). Not generic like "Decision brief".
- summary: 2-4 sentences that synthesize the situation and the key findings for a busy reader.
- recommendation: One clear sentence on what the decision-maker should do next.
- key_considerations: 3-7 short items to keep in mind.
- next_steps: 3-7 concrete, actionable next steps.

Be specific to this decision. Avoid generic advice. Use the lens analyses and any user follow-up answers.`;

  const userContent = `## Decision context

**Situation:** ${intake.situation}

**Constraints:** ${intake.constraints}

**Posture:** ${intake.posture}${intake.leaning_direction ? ` · Leaning toward: ${intake.leaning_direction}` : ""}
${intake.knowns_assumptions ? `\n**Knowns/assumptions:** ${intake.knowns_assumptions}` : ""}
${intake.unknowns ? `\n**Unknowns:** ${intake.unknowns}` : ""}

## Lens analyses

${lensBlock}
${clarBlock}

Produce the decision brief (title, summary, recommendation, key_considerations, next_steps).`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

interface RawBriefOutput {
  title: string;
  summary: string;
  recommendation: string;
  key_considerations: string[];
  next_steps: string[];
}

function parseBriefOutput(parsed: unknown, generated_at: string): DecisionBrief {
  const raw = parsed as RawBriefOutput;
  return {
    title: raw.title?.trim() || "Decision brief",
    generated_at,
    summary: raw.summary?.trim() || "",
    recommendation: raw.recommendation?.trim() || "",
    key_considerations: Array.isArray(raw.key_considerations)
      ? raw.key_considerations.filter((s): s is string => typeof s === "string")
      : [],
    next_steps: Array.isArray(raw.next_steps)
      ? raw.next_steps.filter((s): s is string => typeof s === "string")
      : [],
  };
}

export async function runBriefSynthesis(
  intake: DecisionIntake,
  lensOutputs: LensOutput[],
  clarifications: Clarification[] = []
): Promise<DecisionBrief> {
  const messages = buildBriefPrompt(intake, lensOutputs, clarifications);

  const response = await openai.run(messages, {
    schema: BRIEF_OUTPUT_SCHEMA,
    temperature: 0.5,
    maxTokens: 1024,
  });

  if (!response.parsed) {
    throw new Error("Brief synthesis did not return valid structured output");
  }

  const generated_at = new Date().toISOString();
  return parseBriefOutput(response.parsed, generated_at);
}
