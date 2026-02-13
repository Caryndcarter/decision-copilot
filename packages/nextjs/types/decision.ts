/**
 * Decision Copilot - Core Types
 */

// ============================================
// Enums
// ============================================

export type Posture =
  | "explore"
  | "pressure_test"
  | "surface_risks"
  | "generate_alternatives";

export type Lens = "risk" | "reversibility" | "people";

export type AnswerType = "enum" | "boolean" | "numeric" | "short_text";

export type Confidence = "high" | "medium" | "low";

export type DecisionRunStatus =
  | "awaiting_intake"
  | "processing_initial"
  | "awaiting_clarification"
  | "processing_clarification"
  | "pending_brief"
  | "complete";

// ============================================
// 1) DecisionIntake (user → system)
// ============================================

/** Base fields shared by all intake postures */
interface DecisionIntakeBase {
  decision_id: string;
  situation: string;
  constraints: string;
  knowns_assumptions?: string;
  unknowns?: string;
}

/** Intake for non-pressure_test postures (leaning_direction not allowed) */
interface DecisionIntakeStandard extends DecisionIntakeBase {
  posture: Exclude<Posture, "pressure_test">;
  leaning_direction?: never;
}

/** Intake for pressure_test posture (leaning_direction required) */
interface DecisionIntakePressureTest extends DecisionIntakeBase {
  posture: "pressure_test";
  leaning_direction: string;
}

/** Discriminated union ensures leaning_direction is required iff posture = "pressure_test" */
export type DecisionIntake = DecisionIntakeStandard | DecisionIntakePressureTest;

// ============================================
// 2) LensQuestion (system → user follow-up)
// ============================================

export interface LensQuestion {
  question_id: string;
  lens: Lens;
  question_text: string;
  answer_type: AnswerType;
  /** Required when answer_type = "enum" */
  options?: string[];
  required?: boolean;
}

// ============================================
// 3) Clarification (user → system)
// ============================================

export interface ClarificationAnswer {
  question_id: string;
  lens: Lens;
  answer: string | boolean | number;
  answer_type: AnswerType;
}

export interface Clarification {
  decision_id: string;
  /** Links this clarification to a specific run (supports multiple posture reruns) */
  run_id: string;
  clarification_round: number;
  answers: ClarificationAnswer[];
}

// ============================================
// 4) LensOutput (system → synthesis/UI)
// ============================================

export interface BlindSpot {
  area: string;
  description: string;
}

export interface Tradeoff {
  option: string;
  upside: string;
  downside: string;
}

// Base fields shared by all lenses
export interface LensOutputBase {
  lens: Lens;
  confidence: Confidence;
  assumptions_detected: string[];
  blind_spots: BlindSpot[];
  tradeoffs: Tradeoff[];
  remaining_uncertainty: string[];
  /** Should be empty in final output */
  questions_to_answer_next: LensQuestion[];
}

// Lens-specific extensions

export interface RiskLensOutput extends LensOutputBase {
  lens: "risk";
  top_risks: string[];
}

export interface ReversibilityLensOutput extends LensOutputBase {
  lens: "reversibility";
  irreversible_steps: string[];
  safe_to_try_first: string[];
}

export interface StakeholderImpact {
  stakeholder: string;
  impact: string;
  sentiment: "positive" | "negative" | "neutral";
}

export interface PeopleLensOutput extends LensOutputBase {
  lens: "people";
  stakeholder_impacts: StakeholderImpact[];
  execution_risks: string[];
}

export type LensOutput =
  | RiskLensOutput
  | ReversibilityLensOutput
  | PeopleLensOutput;

// ============================================
// 5) DecisionRunResult (API response envelope)
// ============================================

export interface DecisionBrief {
  /** Display title for the brief (e.g. "Decision brief") */
  title: string;
  /** ISO 8601 date-time when the brief was generated */
  generated_at: string;
  summary: string;
  recommendation: string;
  key_considerations: string[];
  next_steps: string[];
}

export interface DecisionRunResult {
  decision_id: string;
  /** Unique identifier for this specific run (supports multiple posture reruns) */
  run_id: string;
  /** Current state of this run */
  status: DecisionRunStatus;
  intake: DecisionIntake;
  /** 0–5 questions for clarification */
  clarification_questions: LensQuestion[];
  clarification_needed: boolean;
  /** Clarifications submitted for this run */
  clarifications: Clarification[];
  /** May be empty if using "gap check first" architecture */
  lens_outputs: LensOutput[];
  decision_brief?: DecisionBrief;
}
