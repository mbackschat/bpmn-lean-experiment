import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioOutcomeKind,
  WaitKind,
} from "@bpmn-lean/semantic-core";
import type { ScenarioResult } from "@bpmn-lean/semantic-core";
import {
  ComparisonKind,
  DifferentialTarget,
  DisagreementKind,
  compareTargetResults,
} from "@bpmn-lean/differential";
import type {
  Comparison,
  ScenarioDisagreement,
  TargetScenarioResult,
} from "@bpmn-lean/differential";

import type {
  MutableScenarioResult,
} from "./pipeline-types.ts";

const calibratedResult: ScenarioResult = {
  outcome: {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  },
  trace: [
    {
      kind: CanonicalObservationKind.Deployment,
      outcome: CommandOutcome.Committed,
    },
    {
      kind: CanonicalObservationKind.State,
      instanceId: "Instance_1",
      status: ProcessStatus.Running,
      activeWaits: [
        {
          elementId: "UserTask_Approve",
          kind: WaitKind.UserTask,
          multiplicity: 1,
        },
      ],
      openUserTasks: [],
      openMessageSubscriptions: [],
      openTimers: [],
      openEffects: [],
      openIncidents: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    },
  ],
};

function target(
  targetName: DifferentialTarget,
  result: ScenarioResult = calibratedResult,
): TargetScenarioResult {
  return {
    target: targetName,
    result,
  };
}

function mutableResult(): MutableScenarioResult {
  return structuredClone(calibratedResult) as MutableScenarioResult;
}

function requireDisagreement(comparison: Comparison): ScenarioDisagreement {
  assert.ok(
    comparison.kind === ComparisonKind.Disagreement,
    "the comparison must classify a disagreement",
  );
  return comparison.disagreement;
}

function stateObservation(
  result: MutableScenarioResult,
  index: number,
): Extract<
  MutableScenarioResult["trace"][number],
  { kind: CanonicalObservationKind.State }
> {
  const observation = result.trace[index];
  assert.ok(
    observation?.kind === CanonicalObservationKind.State,
    `trace[${index}] must be a state observation`,
  );
  return observation;
}

test("accepts exact canonical agreement across all declared targets", () => {
  const comparison = compareTargetResults(
    target(DifferentialTarget.CibSeven),
    [
      target(DifferentialTarget.Kernel),
      target(DifferentialTarget.KernelTs),
      target(DifferentialTarget.Temporal),
    ],
  );

  assert.deepEqual(comparison, {
    kind: ComparisonKind.Agreement,
    targets: [
      DifferentialTarget.CibSeven,
      DifferentialTarget.Kernel,
      DifferentialTarget.KernelTs,
      DifferentialTarget.Temporal,
    ],
  });
});

test("classifies an injected observation-value disagreement at its first path", () => {
  const mutatedResult = mutableResult();
  stateObservation(mutatedResult, 1).status = ProcessStatus.Completed;

  const comparison = compareTargetResults(
    target(DifferentialTarget.CibSeven),
    [target(DifferentialTarget.KernelTs, mutatedResult)],
  );

  assert.deepEqual(comparison, {
    kind: ComparisonKind.Disagreement,
    referenceTarget: DifferentialTarget.CibSeven,
    candidateTarget: DifferentialTarget.KernelTs,
    disagreement: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[1].status",
      expected: "running",
      actual: "completed",
    },
  });
});

