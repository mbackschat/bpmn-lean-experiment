import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { requireBpmnWorkflowContinuationStateV1 } from "@bpmn-lean/temporal-protocol";

/**
 * What the Workflow chain accepts as a resumable committed checkpoint.
 *
 * The chain reconstructs semantic state across Worker replacement and across a Run boundary, so a
 * state that crosses one is the only place a corrupted or injected state can enter the semantic
 * account without passing a transition. This guard is therefore the boundary that owns the
 * instance-identity expectation: the command path has no third party to compare against, while here
 * the Workflow knows which instance it is.
 *
 * Only one malformed class here is new at this boundary, and that is a finding rather than an
 * omission. The pre-existing resumability checks already refuse an orphaned wait owner and a
 * duplicate wait key, so neither is an admissible witness for the runtime-state invariant here; the
 * invariant's structural half is still applied as defence in depth, but this boundary is not an
 * evidence lane for it and no witness claims otherwise. Recovered logical time against live
 * deadlines is the fact nothing here previously decided.
 */

const instanceId = "Instance_Continuation";
const scopeId = "Scope_Process_Continuation";

const program = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "profile-continuation",
    sourceId: "source-continuation",
    sourceSha256: "c".repeat(64),
    sourceOverlay: null,
  },
  processId: "Process_Continuation",
  definitionScopes: [{
    id: scopeId,
    parentScopeId: null,
    originElementId: "Process_Continuation",
  }],
  operationScopes: [
    { operationId: "Operation_Start", scopeId },
    { operationId: "Operation_Timer", scopeId },
    { operationId: "Operation_End", scopeId },
  ],
  controlPlaceScopes: [
    { controlPlaceId: "Place_Flow_Armed", scopeId },
    { controlPlaceId: "Place_Flow_Fired", scopeId },
  ],
  controlPlaces: [
    { id: "Place_Flow_Armed", origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_Armed" } },
    { id: "Place_Flow_Fired", origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_Fired" } },
  ],
  operations: [
    {
      id: "Operation_Start",
      kind: SemanticOperationKind.Initiate,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "StartEvent_1" },
      output: "Place_Flow_Armed",
    },
    {
      id: "Operation_Timer",
      kind: SemanticOperationKind.AwaitTimer,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "TimerCatch_1" },
      input: "Place_Flow_Armed",
      output: "Place_Flow_Fired",
      timer: { elementId: "TimerCatch_1", durationMs: 1000 },
    },
    {
      id: "Operation_End",
      kind: SemanticOperationKind.ReachNoneEnd,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "EndEvent_1" },
      input: "Place_Flow_Fired",
    },
  ],
} as const satisfies SemanticProcessProgram;

const owner = {
  processInstanceId: instanceId,
  definitionScopeId: scopeId,
  activation: 1,
} as const;

const timerWait = {
  id: { processInstanceId: instanceId, elementId: "TimerCatch_1", activation: 1 },
  owner,
  deadlineMs: 1000,
  output: "Place_Flow_Fired",
} as const;

const resumable = {
  control: { kind: ControlStateKind.Running, instanceId },
  initiationPending: false,
  scopeOccurrences: [{ id: owner, parent: null }],
  controlTokens: [],
  userTaskWaits: [],
  messageWaits: [],
  timerWaits: [timerWait],
  effectWaits: [],
  effectIncidents: [],
  selectedBranchSets: [],
  eventRaces: [],
  calledProcessOccurrences: [],
  variables: { process: { bindings: [] }, activities: [] },
  taskActivations: [],
  messageActivations: [],
  timerActivations: [{ elementId: "TimerCatch_1", count: 1 }],
  eventRaceActivations: [],
  callActivations: [],
  effectActivations: [],
  scopeActivations: [{ elementId: scopeId, count: 1 }],
  endOccurrences: 0,
  logicalTimeMs: 0,
} as const satisfies RuntimeState;

test("a resumable checkpoint is accepted unchanged", () => {
  assert.deepEqual(
    requireBpmnWorkflowContinuationStateV1(resumable, program, instanceId),
    resumable,
  );
});

test("a continuation whose live deadline precedes its recovered time is refused", () => {
  // Recovering below a live deadline would let the next firing lower logical time, which is the
  // one monotonicity fact the state conjuncts cannot supply. The chain boundary is where it is
  // discharged, because this is where a state re-enters the account without a transition.
  const rewound = { ...resumable, logicalTimeMs: 2000 };

  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(rewound, program, instanceId),
    /RuntimeState is not one representable committed state/u,
  );
});

test("a continuation for a different instance is still refused", () => {
  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(resumable, program, "Instance_Other"),
    /Malformed committed RuntimeState continuation/u,
  );
});
