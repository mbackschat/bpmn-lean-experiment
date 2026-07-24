import type { ScenarioResult } from "@bpmn-lean/semantic-core";

import type { ValueDisagreement } from "./structural-diff.js";
import { firstValueDisagreement } from "./structural-diff.js";

export enum DifferentialTarget {
  RetainedCibEvidence = "retainedCibEvidence",
  CibSeven = "cibSeven",
  Lean = "lean",
  SemanticCore = "semanticCore",
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
  result: ScenarioResult;
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

function compareScenarioResults(
  reference: ScenarioResult,
  candidate: ScenarioResult,
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
      expectedObservation,
      actualObservation,
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
