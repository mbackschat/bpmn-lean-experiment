/**
 * Shared in-memory contracts for the four-target differential pipeline.
 */
import type {
  AcceptedBpmnCompilation,
} from "@bpmn-lean/bpmn-source";
import type {
  CanonicalObservation,
  DeepReadonly,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
} from "@bpmn-lean/differential";
import type {
  ScenarioDisagreement,
} from "@bpmn-lean/differential";
import {
  EffectExecutionSchedule,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalScenarioExecution,
} from "@bpmn-lean/temporal-testkit";

export const TemporalCaseRelation = Object.freeze({
  ExactSemantic: "exactSemantic",
  ExactSemanticWithClosedReceipt: "exactSemanticWithClosedReceipt",
  PostTerminalClosed: "postTerminalClosed",
});

export type TemporalCaseRelation =
  typeof TemporalCaseRelation[keyof typeof TemporalCaseRelation];

export const CibCaseRelation = Object.freeze({
  ExactSemantic: "exactSemantic",
  SynchronousFinalState: "synchronousFinalState",
  SynchronousBoundaryError: "synchronousBoundaryError",
});

export type CibCaseRelation =
  typeof CibCaseRelation[keyof typeof CibCaseRelation];

export type DeepMutable<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly [unknown, ...unknown[]]
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T extends ReadonlyArray<infer Item>
      ? Array<DeepMutable<Item>>
      : T extends object
        ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
        : T;

export type MutableScenarioResult = DeepMutable<ScenarioResult>;
export type MutableStateObservation = Extract<
  DeepMutable<CanonicalObservation>,
  { kind: "state" }
>;
export type ObservationValueDisagreement = Extract<
  ScenarioDisagreement,
  { kind: typeof DisagreementKind.ObservationValue }
>;

export const CibEffectExecutionSchedule = {
  None: "none",
  FailAfterMutationOnce: "failAfterMutationOnce",
  IncidentReportRetrySuccess: "incidentReportRetrySuccess",
  IncidentReportCancel: "incidentReportCancel",
} as const;

export type CibEffectExecutionSchedule =
  typeof CibEffectExecutionSchedule[
    keyof typeof CibEffectExecutionSchedule
  ];

export const PipelineReplaySelection = {
  Primary: "primary",
  PrimaryAndIsolation: "primaryAndIsolation",
} as const;

export type PipelineReplaySelection =
  typeof PipelineReplaySelection[
    keyof typeof PipelineReplaySelection
  ];

export type TemporalEffectSchedulePair = DeepReadonly<{
  primary: EffectExecutionSchedule;
  isolation: EffectExecutionSchedule;
}>;

export type CibPipelineConfiguration = DeepReadonly<{
  evidenceRelativePath: string;
  version: "2.0.0" | "2.2.0";
  relation: CibCaseRelation;
  effectExecutionSchedule: CibEffectExecutionSchedule;
}>;

export type PipelineCase = DeepReadonly<{
  id: string;
  scenarioRelativePath: string;
  bpmnRelativePath: string;
  workflowIdPrefix: string;
  cib: CibPipelineConfiguration | null;
  expectedWaitTraceLength: number;
  completionDelivery: TemporalCompletionDelivery;
  temporalRelation: TemporalCaseRelation;
  executionSchedule: TemporalExecutionSchedule;
  effectSchedules: TemporalEffectSchedulePair | null;
  replaySelection: PipelineReplaySelection;
  injectMutation: (result: MutableScenarioResult) => void;
  expectedInjectedDisagreement: ObservationValueDisagreement;
}>;

export type RetainedEvidence = Readonly<{
  result: ScenarioResult;
}>;

export type PipelineContext = Readonly<{
  pipelineCase: PipelineCase;
  scenario: Scenario;
  retainedEvidence: RetainedEvidence | null;
  checkedProcess: AcceptedBpmnCompilation["checkedProcess"];
  semanticProcess: SemanticProcessProgram;
}>;

export type LeanDefinitionRecord = Readonly<{
  scenarioId: string;
  checkedProcess: AcceptedBpmnCompilation["checkedProcess"];
  semanticProcess: SemanticProcessProgram;
}>;

export type LeanResultRecord = Readonly<{
  scenarioId: string;
  scenario: Scenario;
  definitionBinding: Readonly<{
    kind: "leanDefinitionBinding";
    sourceSha256: string;
    semanticProfile: string;
    programMatchesLeanLowering: boolean;
  }>;
  result: ScenarioResult;
}>;

export type CibEffectExecution = Readonly<{
  afterCommandId: string;
  schedule: string;
  invocations: number;
  mutations: number;
  initialRetries: number;
  retriesAfterFirstFailure: number | null;
}>;

export type CibPipelineResult = Readonly<{
  scenarioId: string;
  outcome: ScenarioResult["outcome"];
  trace: ScenarioResult["trace"];
  diagnostics: Readonly<{
    startupNanos: number;
    phases: Readonly<{
      waitProjectionNanos: number;
      completionProjectionNanos: number;
      totalNanos: number;
    }>;
    effectExecutions?: ReadonlyArray<CibEffectExecution>;
    mappingExecutions?: ReadonlyArray<Readonly<{
      afterCommandId: string;
      handler: string;
      arguments: ReadonlyArray<unknown>;
      localPatch: ReadonlyArray<unknown>;
      invocations: number;
    }>>;
    cleanup: Readonly<Record<string, number>>;
  }>;
}>;

export type TargetBatch<Result> = Readonly<{
  results: ReadonlyMap<string, Result>;
  totalMs: number;
}>;

export type TemporalCaseExecution = Readonly<{
  primary: TemporalScenarioExecution;
  isolation: TemporalScenarioExecution;
}>;

export type TemporalTargetBatch =
  TargetBatch<TemporalCaseExecution> & Readonly<{
    workflowIds: ReadonlyArray<string>;
  }>;

export type PipelineTargets = Readonly<{
  cib: TargetBatch<CibPipelineResult>;
  lean: TargetBatch<ScenarioResult>;
  leanDefinitionMutation: Readonly<{
    kind: "rejected";
    mutation: "operationOrigin";
  }>;
  leanScenarioMutation: Readonly<{
    kind: "rejected";
    mutation: "scenarioExtraField";
  }>;
  leanProvenanceMutation: Readonly<{
    kind: "rejected";
    mutation: "parallelControlPlaceProvenanceErasure";
  }>;
  core: TargetBatch<ScenarioResult>;
  temporal: TemporalTargetBatch;
  cibEffectRetry: TargetBatch<CibPipelineResult> | null;
}>;

export type ProjectedTargets = Readonly<{
  cibResult: CibPipelineResult | null;
  canonicalCib: ScenarioResult | null;
  leanResult: ScenarioResult;
  semanticCoreResult: ScenarioResult;
  temporalResult: TemporalCaseExecution;
  cibEffectRetryResult: CibPipelineResult | null;
}>;
