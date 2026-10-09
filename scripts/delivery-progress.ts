import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mvpBpmnCapabilities } from "../model-corpus/mvp-capabilities.ts";
import { requireExecutableModelCorpusManifest } from "./executable-model-corpus-manifest.ts";
import type { CorpusModel } from "./executable-model-corpus-manifest.ts";
import { markdownTableRows, withoutBackticks } from "./markdown-tables.ts";
import { scanMarkdownLinks } from "./markdown-link-lexer.ts";
import { loadMechanismMaturityVector } from "./mechanism-maturity.ts";
import { summarizeCommandReceipts } from "./summarize-command-receipts.ts";
import { compareSelectedDeliveryCohorts, deliveryEvidenceReader, readSelectedDeliveryCohort, requireSelectedDeliveryCohort } from "./delivery-acceptance.ts";
import type { SelectedDeliveryCohort } from "./delivery-acceptance.ts";

const TrackStages = {
  bpmnRequirements: ["supported", "rejected", "unsupported", "undecided"],
  cibVariants: ["exactSelectedProfile", "notSelected", "notApplicable"],
  wholeModelJourneys: ["journeyBacked", "guidedJourneyBacked", "notCatalogReady", "bindingMissing", "bindingFailed"],
  mechanismMaturity: ["supported", "rejected", "unsupported", "undecided"],
} as const;
type TrackId = keyof typeof TrackStages;
const trackIds = Object.keys(TrackStages) as TrackId[];

const ReportedStages: Record<TrackId, ReadonlyArray<string>> = {
  bpmnRequirements: ["supported", "rejected"],
  cibVariants: ["exactSelectedProfile"],
  wholeModelJourneys: ["journeyBacked", "guidedJourneyBacked"],
  mechanismMaturity: [],
};
const RemainingStages: Record<TrackId, ReadonlyArray<string>> = {
  bpmnRequirements: ["unsupported", "undecided"],
  cibVariants: ["notSelected"],
  wholeModelJourneys: ["notCatalogReady", "bindingMissing", "bindingFailed"],
  mechanismMaturity: [],
};
const Bases: Record<TrackId, string> = {
  bpmnRequirements: "Reviewed requirement dispositions; supported/rejected is a decided disposition, not delivery acceptance.",
  cibVariants: "Canonical registered variants with selected CIB evidence; selection is not current qualification.",
  wholeModelJourneys: "Corpus declarations and local content bindings; catalog eligibility is not a passing journey result.",
  mechanismMaturity: "Existing non-conformance family classifications; no completion stage is inferred.",
};
const missingInputs = [
  "A reviewed complete mapping from required Practical CIB7 behavioral variants/combinations to stable variant IDs and exact scope.",
  "Dated acceptance evidence bound to each stable variant, exact source/profile and scope, covering applicable Lean/core, CIB, Temporal recovery/replay, whole-model journey and independent closure; pending, failed and missing evidence stays open.",
] as const;
const limitations = [
  "Tracker stages do not establish end-to-end Practical CIB7 acceptance or its exact remaining variants.",
  "Reviewed requirements and registered variants are bounded inventories, not complete conformance or Practical CIB7 denominators.",
  "Command receipt durations measure command cost, not engineering effort; snapshot elapsed windows are calendar time.",
  "No percentage or delivery ETA is inferred. External source declarations are not revalidated by this command.",
] as const;

