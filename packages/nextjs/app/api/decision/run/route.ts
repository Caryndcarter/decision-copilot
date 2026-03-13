import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type {
  DecisionIntake,
  Clarification,
  DecisionRunResult,
  LensQuestion,
  LensOutput,
  DecisionBrief,
  Posture,
  DecisionRunStatus,
  LLMProviderName,
} from "@/types/decision";
import { runRiskLens } from "@/lenses/risk";
import { runReversibilityLens } from "@/lenses/reversibility";
import { runPeopleLens } from "@/lenses/people";
import { runBriefSynthesis } from "@/lenses/brief";
import { getRun, getRunsByDecisionId, insertRun, replaceRun } from "@/lib/db/runs";

// ============================================
// Request Types
// ============================================

interface InitialRunRequest {
  type: "intake";
  intake: Omit<DecisionIntake, "decision_id"> & { decision_id?: string };
  /** LLM provider for this run (default: openai) */
  llm_provider?: LLMProviderName;
}

interface ClarificationRequest {
  type: "clarification";
  decision_id: string;
  run_id: string;
  clarification: Omit<Clarification, "decision_id" | "run_id">;
}

interface UpdateLensOutputsRequest {
  type: "update_lens_outputs";
  run_id: string;
  lens_outputs: LensOutput[];
}

interface UpdateBriefRequest {
  type: "update_brief";
  run_id: string;
  decision_brief: Partial<DecisionBrief>;
}

interface RerunPostureRequest {
  type: "rerun_posture";
  run_id: string;
  posture: Posture;
  leaning_direction?: string;
}

interface RerunProviderRequest {
  type: "rerun_provider";
  run_id: string;
  llm_provider: LLMProviderName;
}

type RunRequest =
  | InitialRunRequest
  | ClarificationRequest
  | UpdateLensOutputsRequest
  | UpdateBriefRequest
  | RerunPostureRequest
  | RerunProviderRequest;

// ============================================
// Validation
// ============================================

function isValidPosture(posture: string): posture is Posture {
  return ["explore", "pressure_test", "surface_risks", "generate_alternatives"].includes(posture);
}

const POSTURE_LABELS: Record<string, string> = {
  explore: "Explore",
  pressure_test: "Pressure test",
  surface_risks: "Surface risks",
  generate_alternatives: "Generate alternatives",
};

