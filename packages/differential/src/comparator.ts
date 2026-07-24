import type { ScenarioResult } from "@bpmn-lean/semantic-core";

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

type ValueDisagreement = Readonly<{
  path: string;
  expected: unknown;
  actual: unknown;
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

type JsonRecord = Readonly<Record<string, unknown>>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childPath(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function firstValueDisagreement(
  expected: unknown,
  actual: unknown,
  path: string,
): ValueDisagreement | null {
  if (Object.is(expected, actual)) {
    return null;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return {
        path: `${path}.length`,
        expected: expected.length,
        actual: actual.length,
      };
    }
    for (const [index, expectedItem] of expected.entries()) {
      const difference = firstValueDisagreement(
        expectedItem,
        actual[index],
        `${path}[${index}]`,
      );
      if (difference !== null) {
        return difference;
      }
    }
    return null;
  }

  if (isJsonRecord(expected) && isJsonRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
      .sort();
    for (const key of keys) {
      const difference = firstValueDisagreement(
        expected[key],
        actual[key],
        childPath(path, key),
      );
      if (difference !== null) {
        return difference;
      }
    }
    return null;
  }

  return { path, expected, actual };
}

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
