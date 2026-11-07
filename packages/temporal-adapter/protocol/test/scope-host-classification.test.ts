/**
 * SCPH-HOST-01's hosting classification (the scope host specification's wrong algorithm 9): Temporal host admission reads a
 * scope host with two or more entries, and an exit with two or more outputs, as a token split, so a host-driven wait
 * beside it falls to the concurrent analysis instead of passing as a passive initiation. Each refusal is a one-fact
 * change of the admitted legacy control.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  InternalSchedulingMode,
  ScopeWorkKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
} from "@bpmn-lean/semantic-core";
import type { SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import {
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  assessTemporalHostCapability,
} from "../dist/index.js";

const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId }) as const;

const timer: SemanticOperation = {
  id: "operation:Timer_Wait",
  origin: origin("Timer_Wait"),
  kind: SemanticOperationKind.AwaitTimer,
  input: "place:Flow_A",
  output: "place:Flow_Done",
  timer: { elementId: "Timer_Wait", durationMs: 1000 },
};

const program = (operations: ReadonlyArray<SemanticOperation>): SemanticProcessProgram => ({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "scope-host-classification-test",
    sourceId: "scope-host-classification-test",
    sourceOverlay: null,
    sourceSha256: "f".repeat(64),
  },
  processId: "Process_Classification",
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  definitionScopes: [],
  controlPlaces: [],
  controlPlaceScopes: [],
  operations: [...operations],
  operationScopes: [],
});

const concurrentWaitRefusal = {
  kind: TemporalHostCapabilityResultKind.Rejected,
  failure: {
    code: TemporalHostAdmissionFailureCode.ConcurrentHostDrivenWaits,
    evidence: "A token split can make a timer or effect wait concurrent with another semantic branch.",
  },
};

test("SCPH-HOST-01: the legacy initiation beside a timer wait is passive, so the host admits it", () => {
  const initiate: SemanticOperation = {
    id: "operation:Start", origin: origin("Start"), kind: SemanticOperationKind.Initiate, output: "place:Flow_A",
  };
  assert.deepEqual(assessTemporalHostCapability(program([initiate, timer])), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });
});

test("SCPH-HOST-01: a splitting process host beside a timer wait is a token split", () => {
  const host: SemanticOperation = {
    id: "operation:Start", origin: origin("Start"), kind: SemanticOperationKind.Scope, inputs: [],
    entries: [{ place: "place:Flow_A" }, { place: "place:Flow_B" }], work: { kind: ScopeWorkKind.Process },
  };
  assert.deepEqual(assessTemporalHostCapability(program([host, timer])), concurrentWaitRefusal);
});

test("SCPH-HOST-01: a splitting exit beside a timer wait is a token split", () => {
  const exit: SemanticOperation = {
    id: "operation:SubProcess", origin: origin("SubProcess"), kind: SemanticOperationKind.ScopeExit,
    scopeId: "scope:SubProcess", outputs: [{ place: "place:Flow_A" }, { place: "place:Flow_B" }],
  };
  assert.deepEqual(assessTemporalHostCapability(program([exit, timer])), concurrentWaitRefusal);
});
