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

type RunRequest =
  | InitialRunRequest
  | ClarificationRequest
  | UpdateLensOutputsRequest
  | UpdateBriefRequest
  | RerunPostureRequest;

// ============================================
// Validation
// ============================================

function isValidPosture(posture: string): posture is Posture {
  return ["explore", "pressure_test", "surface_risks", "generate_alternatives"].includes(posture);
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
  clarifications: Clarification[]
): Promise<LensOutput[]> {
  const [riskOutput, reversibilityOutput, peopleOutput] = await Promise.all([
    runRiskLens(intake, clarifications),
    runReversibilityLens(intake, clarifications),
    runPeopleLens(intake, clarifications),
  ]);
  return [riskOutput, reversibilityOutput, peopleOutput];
}

async function synthesizeBrief(
  intake: DecisionIntake,
  lensOutputs: LensOutput[],
  clarifications: Clarification[] = []
): Promise<DecisionBrief> {
  return runBriefSynthesis(intake, lensOutputs, clarifications);
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
    } else {
      return NextResponse.json(
        {
          error:
            "Invalid request type. Must be 'intake', 'clarification', 'update_lens_outputs', 'update_brief', or 'rerun_posture'",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error processing decision run:", error);
    return NextResponse.json(
      { error: "Internal server error" },
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

  // Run lenses to get initial analysis
  const lens_outputs = await runLenses(intake, []);

  // Extract any clarification questions from lens outputs
  const clarification_questions = extractClarificationQuestions(lens_outputs);
  const clarification_needed = clarification_questions.length > 0;

  let status: DecisionRunStatus;
  let decision_brief: DecisionBrief | undefined;

  if (clarification_needed) {
    status = "awaiting_clarification";
  } else {
    decision_brief = await synthesizeBrief(intake, lens_outputs, []);
    status = isStubBrief(decision_brief) ? "pending_brief" : "complete";
  }

  const result: DecisionRunResult = {
    decision_id,
    run_id,
    status,
    intake,
    clarification_questions,
    clarification_needed,
    clarifications: [],
    lens_outputs,
    decision_brief,
    lens_outputs_first_draft: lens_outputs,
    decision_brief_first_draft: decision_brief,
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

  // Run full analysis with clarification (refined version)
  const lens_outputs = await runLenses(existingRun.intake, existingRun.clarifications);
  const decision_brief = await synthesizeBrief(
    existingRun.intake,
    lens_outputs,
    existingRun.clarifications
  );

  existingRun.lens_outputs = lens_outputs;
  existingRun.decision_brief = decision_brief;
  existingRun.status = isStubBrief(decision_brief) ? "pending_brief" : "complete";
  existingRun.clarification_needed = false;
  // Keep clarification_questions so chat API can include them in context (user can ask about the questions/answers)

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

  const clarifications: Clarification[] = sourceRun.clarifications.map((c) => ({
    ...c,
    run_id: newRunId,
    decision_id,
  }));

  const lens_outputs = await runLenses(newIntake, clarifications);
  const decision_brief = await synthesizeBrief(newIntake, lens_outputs, clarifications);
  const status: DecisionRunStatus = isStubBrief(decision_brief) ? "pending_brief" : "complete";

  const result: DecisionRunResult = {
    decision_id,
    run_id: newRunId,
    status,
    intake: newIntake,
    clarification_questions: [],
    clarification_needed: false,
    clarifications,
    lens_outputs,
    decision_brief,
    lens_outputs_first_draft: lens_outputs,
    decision_brief_first_draft: decision_brief,
  };

  await insertRun(result);
  return NextResponse.json(result);
}