export type TrackerRow = Readonly<{
  id: string;
  scopeSha256: string;
  stage: string;
  facts: Readonly<Record<string, string>>;
}>;
type BoundFile = Readonly<{
  path: string;
  sha256: string | null;
  status: "present" | "missing" | "digestMismatch";
}>;
type Tracker = Readonly<{ basis: string; rows: ReadonlyArray<TrackerRow> }>;
export type DeliverySnapshot = Readonly<{
  schemaVersion: 1 | 2;
  kind: "deliveryTrackerSnapshot";
  capturedAt: string;
  target: BoundFile;
  inputs: ReadonlyArray<BoundFile>;
  tracks: Readonly<Record<TrackId, Tracker>>;
  commandCost: ReturnType<typeof summarizeCommandReceipts> | null;
  deliveryAcceptance: Readonly<{
    status: "unknown";
    acceptedVariants: null;
    remainingVariants: null;
    missingInputs: ReadonlyArray<string>;
    selectedCohort?: SelectedDeliveryCohort;
  }>;
  limitations: ReadonlyArray<string>;
}>;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}
const consumedCapabilityOwnerSha256 = sha256(await readFile(new URL("../model-corpus/mvp-capabilities.ts", import.meta.url)));
function normalizedScope(scope: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(scope).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}
function trackerRow(id: string, scope: Record<string, string>, stage: string, facts: Record<string, string>): TrackerRow {
  return { id, scopeSha256: sha256(normalizedScope(scope)), stage, facts };
}
function sortedRows(rows: ReadonlyArray<TrackerRow>): ReadonlyArray<TrackerRow> {
  return [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function readRequirementTrackerRows(ledger: string): ReadonlyArray<TrackerRow> {
  return markdownTableRows(ledger, "## Reviewed requirements", "## Growth rule", 7).map(cells =>
    trackerRow(withoutBackticks(cells[0] ?? ""), {
      normativeSource: cells[1] ?? "", machineReadableAnchor: cells[2] ?? "", obligation: cells[3] ?? "",
      selectedInterpretation: cells[5] ?? "",
    }, withoutBackticks(cells[4] ?? ""), {
      semanticOwnerReferences: JSON.stringify(scanMarkdownLinks(cells[5] ?? "").map(link => link.destination)),
      evidenceStatusSha256: sha256(cells[6] ?? ""),
    }),
  );
}

/** Takes a read-only content snapshot of existing owners without running their qualification gates. */
export async function loadDeliverySnapshot(
  projectRoot: string,
  capturedAt = new Date().toISOString(),
  receiptRoot?: string,
): Promise<DeliverySnapshot> {
  const files = new Map<string, BoundFile>();
  const contents = new Map<string, Buffer | null>();
  async function boundFile(relativePath: string, expectedSha256?: string): Promise<BoundFile> {
    if (!contents.has(relativePath)) {
      try { contents.set(relativePath, await readFile(path.join(projectRoot, relativePath))); }
      catch (error) {
        if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
        contents.set(relativePath, null);
      }
    }
    const bytes = contents.get(relativePath) ?? null;
    const digest = bytes === null ? null : sha256(bytes);
    const binding: BoundFile = { path: relativePath, sha256: digest,
      status: digest === null ? "missing" : expectedSha256 !== undefined && digest !== expectedSha256 ? "digestMismatch" : "present" };
    files.set(relativePath, binding);
    return binding;
  }
  async function requiredText(relativePath: string): Promise<string> {
    if ((await boundFile(relativePath)).status !== "present") throw new Error(`missing tracker owner: ${relativePath}`);
    return contents.get(relativePath)!.toString("utf8");
  }
  const ledger = await requiredText("docs/BPMN-REQUIREMENT-LEDGER.md");
  const manifest = requireExecutableModelCorpusManifest(JSON.parse(await requiredText("model-corpus/manifest.json")));
  await requiredText("model-corpus/mvp-capabilities.ts");
  if (files.get("model-corpus/mvp-capabilities.ts")?.sha256 !== consumedCapabilityOwnerSha256) {
    throw new Error("capability registry differs from the consumed module owner");
  }
  await requiredText("docs/SEMANTIC-VERIFICATION-POLICY.md");
  const target = await boundFile("docs/PRACTICAL-CIB7-COVERAGE-TARGET.md");
  if (target.status !== "present") throw new Error(`missing tracker owner: ${target.path}`);
  const maturity = await loadMechanismMaturityVector(projectRoot);
  const ownerBindings = [...files.values()];
  const evidenceReader = deliveryEvidenceReader(projectRoot);
  const selectedCohort = await readSelectedDeliveryCohort(contents.get(target.path)!.toString("utf8"), manifest.models, {
    ...evidenceReader,
    current: async relativePath => {
      await boundFile(relativePath);
      return contents.get(relativePath) ?? null;
    },
  });

  async function modelRow(model: CorpusModel): Promise<TrackerRow> {
    const profile = await boundFile(`profiles/${model.profile}/profile.json`);
    const scope: Record<string, string> = {
      source: JSON.stringify(model.source), profile: model.profile, profileSha256: profile.sha256 ?? "missing",
      constructs: JSON.stringify(model.constructs), mechanisms: JSON.stringify(model.mechanisms),
    };
    const facts: Record<string, string> = {
      recordedAdmission: model.admission.kind, pipelineCaseId: model.pipelineCaseId ?? "none",
      product2Declaration: model.product2.kind,
      profile: model.profile, profileSha256: profile.sha256 ?? "missing", profileBinding: profile.status,
    };
    const bindings = [profile];
    if (model.source.kind === "retainedScenario") {
      const source = await boundFile(model.source.bpmnRelativePath, model.source.sha256);
      const scenario = await boundFile(model.source.scenarioRelativePath);
      scope.scenarioSha256 = scenario.sha256 ?? "missing";
      facts.sourcePath = model.source.bpmnRelativePath;
      facts.expectedSourceSha256 = model.source.sha256;
      facts.sourceBinding = source.status;
      facts.observedSourceSha256 = source.sha256 ?? "missing";
      facts.scenarioPath = model.source.scenarioRelativePath;
      facts.scenarioSha256 = scenario.sha256 ?? "missing";
      facts.scenarioBinding = scenario.status;
      bindings.push(source, scenario);
    } else {
      facts.sourceBinding = "externalDeclarationOnly";
      facts.expectedSourceSha256 = model.source.sha256;
      facts.externalSourceId = model.source.externalSourceId;
      facts.sourcePath = model.source.relativePath;
    }
    if (model.product2.kind !== "notCatalogReady") {
      const journey = await boundFile(model.product2.journeyTestRelativePath);
      facts.journeySourcePath = model.product2.journeyTestRelativePath;
      facts.journeySourceBinding = journey.status;
      facts.journeySourceSha256 = journey.sha256 ?? "missing";
      bindings.push(journey);
    }
    const stage = bindings.some(binding => binding.status === "digestMismatch") ? "bindingFailed"
      : bindings.some(binding => binding.status === "missing") ? "bindingMissing" : model.product2.kind;
    return trackerRow(model.id, scope, stage, facts);
  }
  const models = [];
  for (const model of manifest.models) models.push(await modelRow(model));
  const rows: Record<TrackId, ReadonlyArray<TrackerRow>> = {
    bpmnRequirements: readRequirementTrackerRows(ledger),
    cibVariants: mvpBpmnCapabilities.map(capability => trackerRow(capability.id, {
      family: capability.family, element: capability.element, support: capability.support, restriction: capability.restriction,
    }, capability.cibEvidence.kind, { evidenceSelection: JSON.stringify(capability.cibEvidence) })),
    wholeModelJourneys: models,
    mechanismMaturity: maturity.families.map(family => trackerRow(family.familyId, {
      mechanismObligation: family.mechanismObligation,
    }, family.familyDisposition, {
      invariantCoverage: family.invariantCoverage.classification, invariantEvidence: family.invariantCoverage.evidence,
      activityOccurrenceAdoption: family.activityOccurrenceAdoption.classification, activityEvidence: family.activityOccurrenceAdoption.evidence,
      multipleEnabledClosure: family.multipleEnabledClosure.classification, multipleEnabledEvidence: family.multipleEnabledClosure.evidence,
      compositionEvidence: family.compositionEvidence.classification, compositionEvidenceReference: family.compositionEvidence.evidence,
    })),
  };
  return requireDeliverySnapshot({
    schemaVersion: 2, kind: "deliveryTrackerSnapshot", capturedAt, target,
    inputs: ownerBindings.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    tracks: Object.fromEntries(trackIds.map(id => [id, { basis: Bases[id], rows: sortedRows(rows[id]) }])),
    commandCost: receiptRoot === undefined ? null : summarizeCommandReceipts(receiptRoot),
    deliveryAcceptance: { status: "unknown", acceptedVariants: null, remainingVariants: null, missingInputs, selectedCohort }, limitations,
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function stringRecord(value: unknown, label: string): Record<string, string> {
  const object = record(value, label);
  if (!Object.values(object).every(entry => typeof entry === "string")) throw new TypeError(`${label} must contain strings`);
  return object as Record<string, string>;
}
function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function requireBoundFile(value: unknown): void {
  const file = record(value, "input binding");
  if (typeof file.path !== "string" || file.path.length === 0 ||
      !["present", "missing", "digestMismatch"].includes(String(file.status)) ||
      (file.status === "missing" ? file.sha256 !== null : typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(file.sha256))) {
    throw new TypeError("invalid input binding");
  }
}

/** Rejects malformed persisted snapshots before their IDs or stages can affect a comparison. */
export function requireDeliverySnapshot(value: unknown): DeliverySnapshot {
  const snapshot = record(value, "snapshot");
  if (snapshot.kind !== "deliveryTrackerSnapshot" || snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== 2) throw new TypeError("unsupported snapshot kind/version");
  if (!validTimestamp(snapshot.capturedAt)) throw new TypeError("invalid snapshot timestamp");
  requireBoundFile(snapshot.target);
  if (!Array.isArray(snapshot.inputs)) throw new TypeError("missing snapshot input bindings");
  snapshot.inputs.forEach(requireBoundFile);
  const tracks = record(snapshot.tracks, "tracks");
  if (Object.keys(tracks).sort().join() !== [...trackIds].sort().join()) throw new TypeError("snapshot tracker set changed");
  for (const id of trackIds) {
    const tracker = record(tracks[id], id);
    if (tracker.basis !== Bases[id] || !Array.isArray(tracker.rows)) throw new TypeError(`invalid tracker ${id}`);
    const seen = new Set<string>();
    for (const value of tracker.rows) {
      const row = record(value, `${id} row`);
      if (typeof row.id !== "string" || row.id.length === 0) throw new TypeError(`invalid ${id} ID`);
      if (seen.has(row.id)) throw new TypeError(`duplicate ${id} ID: ${row.id}`);
      seen.add(row.id);
      stringRecord(row.facts, "facts");
      if (typeof row.scopeSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(row.scopeSha256)) throw new TypeError(`invalid scope digest for ${row.id}`);
      if (!(TrackStages[id] as ReadonlyArray<string>).includes(String(row.stage))) throw new TypeError(`invalid ${id} stage`);
    }
  }
  const acceptance = record(snapshot.deliveryAcceptance, "delivery acceptance");
  if (acceptance.status !== "unknown" || acceptance.acceptedVariants !== null || acceptance.remainingVariants !== null ||
      JSON.stringify(acceptance.missingInputs) !== JSON.stringify(missingInputs)) throw new TypeError("unsupported delivery acceptance claim");
  if (snapshot.schemaVersion === 2) requireSelectedDeliveryCohort(acceptance.selectedCohort);
  else if (acceptance.selectedCohort !== undefined) throw new TypeError("legacy snapshot cannot claim a selected acceptance cohort");
  if (JSON.stringify(snapshot.limitations) !== JSON.stringify(limitations)) throw new TypeError("snapshot limitations changed");
  if (snapshot.commandCost !== null) {
    const cost = record(snapshot.commandCost, "command cost");
    if (cost.timingBasis !== "command.txt and exit-status modification times" || !Array.isArray(cost.invalidReceipts)) {
      throw new TypeError("invalid command cost evidence");
    }
  }
  return value as DeliverySnapshot;
}

function stageSummary(id: TrackId, rows: ReadonlyArray<TrackerRow>) {
  return Object.fromEntries(TrackStages[id].map(stage => [stage, rows.filter(row => row.stage === stage).length]));
}
function compareTracker(id: TrackId, before: Tracker, after: Tracker) {
  const oldRows = new Map(before.rows.map(row => [row.id, row]));
  const newRows = new Map(after.rows.map(row => [row.id, row]));
  const sortedIds = (ids: Iterable<string>) => [...ids].sort();
  const shared = sortedIds(oldRows.keys()).filter(key => newRows.has(key));
  const stable = shared.filter(key => oldRows.get(key)!.scopeSha256 === newRows.get(key)!.scopeSha256);
  const isReportedStage = (row: TrackerRow) => ReportedStages[id].includes(row.stage);
  return {
    basis: Bases[id], beforeTotal: before.rows.length, afterTotal: after.rows.length,
    beforeByStage: stageSummary(id, before.rows), afterByStage: stageSummary(id, after.rows),
    addedIds: sortedIds(newRows.keys()).filter(key => !oldRows.has(key)),
    removedIds: sortedIds(oldRows.keys()).filter(key => !newRows.has(key)),
    scopeChangedIds: shared.filter(key => !stable.includes(key)), stableScopeCount: stable.length,
    stageChanges: stable.filter(key => oldRows.get(key)!.stage !== newRows.get(key)!.stage)
      .map(key => ({ id: key, before: oldRows.get(key)!.stage, after: newRows.get(key)!.stage })),
    factChangedIds: stable.filter(key => normalizedScope(oldRows.get(key)!.facts) !== normalizedScope(newRows.get(key)!.facts)),
    enteredStageIds: stable.filter(key => !isReportedStage(oldRows.get(key)!) && isReportedStage(newRows.get(key)!)),
    leftStageIds: stable.filter(key => isReportedStage(oldRows.get(key)!) && !isReportedStage(newRows.get(key)!)),
    afterRemainingStageIds: id === "mechanismMaturity" ? null
      : sortedIds(after.rows.filter(row => RemainingStages[id].includes(row.stage)).map(row => row.id)),
  };
}

/** Compares only unchanged ID/scope cohorts; additions, removals and scope changes are separate facts. */
export function compareDeliverySnapshots(beforeValue: unknown, afterValue: unknown) {
  const before = requireDeliverySnapshot(beforeValue);
  const after = requireDeliverySnapshot(afterValue);
  const elapsedWindowMs = Date.parse(after.capturedAt) - Date.parse(before.capturedAt);
  if (elapsedWindowMs <= 0) throw new TypeError("after snapshot must be later than before snapshot");
  return {
    kind: "deliveryTrackerComparison" as const,
    before: before.capturedAt, after: after.capturedAt, elapsedWindowMs,
    targetScopeChanged: before.target.sha256 !== after.target.sha256,
    tracks: Object.fromEntries(trackIds.map(id => [id, compareTracker(id, before.tracks[id], after.tracks[id])])) as
      Record<TrackId, ReturnType<typeof compareTracker>>,
    commandCost: { before: before.commandCost, after: after.commandCost },
    deliveryAcceptance: { status: "unknown" as const, openedVariantIds: null, closedVariantIds: null,
      acceptedVariants: null, remainingVariants: null, ratePerDay: null, missingInputs,
      selectedCohort: compareSelectedDeliveryCohorts(before.deliveryAcceptance.selectedCohort, after.deliveryAcceptance.selectedCohort, elapsedWindowMs) },
    limitations,
  };
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  try {
    const [command, first, second, ...rest] = process.argv.slice(2);
    let result: unknown;
    switch (command) {
      case "snapshot":
        if (rest.length !== 0 || !(first === undefined && second === undefined || first === "--receipt-root" && second !== undefined)) throw new Error("invalid snapshot arguments");
        result = await loadDeliverySnapshot(fileURLToPath(new URL("../", import.meta.url)), undefined, second);
        break;
      case "compare":
        if (first === undefined || second === undefined || rest.length !== 0) throw new Error("compare requires two snapshot paths");
        result = compareDeliverySnapshots(JSON.parse(await readFile(first, "utf8")), JSON.parse(await readFile(second, "utf8")));
        break;
      default: throw new Error("unknown command");
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\nusage: node scripts/delivery-progress.ts snapshot [--receipt-root <path>] | compare <before.json> <after.json>\n`);
    process.exitCode = 2;
  }
}
