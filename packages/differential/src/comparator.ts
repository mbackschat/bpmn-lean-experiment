import { compareCanonicalStrings } from "@bpmn-lean/semantic-core";

import type { ValueDisagreement } from "./structural-diff.js";
import { firstValueDisagreement, isJsonRecord } from "./structural-diff.js";

/**
 * A canonical result (`contracts/schemas/canonical-result.schema.json`) as the comparator reads it: the outcome and
 * the trace's observation kinds; every other member is compared structurally.
 */
export type CanonicalResult = Readonly<{
  outcome: unknown;
  trace: ReadonlyArray<Readonly<{ kind: string }>>;
}>;

export enum DifferentialTarget {
  RetainedCibEvidence = "retainedCibEvidence",
  CibSeven = "cibSeven",
  Kernel = "kernel",
  KernelTs = "kernelTs",
  Temporal = "temporal",
}

export enum ComparisonKind {
  Agreement = "agreement",
  Disagreement = "disagreement",
}

export enum DisagreementKind {
  Outcome = "outcome",
  TraceLength = "traceLength",
  ObservationKind = "observationKind",
  ObservationValue = "observationValue",
}

export type TargetScenarioResult = Readonly<{
  target: DifferentialTarget;
  result: CanonicalResult;
}>;

export type ScenarioDisagreement =
  | Readonly<
      {
        kind: DisagreementKind.Outcome;
      } & ValueDisagreement
    >
  | Readonly<{
      kind: DisagreementKind.TraceLength;
      expectedLength: number;
      actualLength: number;
    }>
  | Readonly<{
      kind: DisagreementKind.ObservationKind;
      observationIndex: number;
      expected: string;
      actual: string;
    }>
  | Readonly<
      {
        kind: DisagreementKind.ObservationValue;
      } & ValueDisagreement
    >;

type Agreement = Readonly<{
  kind: ComparisonKind.Agreement;
  targets: ReadonlyArray<DifferentialTarget>;
}>;

type Disagreement = Readonly<{
  kind: ComparisonKind.Disagreement;
  referenceTarget: DifferentialTarget;
  candidateTarget: DifferentialTarget;
  disagreement: ScenarioDisagreement;
}>;

export type Comparison = Agreement | Disagreement;

/** Both targets transcribe the same kernel, so only they share the kernel's stable codes and variable scopes. */
const kernelTargets: ReadonlySet<DifferentialTarget> = new Set([DifferentialTarget.Kernel, DifferentialTarget.KernelTs]);

type OpenWaitKey = readonly [string, string, number, string];

function openWaitKey(wait: unknown): OpenWaitKey {
  const record = isJsonRecord(wait) ? wait : {};
  const id = isJsonRecord(record["id"]) ? record["id"] : {};
  const detail = isJsonRecord(record["detail"]) ? record["detail"] : {};
  return [String(id["processInstanceId"]), String(id["elementId"]), Number(id["activation"]), String(detail["kind"])];
}

function compareOpenWaits(left: unknown, right: unknown): number {
  const [a, b] = [openWaitKey(left), openWaitKey(right)];
  return compareCanonicalStrings(a[0], b[0]) || compareCanonicalStrings(a[1], b[1]) || a[2] - b[2] ||
    compareCanonicalStrings(a[3], b[3]);
}

/**
 * The comparable form of one observation. Open waits are sorted by the schema's canonical key, since their order is not
 * a semantic claim. Two fields are compared only when both targets are kernels: a command's or deployment's `code`,
 * kernel-internal, and a state's non-root variable `scopes`, beyond the CIB Seven projection's observation boundary.
 * A target without them, CIB Seven among them, omits them.
 */
function comparable(observation: unknown, kernels: boolean): unknown {
  if (!isJsonRecord(observation)) return observation;
  const { code, scopes, ...rest } = observation;
  const kept: Readonly<Record<string, unknown>> = kernels
    ? { ...rest, ...(code === undefined ? {} : { code }), ...(scopes === undefined ? {} : { scopes }) }
    : rest;
  const waits = kept["openWaits"];
  return Array.isArray(waits) ? { ...kept, openWaits: [...waits].sort(compareOpenWaits) } : kept;
}

function compareScenarioResults(
  reference: CanonicalResult,
  candidate: CanonicalResult,
  kernels: boolean,
): ScenarioDisagreement | null {
  const outcomeDifference = firstValueDisagreement(
    reference.outcome,
    candidate.outcome,
    "outcome",
  );
  if (outcomeDifference !== null) {
    return {
      kind: DisagreementKind.Outcome,
      ...outcomeDifference,
    };
  }

  if (reference.trace.length !== candidate.trace.length) {
    return {
      kind: DisagreementKind.TraceLength,
      expectedLength: reference.trace.length,
      actualLength: candidate.trace.length,
    };
  }

  for (const [index, expectedObservation] of reference.trace.entries()) {
    const actualObservation = candidate.trace[index];
    if (actualObservation === undefined) {
      throw new TypeError("Trace length changed during comparison");
    }
    if (expectedObservation.kind !== actualObservation.kind) {
      return {
        kind: DisagreementKind.ObservationKind,
        observationIndex: index,
        expected: expectedObservation.kind,
        actual: actualObservation.kind,
      };
    }
    const observationDifference = firstValueDisagreement(
      comparable(expectedObservation, kernels),
      comparable(actualObservation, kernels),
      `trace[${index}]`,
    );
    if (observationDifference !== null) {
      return {
        kind: DisagreementKind.ObservationValue,
        ...observationDifference,
      };
    }
  }

  return null;
}

export function compareTargetResults(
  reference: TargetScenarioResult,
  candidates: ReadonlyArray<TargetScenarioResult>,
): Comparison {
  const targets = [reference.target];
  for (const candidate of candidates) {
    const disagreement = compareScenarioResults(
      reference.result,
      candidate.result,
      kernelTargets.has(reference.target) && kernelTargets.has(candidate.target),
    );
    if (disagreement !== null) {
      return {
        kind: ComparisonKind.Disagreement,
        referenceTarget: reference.target,
        candidateTarget: candidate.target,
        disagreement,
      };
    }
    targets.push(candidate.target);
  }
  return {
    kind: ComparisonKind.Agreement,
    targets,
  };
}
