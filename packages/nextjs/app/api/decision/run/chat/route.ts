import { NextRequest, NextResponse } from "next/server";
import { getRun, replaceRun } from "@/lib/db/runs";
import { openai } from "@/llm";
import type { DecisionRunResult } from "@/types/decision";

function buildRunContext(result: DecisionRunResult): string {
  const parts: string[] = [];

  parts.push("## Decision context");
  parts.push(`Situation: ${result.intake.situation}`);
  parts.push(`Constraints: ${result.intake.constraints}`);
  parts.push(`Posture: ${result.intake.posture}`);
  if (result.intake.leaning_direction) {
    parts.push(`Leaning toward: ${result.intake.leaning_direction}`);
  }

  if (result.lens_outputs?.length) {
    parts.push("\n## Lens analysis");
    for (const lens of result.lens_outputs) {
      if (lens.lens === "risk") {
        const r = lens as { top_risks?: string[]; assumptions_detected?: string[]; blind_spots?: { area: string; description: string }[]; tradeoffs?: { option: string; upside: string; downside: string }[]; remaining_uncertainty?: string[] };
        if (r.top_risks?.length) parts.push("Top risks: " + r.top_risks.join("; "));
        if (r.assumptions_detected?.length) parts.push("Assumptions: " + r.assumptions_detected.join("; "));
        if (r.blind_spots?.length) parts.push("Blind spots: " + r.blind_spots.map((b) => `${b.area}: ${b.description}`).join("; "));
        if (r.tradeoffs?.length) parts.push("Tradeoffs: " + r.tradeoffs.map((t) => `${t.option} (upside: ${t.upside}, downside: ${t.downside})`).join("; "));
        if (r.remaining_uncertainty?.length) parts.push("Remaining uncertainty: " + r.remaining_uncertainty.join("; "));
      }
      if (lens.lens === "reversibility") {
        const rev = lens as { irreversible_steps?: string[]; safe_to_try_first?: string[] };
        if (rev.irreversible_steps?.length) parts.push("Irreversible steps: " + rev.irreversible_steps.join("; "));
        if (rev.safe_to_try_first?.length) parts.push("Safe to try first: " + rev.safe_to_try_first.join("; "));
      }
      if (lens.lens === "people") {
        const p = lens as { stakeholder_impacts?: { stakeholder: string; impact: string; sentiment: string }[]; execution_risks?: string[] };
        if (p.stakeholder_impacts?.length) parts.push("Stakeholder impacts: " + p.stakeholder_impacts.map((s) => `${s.stakeholder} (${s.sentiment}): ${s.impact}`).join("; "));
        if (p.execution_risks?.length) parts.push("Execution risks: " + p.execution_risks.join("; "));
      }
    }
  }

  if (result.decision_brief) {
    parts.push("\n## Decision brief");
    parts.push(`Summary: ${result.decision_brief.summary}`);
    parts.push(`Recommendation: ${result.decision_brief.recommendation}`);
    if (result.decision_brief.key_considerations?.length) {
      parts.push("Key considerations: " + result.decision_brief.key_considerations.join("; "));
    }
    if (result.decision_brief.next_steps?.length) {
      parts.push("Next steps: " + result.decision_brief.next_steps.join("; "));
    }
  }

  if (result.clarification_questions?.length) {
    parts.push("\n## Follow-up questions (from the analysis)");
    result.clarification_questions.forEach((q, i) => {
      parts.push(`${i + 1}. [${q.lens}] ${q.question_text}`);
    });
  }

  if (result.clarifications?.length) {
    const last = result.clarifications[result.clarifications.length - 1];
    if (last.answers?.length) {
      parts.push("\n## User's answers to follow-up questions");
      last.answers.forEach((a, i) => {
        const q = result.clarification_questions?.find(
          (cq) => cq.question_id === a.question_id && cq.lens === a.lens
        );
        const qText = q?.question_text ?? `(${a.lens})`;
        const answer =
          typeof a.answer === "boolean"
            ? a.answer
              ? "Yes"
              : "No"
            : String(a.answer);
        parts.push(`${i + 1}. ${qText}: ${answer}`);
      });
    }
  }

  return parts.join("\n");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { run_id, messages = [], newMessage } = body as {
      run_id?: string;
      messages?: { role: "user" | "assistant"; content: string }[];
      newMessage?: string;
    };

    if (!run_id?.trim()) {
      return NextResponse.json({ error: "run_id is required" }, { status: 400 });
    }
    if (!newMessage?.trim()) {
      return NextResponse.json({ error: "newMessage is required" }, { status: 400 });
    }

    const run = await getRun(run_id.trim());
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const context = buildRunContext(run);
    const systemContent = `You are a helpful assistant for someone reviewing a decision analysis. Use ONLY the following context about their decision and analysis to answer their questions. Be concise and direct. If they ask something outside this context, say so and offer to focus on what's in the analysis.

${context}`;

    const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemContent },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: newMessage.trim() },
    ];

    const response = await openai.run(chatMessages, { temperature: 0.5, maxTokens: 1024 });

    const updatedMessages = [
      ...(run.chat_messages ?? []),
      { role: "user" as const, content: newMessage.trim() },
      { role: "assistant" as const, content: response.content },
    ];
    await replaceRun(run_id.trim(), { ...run, chat_messages: updatedMessages });

    return NextResponse.json({ content: response.content });
  } catch (error) {
    console.error("Decision run chat error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
