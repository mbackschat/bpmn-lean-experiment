import assert from "node:assert/strict";
import { test } from "node:test";

import { StimulusKind } from "@bpmn-lean/semantic-core";
import {
  EffectExecutionSchedule,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
  TemporalScenarioRunner,
} from "@bpmn-lean/temporal-testkit";

import { runTemporalTargets } from "./pipeline-targets.ts";
import type { PipelineContext } from "./pipeline-types.ts";

// Locks serial execution: concurrent batches broke timing-dependent cases on the shared Temporal
// server (hosted runs 40336067821 and 40338683649; local pipeline, 2026-10-26). The cases cover a
// legacy effect schedule, an ordered effect and plain human work, so no kind escapes the order.
test("runs every Temporal case one at a time in case order and never as a concurrent batch", async () => {
  const order: Array<string> = [];
  const runner = {
    runScenarios: async () => {
      throw new Error("the pipeline must not start a concurrent batch");
    },
    runScenario: async (
      _scenario: unknown,
      _semanticProcess: unknown,
      options: TemporalScenarioExecutionOptions,
    ) => {
      order.push(`${options.workflowId} started`);
      await Promise.resolve();
      order.push(`${options.workflowId} finished`);
      return execution(options);
    },
  } as unknown as TemporalScenarioRunner;

  const batch = await runTemporalTargets(runner, [
    context("plain", null),
    context("effect", {
      primary: EffectExecutionSchedule.PlainSuccess,
      isolation: EffectExecutionSchedule.PlainSuccess,
    }),
    context("ordered-effect", null, [StimulusKind.CompleteEffect]),
  ]);

  assert.deepEqual(order, [
    "plain-primary", "plain-isolation",
    "effect-primary", "effect-isolation",
    "ordered-effect-primary", "ordered-effect-isolation",
  ].flatMap((workflowId) => [`${workflowId} started`, `${workflowId} finished`]));
  assert.deepEqual(
    [...batch.results.keys()],
    ["plain-scenario", "effect-scenario", "ordered-effect-scenario"],
  );
});

function context(
  name: string,
  effectSchedules: Readonly<{
    primary: EffectExecutionSchedule;
    isolation: EffectExecutionSchedule;
  }> | null,
  laterStimuli: ReadonlyArray<StimulusKind> = [],
): PipelineContext {
  return {
    pipelineCase: {
      id: name,
      workflowIdPrefix: name,
      effectSchedules,
    },
    scenario: {
      id: `${name}-scenario`,
      stimuli: [StimulusKind.StartProcess, ...laterStimuli].map((kind) => ({ kind })),
    },
    semanticProcess: {},
  } as unknown as PipelineContext;
}

function execution(
  options: TemporalScenarioExecutionOptions,
): TemporalScenarioExecution {
  return { workflowId: options.workflowId } as unknown as TemporalScenarioExecution;
}
