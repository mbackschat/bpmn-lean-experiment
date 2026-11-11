import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ComparisonKind,
  DifferentialTarget,
  DisagreementKind,
  compareTargetResults,
  foldSynchronousEffects,
} from "@bpmn-lean/differential";
import type {
  CanonicalResult,
  Comparison,
  ScenarioDisagreement,
} from "@bpmn-lean/differential";

function requireDisagreement(comparison: Comparison): ScenarioDisagreement {
  assert.ok(
    comparison.kind === ComparisonKind.Disagreement,
    "the comparison must classify a disagreement",
  );
  return comparison.disagreement;
}

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

const evidence = (result: CanonicalResult = recut([wait("Task_A", "userTask")], null)) =>
  ({ target: DifferentialTarget.RetainedCibEvidence, result });
const kernel = (result: CanonicalResult = recut([wait("Task_A", "userTask")], null)) =>
  ({ target: DifferentialTarget.Kernel, result });

test("accepts exact canonical agreement across all declared targets", () => {
  const comparison = compareTargetResults(evidence(), [
    kernel(),
    { target: DifferentialTarget.KernelTs, result: recut([wait("Task_A", "userTask")], null) },
    { target: DifferentialTarget.Temporal, result: recut([wait("Task_A", "userTask")], null) },
  ]);
  assert.deepEqual(comparison, {
    kind: ComparisonKind.Agreement,
    targets: [
      DifferentialTarget.RetainedCibEvidence,
      DifferentialTarget.Kernel,
      DifferentialTarget.KernelTs,
      DifferentialTarget.Temporal,
    ],
  });
});

test("classifies an injected observation-value disagreement at its first path", () => {
  const mutated = recut([wait("Task_A", "userTask")], null);
  const trace = mutated.trace.map((entry) => entry.kind === "state" ? { ...entry, status: "completed" } : entry);
  assert.deepEqual(compareTargetResults(evidence(), [{ target: DifferentialTarget.KernelTs, result: { ...mutated, trace } }]), {
    kind: ComparisonKind.Disagreement,
    referenceTarget: DifferentialTarget.RetainedCibEvidence,
    candidateTarget: DifferentialTarget.KernelTs,
    disagreement: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[2].status",
      expected: "running",
      actual: "completed",
    },
  });
});

test("distinguishes outcome, trace-length, and observation-kind disagreements", () => {
  const base = recut([wait("Task_A", "userTask")], null);
  assert.equal(requireDisagreement(compareTargetResults(evidence(), [
    kernel({ ...base, outcome: { kind: "semantic", outcome: "committed" } }),
  ])).kind, DisagreementKind.Outcome);
  assert.equal(requireDisagreement(compareTargetResults(evidence(), [
    kernel({ ...base, trace: base.trace.slice(0, -1) }),
  ])).kind, DisagreementKind.TraceLength);
  assert.equal(requireDisagreement(compareTargetResults(evidence(), [
    kernel({ ...base, trace: base.trace.map((entry, index) =>
      index === 2 ? { kind: "command", commandId: "start", outcome: "committed" } : entry) }),
  ])).kind, DisagreementKind.ObservationKind);
});

test("compares open waits in the schema's canonical order, never in the order a target lists them", () => {
  const listed = recut([wait("Task_B", "userTask"), wait("Task_A", "timer"), wait("Task_A", "incident")], null);
  const reordered = recut([wait("Task_A", "incident"), wait("Task_B", "userTask"), wait("Task_A", "timer")], null);
  assert.equal(compareTargetResults({ target: DifferentialTarget.RetainedCibEvidence, result: listed },
    [{ target: DifferentialTarget.Kernel, result: reordered }]).kind, ComparisonKind.Agreement);
  const changed = recut([wait("Task_A", "incident"), wait("Task_B", "userTask"), wait("Task_C", "timer")], null);
  assert.equal(requireDisagreement(compareTargetResults({ target: DifferentialTarget.RetainedCibEvidence, result: listed },
    [{ target: DifferentialTarget.Kernel, result: changed }])).kind, DisagreementKind.ObservationValue);
});

test("compares a Human Task's candidates as multisets, never in the order a target lists them", () => {
  const task = (candidateUsers: ReadonlyArray<string>, candidateGroups: ReadonlyArray<string>) =>
    recut([{ ...wait("Task_A", "userTask"), detail: { kind: "userTask", candidateUsers, candidateGroups } }], null);
  const compare = (left: CanonicalResult, right: CanonicalResult) =>
    compareTargetResults({ target: DifferentialTarget.RetainedCibEvidence, result: left },
      [{ target: DifferentialTarget.Kernel, result: right }]);
  const declared = task(["bob", "carol"], ["triagers", "leads"]) as CanonicalResult;
  assert.equal(compare(declared, task(["carol", "bob"], ["leads", "triagers"]) as CanonicalResult).kind,
    ComparisonKind.Agreement);
  assert.equal(requireDisagreement(compare(declared, task(["bob", "bob"], ["triagers", "leads"]) as CanonicalResult)).kind,
    DisagreementKind.ObservationValue);
});

