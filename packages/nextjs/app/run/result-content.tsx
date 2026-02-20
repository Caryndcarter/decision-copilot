"use client";

import { useState } from "react";
import type { DecisionRunResult, LensOutput } from "@/types/decision";

function formatBriefDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
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

function EditableList({
  items,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
            placeholder="Item"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="text-slate-400 hover:text-red-600"
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="text-sm text-sky-600 hover:text-sky-700"
      >
        + Add item
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Section key for edit state, e.g. "risk.top_risks" */
function sectionKey(lens: string, field: string) {
  return `${lens}.${field}`;
}

/** Build new lens_outputs with one list field updated */
function withUpdatedList(
  lensOutputs: LensOutput[],
  lensName: "risk" | "reversibility" | "people",
  field: string,
  value: string[]
): LensOutput[] {
  return lensOutputs.map((out) => {
    if (out.lens !== lensName) return out;
    return { ...out, [field]: value } as LensOutput;
  });
}

export interface ResultContentProps {
  result: DecisionRunResult;
  className?: string;
  /** When provided, lens sections show Edit and can be updated (saved to DB) */
  onRunUpdate?: (updated: DecisionRunResult) => void;
}

export function ResultContent({ result, className = "", onRunUpdate }: ResultContentProps) {
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const riskLens = result.lens_outputs?.find((o) => o.lens === "risk") as
    | (LensOutput & { top_risks?: string[] })
    | undefined;
  const reversibilityLens = result.lens_outputs?.find((o) => o.lens === "reversibility") as
    | (LensOutput & { irreversible_steps?: string[]; safe_to_try_first?: string[] })
    | undefined;
  const peopleLens = result.lens_outputs?.find((o) => o.lens === "people") as
    | (LensOutput & { stakeholder_impacts?: { stakeholder: string; impact: string; sentiment: string }[]; execution_risks?: string[] })
    | undefined;
  const statusLabel =
    result.status === "awaiting_clarification"
      ? "Awaiting clarification"
      : result.status === "complete"
        ? "Complete"
        : result.status === "pending_brief"
          ? "Lenses complete (brief pending)"
          : result.status;

  async function saveLensListUpdate(
    lensName: "risk" | "reversibility" | "people",
    field: string,
    items: string[]
  ) {
    if (!onRunUpdate) return;
    setEditError(null);
    setSaving(true);
    try {
      const nextLensOutputs = withUpdatedList(result.lens_outputs, lensName, field, items);
      const res = await fetch("/api/decision/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "update_lens_outputs", run_id: result.run_id, lens_outputs: nextLensOutputs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Failed to save");
        return;
      }
      onRunUpdate(data as DecisionRunResult);
      setEditingSection(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(lens: string, field: string, current: string[]) {
    setEditingSection(sectionKey(lens, field));
    setDraftItems(current.length ? [...current] : [""]);
    setEditError(null);
  }

  function cancelEditing() {
    setEditingSection(null);
    setEditError(null);
  }

  const canEdit =
    Boolean(onRunUpdate) &&
    (result.status === "complete" || result.status === "pending_brief");

  return (
    <div className={className}>
      {/* Context */}
      <Card className="mb-6">
        <Section title="Context">
          <p className="text-slate-800">
            <span className="font-medium">Situation:</span> {result.intake.situation}
          </p>
          <p className="mt-2 text-slate-800">
            <span className="font-medium">Constraints:</span> {result.intake.constraints}
          </p>
          <p className="mt-2 text-slate-600">
            <span className="font-medium">Posture:</span> {postureLabel(result.intake.posture)}
            {result.intake.leaning_direction && ` · Leaning toward: ${result.intake.leaning_direction}`}
          </p>
        </Section>
        <div className="mt-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              result.status === "complete"
                ? "bg-emerald-100 text-emerald-800"
                : result.status === "awaiting_clarification"
                  ? "bg-amber-100 text-amber-800"
                  : result.status === "pending_brief"
                    ? "bg-sky-100 text-sky-800"
                    : "bg-slate-100 text-slate-700"
            }`}
          >
            {statusLabel}
          </span>
        </div>
      </Card>

      {/* Risk (rose tint) */}
      {riskLens && (
        <div className="mt-6 space-y-4">
          {(riskLens.top_risks?.length || canEdit) && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
              <Section title="Top risks">
                {editingSection === sectionKey("risk", "top_risks") ? (
                  <EditableList
                    items={draftItems}
                    onChange={setDraftItems}
                    onSave={() => saveLensListUpdate("risk", "top_risks", draftItems.filter(Boolean))}
                    onCancel={cancelEditing}
                    saving={saving}
                    error={editError}
                  />
                ) : (
                  <>
                    {riskLens.top_risks?.length ? (
                      <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                        {riskLens.top_risks.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 text-sm">No items. Edit to add your own.</p>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEditing("risk", "top_risks", riskLens.top_risks ?? [])}
                        className="mt-2 text-sm text-sky-600 hover:text-sky-700"
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </Section>
            </div>
          )}
          {(riskLens.assumptions_detected?.length || canEdit) && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
              <Section title="Assumptions detected">
                {editingSection === sectionKey("risk", "assumptions_detected") ? (
                  <EditableList
                    items={draftItems}
                    onChange={setDraftItems}
                    onSave={() => saveLensListUpdate("risk", "assumptions_detected", draftItems.filter(Boolean))}
                    onCancel={cancelEditing}
                    saving={saving}
                    error={editError}
                  />
                ) : (
                  <>
                    {riskLens.assumptions_detected?.length ? (
                      <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                        {riskLens.assumptions_detected.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 text-sm">No items. Edit to add.</p>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEditing("risk", "assumptions_detected", riskLens.assumptions_detected ?? [])}
                        className="mt-2 text-sm text-sky-600 hover:text-sky-700"
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </Section>
            </div>
          )}
          {riskLens.blind_spots && riskLens.blind_spots.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
              <Section title="Blind spots">
                <ul className="space-y-3">
                  {riskLens.blind_spots.map((b, i) => (
                    <li key={i} className="border-l-2 border-amber-300 pl-3">
                      <span className="font-medium text-slate-800">{b.area}:</span>{" "}
                      <span className="text-slate-700">{b.description}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          )}
          {riskLens.tradeoffs && riskLens.tradeoffs.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
              <Section title="Tradeoffs">
                <div className="space-y-4">
                  {riskLens.tradeoffs.map((t, i) => (
                    <div key={i} className="rounded border border-slate-200 bg-slate-50/50 p-3">
                      <p className="font-medium text-slate-800">{t.option}</p>
                      <p className="mt-1 text-sm text-emerald-700">
                        <span className="font-medium">Upside:</span> {t.upside}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        <span className="font-medium">Downside:</span> {t.downside}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}
          {(riskLens.remaining_uncertainty?.length || canEdit) && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
              <Section title="Remaining uncertainty">
                {editingSection === sectionKey("risk", "remaining_uncertainty") ? (
                  <EditableList
                    items={draftItems}
                    onChange={setDraftItems}
                    onSave={() => saveLensListUpdate("risk", "remaining_uncertainty", draftItems.filter(Boolean))}
                    onCancel={cancelEditing}
                    saving={saving}
                    error={editError}
                  />
                ) : (
                  <>
                    {riskLens.remaining_uncertainty?.length ? (
                      <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                        {riskLens.remaining_uncertainty.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 text-sm">No items. Edit to add.</p>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEditing("risk", "remaining_uncertainty", riskLens.remaining_uncertainty ?? [])}
                        className="mt-2 text-sm text-sky-600 hover:text-sky-700"
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </Section>
            </div>
          )}
        </div>
      )}

      {/* Reversibility (amber) */}
      {reversibilityLens && (
        <div className="mt-6 space-y-4">
          {(reversibilityLens.irreversible_steps?.length || canEdit) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
              <Section title="Irreversible steps">
                <p className="mb-2 text-sm text-slate-600">
                  Steps or commitments that would be hard or impossible to undo.
                </p>
                {editingSection === sectionKey("reversibility", "irreversible_steps") ? (
                  <EditableList
                    items={draftItems}
                    onChange={setDraftItems}
                    onSave={() => saveLensListUpdate("reversibility", "irreversible_steps", draftItems.filter(Boolean))}
                    onCancel={cancelEditing}
                    saving={saving}
                    error={editError}
                  />
                ) : (
                  <>
                    {reversibilityLens.irreversible_steps?.length ? (
                      <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                        {reversibilityLens.irreversible_steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 text-sm">No items. Edit to add.</p>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEditing("reversibility", "irreversible_steps", reversibilityLens.irreversible_steps ?? [])}
                        className="mt-2 text-sm text-sky-600 hover:text-sky-700"
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </Section>
            </div>
          )}
          {(reversibilityLens.safe_to_try_first?.length || canEdit) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
              <Section title="Safe to try first">
                <p className="mb-2 text-sm text-slate-600">
                  Low-commitment steps or experiments you could try with minimal downside.
                </p>
                {editingSection === sectionKey("reversibility", "safe_to_try_first") ? (
                  <EditableList
                    items={draftItems}
                    onChange={setDraftItems}
                    onSave={() => saveLensListUpdate("reversibility", "safe_to_try_first", draftItems.filter(Boolean))}
                    onCancel={cancelEditing}
                    saving={saving}
                    error={editError}
                  />
                ) : (
                  <>
                    {reversibilityLens.safe_to_try_first?.length ? (
                      <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                        {reversibilityLens.safe_to_try_first.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 text-sm">No items. Edit to add.</p>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEditing("reversibility", "safe_to_try_first", reversibilityLens.safe_to_try_first ?? [])}
                        className="mt-2 text-sm text-sky-600 hover:text-sky-700"
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </Section>
            </div>
          )}
        </div>
      )}

      {/* People (violet tint) */}
      {peopleLens && (
        <div className="mt-6 space-y-4">
          {peopleLens.stakeholder_impacts && peopleLens.stakeholder_impacts.length > 0 && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-4 shadow-sm">
              <Section title="Stakeholder impacts">
                <p className="mb-3 text-sm text-slate-600">Who is affected by this decision and how.</p>
                <ul className="space-y-3">
                  {peopleLens.stakeholder_impacts.map((s, i) => (
                    <li key={i} className="flex flex-col gap-1">
                      <span className="font-medium text-slate-800">{s.stakeholder}</span>
                      <span
                        className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.sentiment === "positive"
                            ? "bg-emerald-100 text-emerald-800"
                            : s.sentiment === "negative"
                              ? "bg-red-100 text-red-800"
                              : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {s.sentiment}
                      </span>
                      <span className="text-slate-700">{s.impact}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          )}
          {(peopleLens.execution_risks?.length || canEdit) && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-4 shadow-sm">
              <Section title="Execution risks">
                <p className="mb-2 text-sm text-slate-600">
                  Risks to successful execution: adoption, resistance, capability gaps, coordination.
                </p>
                {editingSection === sectionKey("people", "execution_risks") ? (
                  <EditableList
                    items={draftItems}
                    onChange={setDraftItems}
                    onSave={() => saveLensListUpdate("people", "execution_risks", draftItems.filter(Boolean))}
                    onCancel={cancelEditing}
                    saving={saving}
                    error={editError}
                  />
                ) : (
                  <>
                    {peopleLens.execution_risks?.length ? (
                      <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                        {peopleLens.execution_risks.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 text-sm">No items. Edit to add.</p>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEditing("people", "execution_risks", peopleLens.execution_risks ?? [])}
                        className="mt-2 text-sm text-sky-600 hover:text-sky-700"
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </Section>
            </div>
          )}
        </div>
      )}

      {/* Decision brief */}
      {result.decision_brief && (
        <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {result.decision_brief.title || "Decision brief"}
            </h2>
            {result.decision_brief.generated_at && (
              <p className="text-xs text-slate-500">
                Generated {formatBriefDate(result.decision_brief.generated_at)}
              </p>
            )}
          </div>
          <div className="mt-3">
            {result.decision_brief.summary === "Pending implementation" &&
            result.decision_brief.recommendation === "Pending implementation" &&
            !result.decision_brief.key_considerations?.length &&
            !result.decision_brief.next_steps?.length ? (
              <p className="text-slate-500 italic">
                Brief synthesis not yet implemented. Your answers were used to re-run the lenses above; a
                summarized recommendation will appear here once synthesis is added.
              </p>
            ) : (
              <>
                <p className="text-slate-800">{result.decision_brief.summary}</p>
                <p className="mt-3 font-medium text-slate-800">{result.decision_brief.recommendation}</p>
                {result.decision_brief.key_considerations?.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-slate-700">
                    {result.decision_brief.key_considerations.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                )}
                {result.decision_brief.next_steps?.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-slate-700">
                    {result.decision_brief.next_steps.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
