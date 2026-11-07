/**
 * ACSP-HOST-01's hosting classification (the split proposal's wrong algorithm 10): Temporal host admission reads an
 * Activity host with two or more outputs both as a token split and as its work's host-driven wait, so a splitting effect
 * host falls to the concurrent analysis instead of passing as a serial wait. Each refusal is a one-fact change of the
 * admitted merging control, whose one output keeps it a serial host-driven wait.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ActivityWorkKind,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
} from "@bpmn-lean/semantic-core";
import type { ActivityWork, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import {
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  assessTemporalHostCapability,
} from "../dist/index.js";

const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId }) as const;

const effectWork: ActivityWork = {
  kind: ActivityWorkKind.Effect,
  effect: { elementId: "Task_Register", descriptor: { protocol: "activity", operation: "register" }, inputMappings: [],
    outputMappings: [] },
};

const host = (inputs: readonly string[], outputs: readonly string[]): SemanticOperation => ({
  id: "operation:Task_Register", origin: origin("Task_Register"), kind: SemanticOperationKind.Activity,
  inputs: [...inputs], outputs: outputs.map(place => ({ place })), work: effectWork,
});

const program = (operations: ReadonlyArray<SemanticOperation>): SemanticProcessProgram => ({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "activity-host-split-classification-test",
    sourceId: "activity-host-split-classification-test",
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

test("ACTH-HOST-01: a merging effect host with one output is a serial host-driven wait, so the host admits it", () => {
  assert.deepEqual(assessTemporalHostCapability(program([host(["place:Flow_A", "place:Flow_B"], ["place:Flow_Done"])])), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });
});

test("ACSP-HOST-01: a splitting effect host is a token split beside its own effect wait", () => {
  assert.deepEqual(assessTemporalHostCapability(program([host(["place:Flow_A"], ["place:Flow_B", "place:Flow_C"])])), {
    kind: TemporalHostCapabilityResultKind.Rejected,
    failure: {
      code: TemporalHostAdmissionFailureCode.ConcurrentHostDrivenWaits,
      evidence: "A token split can make a timer or effect wait concurrent with another semantic branch.",
    },
  });
});