test("compares a command's code between the two kernels only, never against retained CIB evidence", () => {
  const lean = { target: DifferentialTarget.Kernel, result: recut([], "unknown-task") };
  assert.equal(compareTargetResults({ target: DifferentialTarget.RetainedCibEvidence, result: recut([], null) }, [lean]).kind,
    ComparisonKind.Agreement);
  assert.deepEqual(
    requireDisagreement(compareTargetResults(lean, [{ target: DifferentialTarget.KernelTs, result: recut([], "stale-task") }])),
    { kind: DisagreementKind.ObservationValue, path: "trace[3].code", expected: "unknown-task", actual: "stale-task" },
  );
});

test("compares a state's variable scopes between the two kernels only, never against retained CIB evidence", () => {
  const scoped = (value: number) => {
    const result = recut([], null);
    const scope = { scope: { processInstanceId: "Instance_1", role: "activity", elementId: "Sub", activation: 1 },
      variables: [{ name: "item", value: { kind: "integer", value } }] };
    return { ...result, trace: result.trace.map((entry) => entry.kind === "state" ? { ...entry, scopes: [scope] } : entry) };
  };
  const lean = { target: DifferentialTarget.Kernel, result: scoped(1) };
  assert.equal(compareTargetResults({ target: DifferentialTarget.RetainedCibEvidence, result: recut([], null) }, [lean]).kind,
    ComparisonKind.Agreement);
  assert.deepEqual(
    requireDisagreement(compareTargetResults(lean, [{ target: DifferentialTarget.KernelTs, result: scoped(2) }])),
    { kind: DisagreementKind.ObservationValue, path: "trace[2].scopes[0].variables[0].value.value", expected: 1, actual: 2 },
  );
});

test("compares a state's Signal broadcasts between the two kernels only, never against retained CIB evidence", () => {
  const thrown = (name: string) => {
    const result = recut([], null);
    const broadcast = { name, variables: [],
      origin: { processInstanceId: "Instance_1", elementId: "Throw", activation: 1 } };
    return { ...result, trace: result.trace.map((entry) => entry.kind === "state" ? { ...entry, broadcasts: [broadcast] } : entry) };
  };
  const lean = { target: DifferentialTarget.Kernel, result: thrown("S") };
  assert.equal(compareTargetResults({ target: DifferentialTarget.RetainedCibEvidence, result: recut([], null) }, [lean]).kind,
    ComparisonKind.Agreement);
  assert.deepEqual(
    requireDisagreement(compareTargetResults(lean, [{ target: DifferentialTarget.KernelTs, result: thrown("T") }])),
    { kind: DisagreementKind.ObservationValue, path: "trace[2].broadcasts[0].name", expected: "S", actual: "T" },
  );
});

test("compares an effect wait's arguments only when neither side is retained CIB evidence (CIB-OP-0013)", () => {
  const effect = (value: string) => recut([{ ...wait("Task_A", "effect"), input: "effectResult",
    detail: { kind: "effect", protocol: "p", operation: "o", arguments: value === "" ? [] : [{ name: "order", value: { kind: "string", value } }], failures: 0, send: null } }], null);
  assert.equal(compareTargetResults(evidence(effect("")), [kernel(effect("O-1"))]).kind, ComparisonKind.Agreement);
  assert.equal(compareTargetResults(kernel(effect("O-1")), [evidence(effect(""))]).kind, ComparisonKind.Agreement);
  assert.deepEqual(
    requireDisagreement(compareTargetResults(kernel(effect("O-1")), [{ target: DifferentialTarget.Temporal, result: effect("O-2") }])),
    { kind: DisagreementKind.ObservationValue, path: "trace[2].openWaits[0].detail.arguments[0].value.value", expected: "O-1", actual: "O-2" },
  );
  const failures = effect("");
  const twice = { ...failures, trace: failures.trace.map((entry) => entry.kind === "state"
    ? { ...entry, openWaits: [{ ...wait("Task_A", "effect"), input: "effectResult", detail: { kind: "effect", protocol: "p", operation: "o", arguments: [], failures: 1, send: null } }] }
    : entry) };
  assert.equal(requireDisagreement(compareTargetResults(evidence(failures), [kernel(twice)])).kind, DisagreementKind.ObservationValue);
  // The effect an incident wait carries is the failed job's, whose input mappings rolled back with it.
  const incident = (value: string, failures: number) => recut([{ ...wait("Task_A", "incident"), input: "command",
    detail: { kind: "incident", effect: { protocol: "p", operation: "o", arguments: value === "" ? [] : [{ name: "order", value: { kind: "string", value } }], failures, send: null }, generation: 1, cancellable: true } }], null);
  assert.equal(compareTargetResults(evidence(incident("", 1)), [kernel(incident("O-1", 1))]).kind, ComparisonKind.Agreement);
  assert.equal(requireDisagreement(compareTargetResults(evidence(incident("", 1)), [kernel(incident("O-1", 2))])).kind,
    DisagreementKind.ObservationValue);
});

