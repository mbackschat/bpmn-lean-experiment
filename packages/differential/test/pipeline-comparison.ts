/**
 * Canonical comparison, seeded disagreement, replay, and timing projection.
 */
import { isDeepStrictEqual } from "node:util";

import {
  CanonicalObservationKind,
  ProcessStatus,
  ScenarioOutcomeKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  ScenarioResult,
} from "@bpmn-lean/semantic-core";
import {
  DifferentialTarget,
  compareTargetResults,
} from "@bpmn-lean/differential";
import type {
  TargetScenarioResult,
} from "@bpmn-lean/differential";
import {
  ProcessCommandResultKind,
  TemporalScenarioRunner,
} from "@bpmn-lean/temporal-testkit";

import {
  hostInteractionExpectations,
} from "./pipeline-expectations.ts";
import {
  CibEffectExecutionSchedule,
  CibCaseRelation,
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type {
  CibPipelineResult,
  DeepMutable,
  PipelineContext,
  PipelineTargets,
  ProjectedTargets,
  TargetBatch,
  TemporalCaseExecution,
} from "./pipeline-types.ts";
import {
  canonicalCibResult,
} from "./pipeline-targets.ts";
import {
  verifyServiceTaskIncidentCibExecution,
} from "./service-task-incident-pipeline-comparison.ts";

function mutableClone<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

function requiredResult<Result>(
  results: ReadonlyMap<string, Result>,
  scenarioId: string,
  targetName: string,
): Result {
  const result = results.get(scenarioId);
  if (result === undefined) {
    throw new Error(`${targetName} omitted scenario ${scenarioId}`);
  }
  return result;
}

function requiredCibResult<Result>(
  result: Result | null,
  scenarioId: string,
): Result {
  if (result === null) {
    throw new Error(`CIB result omitted for ${scenarioId}`);
  }
  return result;
}

export function projectCaseTargets(
  context: PipelineContext,
  targets: PipelineTargets,
): ProjectedTargets {
  const scenarioId = context.scenario.id;
  const cibResult =
    context.pipelineCase.cib === null
      ? null
      : requiredResult(
          targets.cib.results,
          scenarioId,
          "CIB Seven",
        );
  return {
    cibResult,
    canonicalCib:
      cibResult === null ? null : canonicalCibResult(cibResult),
    leanResult: requiredResult(
      targets.lean.results,
      scenarioId,
      "Lean",
    ),
    semanticCoreResult: requiredResult(
      targets.core.results,
      scenarioId,
      "semantic core",
    ),
    temporalResult: requiredResult(
      targets.temporal.results,
      scenarioId,
      "Temporal",
    ),
    cibEffectRetryResult:
      targets.cibEffectRetry === null
        ? null
        : targets.cibEffectRetry.results.get(scenarioId) ?? null,
  };
}

export function compareCase(
  context: PipelineContext,
  projectedTargets: ProjectedTargets,
) {
  const {
    pipelineCase,
    scenario,
    retainedEvidence,
    checkedProcess,
    semanticProcess,
  } = context;
  const {
    cibResult,
    canonicalCib,
    leanResult,
    semanticCoreResult,
    temporalResult,
    cibEffectRetryResult,
  } = projectedTargets;
  const cibConfiguration = pipelineCase.cib;
  if (
    (cibConfiguration === null) !== (retainedEvidence === null) ||
    (cibConfiguration === null) !== (cibResult === null) ||
    (cibConfiguration === null) !== (canonicalCib === null)
  ) {
    throw new Error(
      `CIB configuration and artifacts differ for ${scenario.id}`,
    );
  }
  const semanticCandidates: Array<TargetScenarioResult> = [
    {
      target: DifferentialTarget.Lean,
      result: leanResult,
    },
    {
      target: DifferentialTarget.SemanticCore,
      result: semanticCoreResult,
    },
  ];
  if (
    pipelineCase.temporalRelation ===
      TemporalCaseRelation.ExactSemantic
  ) {
    semanticCandidates.push({
      target: DifferentialTarget.Temporal,
      result: temporalResult.primary.result,
    });
  }
  const comparison = (() => {
    if (
      cibConfiguration?.relation === CibCaseRelation.ExactSemantic
    ) {
      return compareTargetResults(
        {
          target: DifferentialTarget.CibSeven,
          result: requiredCibResult(canonicalCib, scenario.id),
        },
        semanticCandidates,
      );
    }
    return compareTargetResults(
      {
        target: DifferentialTarget.Lean,
        result: leanResult,
      },
      semanticCandidates.filter(
        ({ target }) => target !== DifferentialTarget.Lean,
      ),
    );
  })();
  const cibHostComparison =
    cibConfiguration?.relation ===
      CibCaseRelation.SynchronousFinalState
      ? compareTargetResults(
          {
            target: DifferentialTarget.CibSeven,
            result: requiredCibResult(canonicalCib, scenario.id),
          },
          [
            {
              target: DifferentialTarget.Lean,
              result: projectSynchronousHostResult(leanResult),
            },
          ],
        )
      : cibConfiguration?.relation ===
          CibCaseRelation.SynchronousBoundaryError
        ? compareTargetResults(
            {
              target: DifferentialTarget.CibSeven,
              result: requiredCibResult(canonicalCib, scenario.id),
            },
            [
              {
                target: DifferentialTarget.Lean,
                result:
                  projectSynchronousBoundaryErrorHostResult(leanResult),
              },
            ],
          )
      : null;
  const expectedTemporalPrefix =
    pipelineCase.temporalRelation ===
      TemporalCaseRelation.PostTerminalClosed
      ? semanticPrefixThroughCompletion(semanticCoreResult)
      : null;
  const temporalPrefixComparison =
    expectedTemporalPrefix === null
      ? null
      : compareTargetResults(
          {
            target: DifferentialTarget.SemanticCore,
            result: expectedTemporalPrefix,
          },
          [
            {
              target: DifferentialTarget.Temporal,
              result: temporalResult.primary.result,
            },
          ],
        );
  const expectedPostTerminalCommand =
    pipelineCase.temporalRelation ===
      TemporalCaseRelation.PostTerminalClosed
      ? scenario.stimuli.at(-1)
        ?? null
      : null;
  const postTerminalResult =
    temporalResult.primary.interactionEvidence.postTerminalResult;
  if (
    expectedPostTerminalCommand !== null &&
    (
      postTerminalResult?.kind !==
        ProcessCommandResultKind.ProcessClosed ||
      postTerminalResult.commandId !==
        expectedPostTerminalCommand.commandId
    )
  ) {
    throw new Error(
      `Temporal did not classify ${expectedPostTerminalCommand.commandId} as processClosed`,
    );
  }
  if (
    expectedPostTerminalCommand === null &&
    postTerminalResult !== null
  ) {
    throw new Error(
      `Temporal returned an unexpected post-terminal result for ${scenario.id}`,
    );
  }
  const evidenceComparison =
    retainedEvidence === null || canonicalCib === null
      ? null
      : compareTargetResults(
          {
            target: DifferentialTarget.RetainedCibEvidence,
            result: retainedEvidence.result,
          },
          [
            {
              target: DifferentialTarget.CibSeven,
              result: canonicalCib,
            },
          ],
        );
  if (
    cibConfiguration?.effectExecutionSchedule ===
      CibEffectExecutionSchedule.FailAfterMutationOnce
  ) {
    if (cibEffectRetryResult === null || canonicalCib === null) {
      throw new Error("Service Task case omitted the CIB retry execution");
    }
    if (
      !isDeepStrictEqual(
        canonicalCibResult(cibEffectRetryResult),
        canonicalCib,
      )
    ) {
      throw new Error(
        "CIB retry schedule changed the canonical Service Task result",
      );
    }
    const [execution] =
      cibEffectRetryResult.diagnostics.effectExecutions ?? [];
    if (
      execution?.schedule !== "failAfterMutationOnce" ||
      execution.invocations !== 2 ||
      execution.mutations !== 1 ||
      execution.initialRetries !== 3 ||
      execution.retriesAfterFirstFailure !== 2
    ) {
      throw new Error(
        "CIB retry schedule omitted its raw decrement/re-execution facts",
      );
    }
  } else if (
    cibConfiguration?.effectExecutionSchedule ===
      CibEffectExecutionSchedule.IncidentReportRetrySuccess
  ) {
    verifyServiceTaskIncidentCibExecution(
      requiredCibResult(cibResult, scenario.id),
    );
  } else if (cibEffectRetryResult !== null) {
    throw new Error(
      `Unexpected CIB retry execution for ${scenario.id}`,
    );
  }
  const injectedResult = mutableClone(semanticCoreResult);
  pipelineCase.injectMutation(injectedResult);
  const injectedReference =
    cibConfiguration?.relation === CibCaseRelation.ExactSemantic
      ? {
          target: DifferentialTarget.CibSeven,
          result: requiredCibResult(canonicalCib, scenario.id),
        } as const
      : {
          target: DifferentialTarget.Lean,
          result: leanResult,
        } as const;
  const injectedDisagreement = compareTargetResults(
    injectedReference,
    [
      {
        target: DifferentialTarget.SemanticCore,
        result: injectedResult,
      },
    ],
  );
  const expectations = hostInteractionExpectations(
    scenario,
    semanticCoreResult,
    pipelineCase.temporalRelation === TemporalCaseRelation.PostTerminalClosed,
  );

  return {
    report: {
      scenario: {
        id: scenario.id,
        profile: scenario.profile,
        bpmnSha256: scenario.bpmn.sha256,
        checkedProcess: {
          kind: checkedProcess.kind,
        },
        semanticProcess: {
          kind: semanticProcess.kind,
          compiler: semanticProcess.identity.compiler,
        },
        normativeRefs: scenario.provenance.normativeRefs,
        cibRevision: scenario.provenance.cibRevision,
      },
      comparison,
      cibHostComparison,
      temporalPrefixComparison,
      evidenceComparison,
      injectedDisagreement,
    },
    evidence: {
      scenarioId: scenario.id,
      expectedWaitTrace: semanticCoreResult.trace.slice(
        0,
        pipelineCase.expectedWaitTraceLength,
      ),
      actualWaitTrace: temporalResult.primary.waitTrace,
      primaryTemporalResult: temporalResult.primary.result,
      isolationTemporalResult: temporalResult.isolation.result,
      primaryEffectProbeEvidence:
        temporalResult.primary.effectProbeEvidence,
      isolationEffectProbeEvidence:
        temporalResult.isolation.effectProbeEvidence,
      temporalInteractionEvidence:
        temporalResult.primary.interactionEvidence,
      expectedPostTerminalResultKind:
        expectedPostTerminalCommand === null
          ? null
          : ProcessCommandResultKind.ProcessClosed,
      expectedCompletionOutcomes: expectations.completionOutcomes,
      expectedOpenUserTasksAfterCompletions:
        expectations.openUserTasksAfterCompletions,
      expectedOpenUserTasksAtFirstCompletionWait:
        expectations.openUserTasksAtFirstCompletionWait,
      expectedDerivedTimerCommandId:
        scenario.stimuli.find(
          (stimulus) => stimulus.kind === StimulusKind.FireTimer,
        )?.commandId ?? null,
      expectedDerivedEffectCommandId:
        scenario.stimuli.find(
          (stimulus) => stimulus.kind === StimulusKind.CompleteEffect,
        )?.commandId ?? null,
      cibEffectRetryEvidence:
        cibEffectRetryResult?.diagnostics.effectExecutions?.[0] ??
        null,
      cibCleanup: cibResult?.diagnostics.cleanup ?? null,
    },
  };
}

function projectSynchronousHostResult(
  semanticResult: ScenarioResult,
): ScenarioResult {
  const deployment = semanticResult.trace[0];
  const start = semanticResult.trace[1];
  const finalState = [...semanticResult.trace].reverse().find(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (
    deployment?.kind !== CanonicalObservationKind.Deployment ||
    start?.kind !== CanonicalObservationKind.Command ||
    finalState === undefined
  ) {
    throw new Error(
      "Synchronous CIB host relation requires deployment, start, and final semantic state",
    );
  }
  return {
    outcome: semanticResult.outcome,
    trace: [deployment, start, finalState],
  };
}

function projectSynchronousBoundaryErrorHostResult(
  semanticResult: ScenarioResult,
): ScenarioResult {
  const deployment = semanticResult.trace[0];
  const start = semanticResult.trace[1];
  const boundaryStateIndex = semanticResult.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.openUserTasks.some(
        ({ id }) =>
          id.elementId === "ReviewMappedError",
      ),
  );
  const boundaryState = semanticResult.trace[boundaryStateIndex];
  const completion = semanticResult.trace[boundaryStateIndex + 1];
  const finalState = semanticResult.trace[boundaryStateIndex + 2];
  if (
    deployment?.kind !== CanonicalObservationKind.Deployment ||
    start?.kind !== CanonicalObservationKind.Command ||
    boundaryState?.kind !== CanonicalObservationKind.State ||
    completion?.kind !== CanonicalObservationKind.Command ||
    finalState?.kind !== CanonicalObservationKind.State ||
    finalState.status !== ProcessStatus.Completed
  ) {
    throw new Error(
      "Synchronous boundary-error relation requires start, routed User Task, completion, and final state",
    );
  }
  return {
    outcome: semanticResult.outcome,
    trace: [
      deployment,
      start,
      boundaryState,
      completion,
      finalState,
    ],
  };
}

function semanticPrefixThroughCompletion(
  result: ScenarioResult,
): ScenarioResult {
  const completedStateIndex = result.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (completedStateIndex < 1) {
    throw new Error(
      "Post-terminal relation requires one completed semantic prefix",
    );
  }
  const finalCommand = result.trace[completedStateIndex - 1];
  if (finalCommand?.kind !== CanonicalObservationKind.Command) {
    throw new Error(
      "Completed semantic prefix has no preceding command outcome",
    );
  }
  return {
    outcome: {
      kind: ScenarioOutcomeKind.Semantic,
      outcome: finalCommand.outcome,
    },
    trace: result.trace.slice(0, completedStateIndex + 1),
  };
}

export async function replayEvidence(
  runner: TemporalScenarioRunner,
  contexts: ReadonlyArray<PipelineContext>,
  temporalResults: ReadonlyMap<string, TemporalCaseExecution>,
): Promise<Readonly<{ liveHistories: number }>> {
  const items = contexts.flatMap((context) => {
    const temporal = requiredResult(
      temporalResults,
      context.scenario.id,
      "Temporal",
    );
    return [
      {
        history: temporal.primary.history,
        workflowId: `${context.pipelineCase.workflowIdPrefix}-live-replay`,
      },
      ...(context.pipelineCase.replaySelection ===
        PipelineReplaySelection.PrimaryAndIsolation
        ? [{
            history: temporal.isolation.history,
            workflowId:
              `${context.pipelineCase.workflowIdPrefix}-isolation-live-replay`,
          }]
        : []),
    ];
  });
  await runner.replayHistories(items);
  return { liveHistories: items.length };
}

export function cibTiming(
  cibTarget: TargetBatch<CibPipelineResult>,
  contexts: ReadonlyArray<PipelineContext>,
) {
  const cibContexts = contexts.filter(
    ({ pipelineCase }) => pipelineCase.cib !== null,
  );
  const cases = cibContexts.map(({ scenario }) => {
    const result = requiredResult(
      cibTarget.results,
      scenario.id,
      "CIB Seven",
    );
    const phases = result.diagnostics.phases;
    return {
      scenarioId: scenario.id,
      scenario: phases.totalNanos / 1e6,
      observationProjection:
        (phases.waitProjectionNanos +
          phases.completionProjectionNanos) /
        1e6,
    };
  });
  const firstContext = cibContexts[0];
  if (firstContext === undefined) {
    return {
      total: cibTarget.totalMs,
      engineStartup: null,
      cases,
    };
  }
  const firstResult = requiredResult(
    cibTarget.results,
    firstContext.scenario.id,
    "CIB Seven",
  );
  return {
    total: cibTarget.totalMs,
    engineStartup: firstResult.diagnostics.startupNanos / 1e6,
    cases,
  };
}