function postureLabel(posture: string): string {
  return POSTURE_LABELS[posture] ?? posture.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function validateIntake(intake: InitialRunRequest["intake"]): string | null {
  if (!intake.situation?.trim()) {
    return "situation is required";
  }
  if (!intake.constraints?.trim()) {
    return "constraints is required";
  }
  if (!intake.posture || !isValidPosture(intake.posture)) {
    return "posture must be one of: explore, pressure_test, surface_risks, generate_alternatives";
  }
  if (intake.posture === "pressure_test" && !intake.leaning_direction?.trim()) {
    return "leaning_direction is required when posture is pressure_test";
  }
  return null;
}

function validateClarificationRequest(req: ClarificationRequest): string | null {
  if (!req.decision_id?.trim()) {
    return "decision_id is required";
  }
  if (!req.run_id?.trim()) {
    return "run_id is required";
  }
  if (!req.clarification?.answers?.length) {
    return "clarification.answers is required";
  }
  return null;
}

// ============================================
// Lens Processing (stubs - will integrate AI later)
// ============================================

function extractClarificationQuestions(lensOutputs: LensOutput[]): LensQuestion[] {
  // Collect questions from all lens outputs
  return lensOutputs.flatMap((output) => output.questions_to_answer_next);
}

async function runLenses(
  intake: DecisionIntake,
  clarifications: Clarification[],
  provider: LLMProviderName = "openai"
): Promise<LensOutput[]> {
  const [riskOutput, reversibilityOutput, peopleOutput] = await Promise.all([
    runRiskLens(intake, clarifications, provider),
    runReversibilityLens(intake, clarifications, provider),
    runPeopleLens(intake, clarifications, provider),
  ]);
  return [riskOutput, reversibilityOutput, peopleOutput];
}

async function synthesizeBrief(
  intake: DecisionIntake,
  lensOutputs: LensOutput[],
  clarifications: Clarification[] = [],
  provider: LLMProviderName = "openai"
): Promise<DecisionBrief> {
  return runBriefSynthesis(intake, lensOutputs, clarifications, provider);
}

function isStubBrief(brief: DecisionBrief): boolean {
  return (
    brief.summary === "Pending implementation" &&
    brief.recommendation === "Pending implementation" &&
    (brief.key_considerations?.length ?? 0) === 0 &&
    (brief.next_steps?.length ?? 0) === 0
  );
}

// ============================================
// Route Handlers
// ============================================

/** GET /api/decision/run?run_id=xxx — fetch one run. GET /api/decision/run?decision_id=xxx — list runs for that decision (for posture dropdown). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const run_id = searchParams.get("run_id");
  const decision_id = searchParams.get("decision_id");
  if (run_id?.trim()) {
    const run = await getRun(run_id.trim());
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json(run);
  }
  if (decision_id?.trim()) {
    const runs = await getRunsByDecisionId(decision_id.trim());
    return NextResponse.json({ runs });
  }
  return NextResponse.json({ error: "run_id or decision_id query parameter is required" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RunRequest;

    if (body.type === "intake") {
      return handleIntake(body);
    } else if (body.type === "clarification") {
      return handleClarification(body);
    } else if (body.type === "update_lens_outputs") {
      return handleUpdateLensOutputs(body);
    } else if (body.type === "update_brief") {
      return handleUpdateBrief(body);
    } else if (body.type === "rerun_posture") {
      return handleRerunPosture(body);
    } else if (body.type === "rerun_provider") {
      return handleRerunProvider(body);
    } else {
      return NextResponse.json(
        {
          error:
            "Invalid request type. Must be 'intake', 'clarification', 'update_lens_outputs', 'update_brief', 'rerun_posture', or 'rerun_provider'",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error processing decision run:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("API_KEY") && message.includes("not set")) {
      return NextResponse.json(
        {
          error:
            "The selected AI provider is not configured. Add the required API key to your .env (e.g. ANTHROPIC_API_KEY for Anthropic, OPENAI_API_KEY for OpenAI).",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleIntake(req: InitialRunRequest): Promise<NextResponse> {
  const validationError = validateIntake(req.intake);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const decision_id = req.intake.decision_id || randomUUID();
  const run_id = randomUUID();

  const intake: DecisionIntake = {
    ...req.intake,
    decision_id,
  } as DecisionIntake;

  const provider = req.llm_provider ?? "openai";

  // Run lenses to get initial analysis
  const lens_outputs = await runLenses(intake, [], provider);

  // Extract any clarification questions from lens outputs
  const clarification_questions = extractClarificationQuestions(lens_outputs);
  const clarification_needed = clarification_questions.length > 0;

  let status: DecisionRunStatus;
  let decision_brief: DecisionBrief | undefined;

  if (clarification_needed) {
    status = "awaiting_clarification";
  } else {
    decision_brief = await synthesizeBrief(intake, lens_outputs, [], provider);
    status = isStubBrief(decision_brief) ? "pending_brief" : "complete";
  }

  const clarification_question_sections =
    clarification_questions.length > 0
      ? [
          {
            postureLabel: `${postureLabel(intake.posture)} posture`,
            keys: clarification_questions.map((q) => `${q.lens}-${q.question_id}`),
          },
        ]
      : undefined;

  const result: DecisionRunResult = {
    decision_id,
    run_id,
    status,
    intake,
    clarification_questions,
    clarification_question_sections,
    clarification_needed,
    clarifications: [],
    lens_outputs,
    decision_brief,
    lens_outputs_first_draft: lens_outputs,
    decision_brief_first_draft: decision_brief,
    llm_provider: provider,
  };

  await insertRun(result);

  return NextResponse.json(result);
}

async function handleClarification(req: ClarificationRequest): Promise<NextResponse> {
  const validationError = validateClarificationRequest(req);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const existingRun = await getRun(req.run_id);
  if (!existingRun) {
    return NextResponse.json(
      { error: "Run not found. Please start a new decision." },
      { status: 404 }
    );
  }

  if (existingRun.status !== "awaiting_clarification") {
    return NextResponse.json(
      { error: `Cannot submit clarification for run in status: ${existingRun.status}` },
      { status: 400 }
    );
  }

  const clarification: Clarification = {
    decision_id: req.decision_id,
    run_id: req.run_id,
    ...req.clarification,
  };

  // Preserve first-draft analysis if not already set (e.g. run created before we stored it)
  if (!existingRun.lens_outputs_first_draft?.length && existingRun.lens_outputs?.length) {
    existingRun.lens_outputs_first_draft = existingRun.lens_outputs;
    if (existingRun.decision_brief) {
      existingRun.decision_brief_first_draft = existingRun.decision_brief;
    }
  }

  // Update run with clarification
  existingRun.clarifications.push(clarification);
  existingRun.status = "processing_clarification";

  const provider = existingRun.llm_provider ?? "openai";

  // Run full analysis with clarification (refined version)
  const lens_outputs = await runLenses(existingRun.intake, existingRun.clarifications, provider);
  const decision_brief = await synthesizeBrief(
    existingRun.intake,
    lens_outputs,
    existingRun.clarifications,
    provider
  );

  existingRun.lens_outputs = lens_outputs;
  existingRun.decision_brief = decision_brief;
  existingRun.status = isStubBrief(decision_brief) ? "pending_brief" : "complete";
  existingRun.clarification_needed = false;
  // Keep clarification_questions and clarification_question_sections so chat and rerun posture can use them
  existingRun.clarification_questions = existingRun.clarification_questions ?? [];
  existingRun.clarification_question_sections = existingRun.clarification_question_sections ?? undefined;

  await replaceRun(req.run_id, existingRun);

  return NextResponse.json(existingRun);
}

async function handleUpdateLensOutputs(req: UpdateLensOutputsRequest): Promise<NextResponse> {
  if (!req.run_id?.trim()) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }
  if (!Array.isArray(req.lens_outputs)) {
    return NextResponse.json({ error: "lens_outputs must be an array" }, { status: 400 });
  }

  const existingRun = await getRun(req.run_id.trim());
  if (!existingRun) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  existingRun.lens_outputs = req.lens_outputs;
  await replaceRun(req.run_id.trim(), existingRun);

  return NextResponse.json(existingRun);
}

async function handleUpdateBrief(req: UpdateBriefRequest): Promise<NextResponse> {
  if (!req.run_id?.trim()) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }
  if (!req.decision_brief || typeof req.decision_brief !== "object") {
    return NextResponse.json({ error: "decision_brief object is required" }, { status: 400 });
  }

  const existingRun = await getRun(req.run_id.trim());
  if (!existingRun) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const current = existingRun.decision_brief;
  if (!current) {
    return NextResponse.json(
      { error: "Run has no decision brief to update" },
      { status: 400 }
    );
  }

  existingRun.decision_brief = {
    title: req.decision_brief.title ?? current.title,
    generated_at: req.decision_brief.generated_at ?? current.generated_at,
    summary: req.decision_brief.summary ?? current.summary,
    recommendation: req.decision_brief.recommendation ?? current.recommendation,
    key_considerations: req.decision_brief.key_considerations ?? current.key_considerations,
    next_steps: req.decision_brief.next_steps ?? current.next_steps,
  };
  await replaceRun(req.run_id.trim(), existingRun);

  return NextResponse.json(existingRun);
}

async function handleRerunPosture(req: RerunPostureRequest): Promise<NextResponse> {
  if (!req.run_id?.trim()) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }
  if (!isValidPosture(req.posture)) {
    return NextResponse.json(
      { error: "posture must be one of: explore, pressure_test, surface_risks, generate_alternatives" },
      { status: 400 }
    );
  }
  if (req.posture === "pressure_test" && !req.leaning_direction?.trim()) {
    return NextResponse.json({ error: "leaning_direction is required when posture is pressure_test" }, { status: 400 });
  }

  const sourceRun = await getRun(req.run_id.trim());
  if (!sourceRun) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const newRunId = randomUUID();
  const decision_id = sourceRun.decision_id;

  const newIntake: DecisionIntake = {
    ...sourceRun.intake,
    posture: req.posture,
    ...(req.posture === "pressure_test" && { leaning_direction: req.leaning_direction!.trim() }),
    ...(req.posture !== "pressure_test" && { leaning_direction: undefined }),
  } as DecisionIntake;

  const provider = sourceRun.llm_provider ?? "openai";

  // Run as a fresh analysis for this posture so we get first-draft lens output and any new clarification questions
  const lens_outputs = await runLenses(newIntake, [], provider);
  const new_questions = extractClarificationQuestions(lens_outputs);
  const old_questions = sourceRun.clarification_questions ?? [];
  // Combine: new questions first (at top), then old questions; build sections by posture for UI labels
  const seenKey = (q: LensQuestion) => `${q.lens}-${q.question_id}`;
  const oldKeys = new Set(old_questions.map(seenKey));
  const additionalNew = new_questions.filter((q) => !oldKeys.has(seenKey(q)));
  const clarification_questions = [...additionalNew, ...old_questions];
  const newKeys = additionalNew.map(seenKey);
  const oldKeysSet = new Set(old_questions.map(seenKey));
  const clarification_question_sections: { postureLabel: string; keys: string[] }[] = [];
  if (newKeys.length > 0) {
    clarification_question_sections.push({
      postureLabel: `${postureLabel(newIntake.posture)} posture`,
      keys: newKeys,
    });
  }
  if (old_questions.length > 0) {
    if (sourceRun.clarification_question_sections?.length) {
      for (const sec of sourceRun.clarification_question_sections) {
        const keysInThisRun = sec.keys.filter((k) => oldKeysSet.has(k));
        if (keysInThisRun.length > 0) {
          clarification_question_sections.push({ postureLabel: sec.postureLabel, keys: keysInThisRun });
        }
      }
    } else {
      clarification_question_sections.push({
        postureLabel: `${postureLabel(sourceRun.intake.posture)} posture`,
        keys: old_questions.map(seenKey),
      });
    }
  }
  const clarification_needed = clarification_questions.length > 0;

  // Prefill clarifications with old answers so the form can show them (user can edit and submit with any new answers)
  const lastSourceClarification = sourceRun.clarifications?.[sourceRun.clarifications.length - 1];
  const clarifications: Clarification[] =
    lastSourceClarification?.answers?.length && old_questions.length > 0
      ? [
          {
            decision_id,
            run_id: newRunId,
            clarification_round: 0,
            answers: lastSourceClarification.answers,
          },
        ]
      : [];

  let status: DecisionRunStatus;
  let decision_brief: DecisionBrief | undefined;

  if (clarification_needed) {
    status = "awaiting_clarification";
  } else {
    decision_brief = await synthesizeBrief(newIntake, lens_outputs, clarifications, provider);
    status = isStubBrief(decision_brief) ? "pending_brief" : "complete";
  }

  const result: DecisionRunResult = {
    decision_id,
    run_id: newRunId,
    status,
    intake: newIntake,
    clarification_questions,
    clarification_question_sections:
      clarification_question_sections.length > 0 ? clarification_question_sections : undefined,
    clarification_needed,
    clarifications,
    lens_outputs,
    decision_brief,
    lens_outputs_first_draft: lens_outputs,
    decision_brief_first_draft: decision_brief,
    llm_provider: provider,
  };

  await insertRun(result);
  return NextResponse.json(result);
}

async function handleRerunProvider(req: RerunProviderRequest): Promise<NextResponse> {
  if (!req.run_id?.trim()) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }
  if (req.llm_provider !== "openai" && req.llm_provider !== "anthropic") {
    return NextResponse.json(
      { error: "llm_provider must be 'openai' or 'anthropic'" },
      { status: 400 }
    );
  }

  const sourceRun = await getRun(req.run_id.trim());
  if (!sourceRun) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (sourceRun.llm_provider === req.llm_provider) {
    return NextResponse.json(
      { error: `Run already uses ${req.llm_provider}. Choose the other provider.` },
      { status: 400 }
    );
  }

  const newRunId = randomUUID();
  const decision_id = sourceRun.decision_id;
  const provider = req.llm_provider;

  // Same intake and posture, but no prior clarifications: let the new AI do a fresh first pass and ask its own questions
  const lens_outputs = await runLenses(sourceRun.intake, [], provider);
  const clarification_questions = extractClarificationQuestions(lens_outputs);
  const clarification_needed = clarification_questions.length > 0;

  const clarification_question_sections =
    clarification_questions.length > 0
      ? [
          {
            postureLabel: `${postureLabel(sourceRun.intake.posture)} posture`,
            keys: clarification_questions.map((q) => `${q.lens}-${q.question_id}`),
          },
        ]
      : undefined;

  let status: DecisionRunStatus;
  let decision_brief: DecisionBrief | undefined;

  if (clarification_needed) {
    status = "awaiting_clarification";
  } else {
    decision_brief = await synthesizeBrief(sourceRun.intake, lens_outputs, [], provider);
    status = isStubBrief(decision_brief) ? "pending_brief" : "complete";
  }

  const result: DecisionRunResult = {
    decision_id,
    run_id: newRunId,
    status,
    intake: sourceRun.intake,
    clarification_questions,
    clarification_question_sections,
    clarification_needed,
    clarifications: [],
    lens_outputs,
    decision_brief,
    lens_outputs_first_draft: lens_outputs,
    decision_brief_first_draft: decision_brief,
    llm_provider: provider,
    chat_messages: sourceRun.chat_messages,
  };

  await insertRun(result);
  return NextResponse.json(result);
}