test("compares a root list of Strings as the runner's stringList only against retained CIB evidence (CIB-OP-0015)", () => {
  const strings = (...values: string[]) => ({ kind: "list", value: values.map((value) => ({ kind: "string", value })) });
  const withRoot = (value: unknown, inputs: ReadonlyArray<unknown> = []) => ({
    outcome: { kind: "semantic", outcome: "completed" },
    trace: [
      { kind: "deployment", outcome: "committed" },
      { kind: "state", instanceId: "Instance_1", status: "running", logicalTimeMs: 0, variables: [{ name: "fees", value }],
        openWaits: [{ ...wait("Task_A", "userTask"), detail: { kind: "userTask", candidateUsers: [], candidateGroups: [], inputs } }] },
    ],
  });
  const legacy = (...values: string[]) => ({ kind: "stringList", value: values });
  assert.equal(compareTargetResults(evidence(withRoot(legacy("a", "b"))), [kernel(withRoot(strings("a", "b")))]).kind, ComparisonKind.Agreement);
  assert.equal(compareTargetResults(evidence(withRoot(legacy())), [kernel(withRoot(strings()))]).kind, ComparisonKind.Agreement);
  assert.equal(compareTargetResults(evidence(withRoot(legacy(), [{ name: "tags", value: legacy("x") }])),
    [kernel(withRoot(strings(), [{ name: "tags", value: strings("x") }]))]).kind, ComparisonKind.Agreement);
  // The order and the members still count, a nested List of Strings is not the legacy kind, and two kernels compare kinds exactly.
  assert.equal(compareTargetResults(evidence(withRoot(legacy("b", "a"))), [kernel(withRoot(strings("a", "b")))]).kind, ComparisonKind.Disagreement);
  const nested = { kind: "list", value: [strings("a")] };
  assert.equal(compareTargetResults(evidence(withRoot({ kind: "list", value: [legacy("a")] })), [kernel(withRoot(nested))]).kind, ComparisonKind.Disagreement);
  assert.equal(compareTargetResults(kernel(withRoot(legacy("a"))), [{ target: DifferentialTarget.KernelTs, result: withRoot(strings("a")) }]).kind,
    ComparisonKind.Disagreement);
});

const deployed = { kind: "deployment", outcome: "committed" };
const state = (status: string, variables: ReadonlyArray<unknown>, openWaits: ReadonlyArray<unknown>) =>
  ({ kind: "state", instanceId: "Instance_1", status, logicalTimeMs: 0, variables, openWaits });
const committed = (commandId: string) => ({ kind: "command", commandId, outcome: "committed" });
const done = state("completed", [{ name: "resultValue", value: { kind: "string", value: "example-result" } }], []);
const synchronousEvidence: CanonicalResult = {
  outcome: { kind: "semantic", outcome: "completed" },
  trace: [deployed, committed("start"), done],
};
const effectInputKernel: CanonicalResult = {
  outcome: { kind: "semantic", outcome: "completed" },
  trace: [
    deployed,
    committed("start"),
    state("running", [], [wait("Task_Effect", "effect")]),
    committed("complete-effect"),
    done,
  ],
};

test("folds an effect input CIB ran inside the command before it, dropping the open-effect state it never exposed", () => {
  const folded = foldSynchronousEffects(effectInputKernel, synchronousEvidence, {
    synchronousAfter: new Set(["start"]),
    effectInputs: new Set(["complete-effect"]),
  });
  assert.deepEqual(folded.trace, synchronousEvidence.trace);
  assert.equal(compareTargetResults(evidence(synchronousEvidence), [kernel(folded)]).kind, ComparisonKind.Agreement);
});

test("keeps an effect input the reference observed, one after a command without a delegate run, and any other input", () => {
  const keeps = (synchronousAfter: ReadonlyArray<string>, effectInputs: ReadonlyArray<string>, reference = synchronousEvidence) =>
    assert.deepEqual(
      foldSynchronousEffects(effectInputKernel, reference, {
        synchronousAfter: new Set(synchronousAfter),
        effectInputs: new Set(effectInputs),
      }).trace,
      effectInputKernel.trace,
    );
  keeps(["start"], ["complete-effect"], effectInputKernel);
  keeps([], ["complete-effect"]);
  keeps(["start"], []);
});
