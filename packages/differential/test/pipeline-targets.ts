/**
 * Temporal target invocation and shared target exports for the full pipeline.
 */
import { performance } from "node:perf_hooks";

import type {
  ScenarioResult,
} from "@bpmn-lean/semantic-core";
import {
  TemporalScenarioRunner,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalScenarioBatchItem,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
} from "@bpmn-lean/temporal-testkit";

export {
  runCibTargetGroups,
  runCibTargets,
} from "./pipeline-cib-targets.ts";
export {
  elapsedMs,
  runProcess,
} from "./pipeline-target-support.ts";
export {
  loadAndCompileCases,
  requireLeanDefinitionMutationRejection,
  requireLeanProvenanceErasureRejection,
  requireLeanScenarioMutationRejection,
  runCoreTargets,
  runLeanTargets,
} from "./semantic-differential-targets.ts";
import {
  elapsedMs,
} from "./pipeline-target-support.ts";
import type {
  CibPipelineResult,
  PipelineCase,
  PipelineContext,
  TemporalCaseExecution,
  TemporalTargetBatch,
} from "./pipeline-types.ts";

export function canonicalCibResult(
  cibResult: CibPipelineResult,
): ScenarioResult {
  return {
    outcome: cibResult.outcome,
    trace: cibResult.trace,
  };
}

export function requireUniqueCaseIds(cases: ReadonlyArray<PipelineCase>): void {
  if (cases.length === 0) {
    throw new TypeError("At least one pipeline case is required");
  }
  const ids = cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("Pipeline case IDs must be unique");
  }
}

function temporalOptions(
  pipelineCase: PipelineCase,
  suffix: "primary" | "isolation",
): TemporalScenarioExecutionOptions {
  return {
    workflowId: `${pipelineCase.workflowIdPrefix}-${suffix}`,
    completionDelivery: pipelineCase.completionDelivery,
    executionSchedule: pipelineCase.executionSchedule,
    effectExecutionSchedule:
      pipelineCase.effectSchedules?.[suffix] ?? null,
  };
}

export async function runTemporalTargets(
  runner: TemporalScenarioRunner,
  contexts: ReadonlyArray<PipelineContext>,
): Promise<TemporalTargetBatch> {
  const started = performance.now();
  const items: ReadonlyArray<TemporalScenarioBatchItem> =
    contexts.flatMap(
      ({ pipelineCase, scenario, semanticProcess }) => [
        {
          scenario,
          semanticProcess,
          options: temporalOptions(pipelineCase, "primary"),
        },
        {
          scenario,
          semanticProcess,
          options: temporalOptions(pipelineCase, "isolation"),
        },
      ],
    );
  // Every run executes one at a time. Concurrent batches broke timing-dependent cases on the shared
  // Temporal server: ordered-effect Activities missed their 5 s start deadline (hosted runs 40336067821
  // and 40338683649), and bounded-deadline races and 10 s wait-state observations failed locally
  // (2026-10-26). Effect runs must stay serial regardless, because a case's primary and isolation runs
  // register the same transport keys in the runner's one probe registry.
  const executions: TemporalScenarioExecution[] = [];
  for (const item of items) {
    executions.push(await runner.runScenario(
      item.scenario,
      item.semanticProcess,
      item.options,
    ));
  }
  const results = new Map<string, TemporalCaseExecution>();
  // Every target batch is keyed by scenario identity, because the comparison layer reads all of them
  // with one key. Keying this map by pipeline case identity instead made a case whose two names
  // differ fail as a missing Temporal result only after the whole batch had already run.
  for (const [index, { pipelineCase, scenario }] of contexts.entries()) {
    const primary = executions[index * 2];
    const isolation = executions[index * 2 + 1];
    if (primary === undefined || isolation === undefined) {
      throw new Error(
        `Temporal batch omitted execution ${pipelineCase.id}`,
      );
    }
    if (results.has(scenario.id)) {
      throw new Error(`Temporal batch repeated scenario ${scenario.id}`);
    }
    results.set(scenario.id, { primary, isolation });
  }
  return {
    results,
    workflowIds: items.map(({ options }) => options.workflowId),
    totalMs: elapsedMs(started),
  };
}