test("distinguishes outcome, trace-length, and observation-kind disagreements", () => {
  const outcomeMutation = mutableResult();
  outcomeMutation.outcome = {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Rejected,
  };
  assert.equal(
    requireDisagreement(
      compareTargetResults(target(DifferentialTarget.CibSeven), [
        target(DifferentialTarget.Kernel, outcomeMutation),
      ]),
    ).kind,
    DisagreementKind.Outcome,
  );

  const lengthMutation = mutableResult();
  lengthMutation.trace.pop();
  assert.equal(
    requireDisagreement(
      compareTargetResults(target(DifferentialTarget.CibSeven), [
        target(DifferentialTarget.Kernel, lengthMutation),
      ]),
    ).kind,
    DisagreementKind.TraceLength,
  );

  const kindMutation = mutableResult();
  kindMutation.trace[1] = {
    kind: CanonicalObservationKind.Command,
    commandId: "start-process",
    outcome: CommandOutcome.Committed,
  };
  assert.equal(
    requireDisagreement(
      compareTargetResults(target(DifferentialTarget.CibSeven), [
        target(DifferentialTarget.Kernel, kindMutation),
      ]),
    ).kind,
    DisagreementKind.ObservationKind,
  );
});

const wait = (elementId: string, kind: string) => ({
  id: { processInstanceId: "Instance_1", elementId, activation: 1 },
  definition: null,
  input: kind === "timer" ? "timerFire" : "command",
  detail: { kind },
});

const recut = (openWaits: ReadonlyArray<unknown>, code: string | null) => ({
  outcome: { kind: "semantic", outcome: "rejected" },
  trace: [
    { kind: "deployment", outcome: "committed" },
    { kind: "command", commandId: "start", outcome: "committed" },
    { kind: "state", instanceId: "Instance_1", status: "running", logicalTimeMs: 0, variables: [], openWaits },
    { kind: "command", commandId: "late", outcome: "rejected", ...(code === null ? {} : { code }) },
  ],
});

test("compares open waits in the schema's canonical order, never in the order a target lists them", () => {
  const listed = recut([wait("Task_B", "userTask"), wait("Task_A", "timer"), wait("Task_A", "incident")], null);
  const reordered = recut([wait("Task_A", "incident"), wait("Task_B", "userTask"), wait("Task_A", "timer")], null);
  assert.equal(compareTargetResults({ target: DifferentialTarget.CibSeven, result: listed },
    [{ target: DifferentialTarget.Kernel, result: reordered }]).kind, ComparisonKind.Agreement);
  const changed = recut([wait("Task_A", "incident"), wait("Task_B", "userTask"), wait("Task_C", "timer")], null);
  assert.equal(requireDisagreement(compareTargetResults({ target: DifferentialTarget.CibSeven, result: listed },
    [{ target: DifferentialTarget.Kernel, result: changed }])).kind, DisagreementKind.ObservationValue);
});

test("compares a command's code between the two kernels only, never against CIB Seven", () => {
  const lean = { target: DifferentialTarget.Kernel, result: recut([], "unknown-task") };
  assert.equal(compareTargetResults({ target: DifferentialTarget.CibSeven, result: recut([], null) }, [lean]).kind,
    ComparisonKind.Agreement);
  assert.deepEqual(
    requireDisagreement(compareTargetResults(lean, [{ target: DifferentialTarget.KernelTs, result: recut([], "stale-task") }])),
    { kind: DisagreementKind.ObservationValue, path: "trace[3].code", expected: "unknown-task", actual: "stale-task" },
  );
});

test("compares a state's variable scopes between the two kernels only, never against CIB Seven", () => {
  const scoped = (value: number) => {
    const result = recut([], null);
    const scope = { scope: { processInstanceId: "Instance_1", role: "activity", elementId: "Sub", activation: 1 },
      variables: [{ name: "item", value: { kind: "integer", value } }] };
    return { ...result, trace: result.trace.map((entry) => entry.kind === "state" ? { ...entry, scopes: [scope] } : entry) };
  };
  const lean = { target: DifferentialTarget.Kernel, result: scoped(1) };
  assert.equal(compareTargetResults({ target: DifferentialTarget.CibSeven, result: recut([], null) }, [lean]).kind,
    ComparisonKind.Agreement);
  assert.deepEqual(
    requireDisagreement(compareTargetResults(lean, [{ target: DifferentialTarget.KernelTs, result: scoped(2) }])),
    { kind: DisagreementKind.ObservationValue, path: "trace[2].scopes[0].variables[0].value.value", expected: 1, actual: 2 },
  );
});
