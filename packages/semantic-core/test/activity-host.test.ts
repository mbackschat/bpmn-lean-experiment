import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityWorkKind,
  ControlStateKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  applyInternalOperationStep,
  initialState,
  isPublishedOperationKind,
  projectOpenFlowNodeOccurrences,
  publishedOperationKind,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram, rootScopeOccurrence } from "./root-scope-fixture.ts";

type OperationAdmissionModule = typeof import("../src/semantic-process-operation-admission.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const { isWellFormedSemanticOperation } = await import(
  new URL("../dist/semantic-process-operation-admission.js", import.meta.url).href
) as OperationAdmissionModule;
const { deriveInternalTransitionFootprint } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const processId = "Process_ActivityHost";
const instanceId = "Instance_ActivityHost";
const owner = rootScopeOccurrence(processId, instanceId);
const places = ["place:Flow_A", "place:Flow_B", "place:Flow_Out"];

const host = {
  ...operationBase("Task_Review"),
  kind: SemanticOperationKind.Activity,
  inputs: ["place:Flow_A", "place:Flow_B"],
  outputs: [{ place: "place:Flow_Out" }],
  work: { kind: ActivityWorkKind.UserTask, task: { elementId: "Task_Review", name: "Review claim" } },
} as const satisfies SemanticOperation;

const legacyFrom = (input: string): SemanticOperation => ({
  ...operationBase("Task_Review"),
  kind: SemanticOperationKind.AwaitUserTask,
  input,
  output: "place:Flow_Out",
  task: { elementId: "Task_Review", name: "Review claim" },
});

const program = (operation: SemanticOperation): SemanticProcessProgram => rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "activity-host-test",
    sourceId: "activity-host-test",
    sourceOverlay: null,
    sourceSha256: "d".repeat(64),
  },
  processId,
  controlPlaces: ["A", "B", "Out"].map((id) => controlPlace(`Flow_${id}`)),
  operations: [operation],
});

const running = (marked: ReadonlyArray<string>): RuntimeState => ({
  ...initialState,
  control: { kind: ControlStateKind.Running, instanceId },
  scopeOccurrences: [{ id: owner, parent: null }],
  controlTokens: marked.map((placeId) => ({ placeId, owner, multiplicity: 1 })),
});

const wellFormed = (operation: unknown): boolean =>
  isWellFormedSemanticOperation(operation, new Set(places), new Map(), new Map());

test("ACTH-HOST-01: admits a host of two sorted distinct inputs and one output", () => {
  assert.equal(wellFormed(host), true);
});

test("ACTH-HOST-01: refuses a host that would double or exceed the legacy encoding", () => {
  assert.equal(wellFormed({ ...host, inputs: ["place:Flow_A"] }), false, "one input");
  assert.equal(wellFormed({ ...host, inputs: ["place:Flow_B", "place:Flow_A"] }), false, "unsorted inputs");
  assert.equal(wellFormed({ ...host, outputs: [{ place: "place:Flow_Out" }, { place: "place:Flow_A" }] }), false, "two outputs");
  assert.equal(wellFormed({ ...host, outputs: ["place:Flow_Out"] }), false, "a bare output place");
  assert.equal(wellFormed({ ...host, work: { kind: "script" } }), false, "an unknown work kind");
});

test("ACTH-HOST-01: publishes its work's legacy kind and never its discriminant", () => {
  assert.equal(publishedOperationKind(host), SemanticOperationKind.AwaitUserTask);
  assert.equal(isPublishedOperationKind("activity"), false);
  assert.equal(isPublishedOperationKind("awaitUserTask"), true);
});

test("ACTH-MERGE-01: an arrival on either input equals the legacy arrival from that input", () => {
  for (const input of host.inputs) {
    const arrived = applyInternalOperationStep(program(host), host, running([input]));
    const legacy = applyInternalOperationStep(program(legacyFrom(input)), legacyFrom(input), running([input]));
    assert.ok(arrived !== null && legacy !== null);
    // The step names the host it fired; everything it commits is the legacy arrival's.
    assert.deepEqual(arrived.operation, host);
    assert.deepEqual({ ...arrived, operation: legacy.operation }, legacy);
  }
});

test("ACTH-MERGE-01: two marked inputs leave the host unprepared rather than choosing", () => {
  assert.equal(applyInternalOperationStep(program(host), host, running(["place:Flow_A", "place:Flow_B"])), null);
});

test("ACTH-HOST-01: a host carries no footprint, so it is never batched", () => {
  assert.equal(deriveInternalTransitionFootprint(program(host), running(["place:Flow_A"]), { operation: host, owner }), null);
});

const splitting = {
  ...operationBase("Task_Review"),
  kind: SemanticOperationKind.Activity,
  inputs: ["place:Flow_A"],
  outputs: [{ place: "place:Flow_B" }, { place: "place:Flow_Out" }],
  work: { kind: ActivityWorkKind.UserTask, task: { elementId: "Task_Review", name: "Review claim" } },
} as const satisfies SemanticOperation;

test("ACSP-HOST-01: admits a host of one input and two sorted distinct outputs, and no other split shape", () => {
  assert.equal(wellFormed(splitting), true);
  assert.equal(wellFormed({ ...splitting, inputs: ["place:Flow_A", "place:Flow_B"] }), false, "many to many");
  assert.equal(wellFormed({ ...splitting, outputs: [{ place: "place:Flow_Out" }, { place: "place:Flow_B" }] }), false,
    "unsorted outputs");
  assert.equal(wellFormed({ ...splitting, outputs: [{ place: "place:Flow_B" }, { place: "place:Flow_B" }] }), false,
    "a repeated output");
  assert.equal(wellFormed({ ...splitting, outputs: [] }), false, "no output");
});

test("ACSP-WAIT-01: a splitting arrival opens the legacy wait of its work carrying every output", () => {
  const legacy = { ...legacyFrom("place:Flow_A"), output: "place:Flow_B" } as SemanticOperation;
  const arrived = applyInternalOperationStep(program(splitting), splitting, running(["place:Flow_A"]));
  const expected = applyInternalOperationStep(program(legacy), legacy, running(["place:Flow_A"]));
  assert.ok(arrived !== null && expected !== null);
  assert.deepEqual(arrived.operation, splitting);
  const [wait] = expected.successor.userTaskWaits;
  assert.ok(wait !== undefined);
  assert.deepEqual(arrived.successor, {
    ...expected.successor,
    userTaskWaits: [{ ...wait, outputs: ["place:Flow_B", "place:Flow_Out"] }],
  });
  // ACSP-WAIT-01: the open-set projection recognizes the opened wait as the host's, not as a stray one.
  assert.notEqual(projectOpenFlowNodeOccurrences(program(splitting), arrived.successor), null);
  assert.equal(projectOpenFlowNodeOccurrences(program(splitting), {
    ...arrived.successor,
    userTaskWaits: [{ ...wait, outputs: ["place:Flow_B"] }],
  }), null, "a wait carrying only the first output is no wait of the host");
});
