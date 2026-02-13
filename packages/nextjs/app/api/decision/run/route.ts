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
import { getRun, insertRun, replaceRun } from "@/lib/db/runs";

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

type RunRequest = InitialRunRequest | ClarificationRequest;

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
  _clarifications: Clarification[]
): Promise<LensOutput[]> {
  // Run risk lens (other lenses to be added later)
  const riskOutput = await runRiskLens(intake);
  return [riskOutput];
}

async function synthesizeBrief(
  intake: DecisionIntake,
  lensOutputs: LensOutput[]
): Promise<DecisionBrief> {
  // TODO: Implement AI-powered synthesis
  return {
    summary: "Pending implementation",
    recommendation: "Pending implementation",
    key_considerations: [],
    next_steps: [],
  };
}

// ============================================
// Route Handler
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RunRequest;

    if (body.type === "intake") {
      return handleIntake(body);
    } else if (body.type === "clarification") {
      return handleClarification(body);
    } else {
      return NextResponse.json(
        { error: "Invalid request type. Must be 'intake' or 'clarification'" },
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
    // No clarification needed - synthesize final brief
    decision_brief = await synthesizeBrief(intake, lens_outputs);
    status = "complete";
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

  // Update run with clarification
  existingRun.clarifications.push(clarification);
  existingRun.status = "processing_clarification";

  // Run full analysis with clarification
  const lens_outputs = await runLenses(existingRun.intake, existingRun.clarifications);
  const decision_brief = await synthesizeBrief(existingRun.intake, lens_outputs);

  existingRun.lens_outputs = lens_outputs;
  existingRun.decision_brief = decision_brief;
  existingRun.status = "complete";
  existingRun.clarification_needed = false;
  existingRun.clarification_questions = [];

  await replaceRun(req.run_id, existingRun);

  return NextResponse.json(existingRun);
}
