import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProfileId,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
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
 * omission. Measured against this fixture, both an orphaned wait owner and a duplicate wait key are
 * already refused with `RuntimeState is not one resumable stable checkpoint`. That refusal is the
 * combined condition, not `isStableStateResumable` alone: its association checks are vacuous here
 * because the fixture holds no event race, call record, or incident, and it is the projection
 * conditions in the same test that reject both. Neither is therefore an admissible witness for the
 * invariant here, so the invariant's structural half is applied as defence in depth and this
 * boundary is not an evidence lane for it. Recovered logical time against live deadlines is the one
 * fact nothing here previously decided.
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
    { operationId: "Operation_UserTask", scopeId },
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
      id: "Operation_UserTask",
      kind: SemanticOperationKind.AwaitUserTask,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "UserTask_1" },
      input: "Place_Flow_Armed",
      output: "Place_Flow_Fired",
      task: { elementId: "UserTask_1", name: "Approve" },
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

const userTaskWait = {
  id: { processInstanceId: instanceId, elementId: "UserTask_1", activation: 1 },
  owner,
  name: "Approve",
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
  activityOccurrences: [],
  variables: { process: { bindings: [] }, activities: [] },
  taskActivations: [],
  messageActivations: [],
  timerActivations: [{ elementId: "TimerCatch_1", count: 1 }],
  eventRaceActivations: [],
  callActivations: [],
  effectActivations: [],
  scopeActivations: [{ elementId: scopeId, count: 1 }],
  activityActivations: [],
  endOccurrences: 0,
  logicalTimeMs: 0,
} as const satisfies RuntimeState;

test("a resumable checkpoint is accepted unchanged", () => {
  assert.deepEqual(
    requireBpmnWorkflowContinuationStateV1(resumable, program, instanceId),
    resumable,
  );
});

test("an old-profile continuation refuses a sequential Multi-Instance controller property", () => {
  const beforeEntry = { ...resumable, sequentialMultiInstanceControllers: [] };

  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(beforeEntry, program, instanceId),
    /RuntimeState is not one representable committed state/u,
  );
});

test("the sequential Multi-Instance profile accepts its required controller collection", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../bpmn-source/test/fixtures/sequential-multi-instance-user-task.bpmn",
      import.meta.url,
    )),
    sourceId: "sequential-multi-instance-continuation-state",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: SemanticProfileId.SequentialMultiInstanceUserTask,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("Sequential Multi-Instance continuation fixture was rejected");
  }
  const sequentialOperation = compilation.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  assert.ok(
    sequentialOperation?.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  const sequentialInstanceId = "Instance_SequentialMultiInstanceContinuation";
  const started = applyStimulus(
    compilation.semanticProcess,
    { ...initialState, sequentialMultiInstanceControllers: [] },
    {
      kind: StimulusKind.StartProcess,
      commandId: "start-sequential-multi-instance-continuation",
      processId: compilation.semanticProcess.processId,
      instanceId: sequentialInstanceId,
      initialVariables: [{
        name: sequentialOperation.data.input.dataObjectReferenceId,
        value: { kind: VariableValueKind.StringList, value: ["contract"] },
      }],
    },
  );
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.equal(started.state.sequentialMultiInstanceControllers?.length, 1);
  assert.deepEqual(
    requireBpmnWorkflowContinuationStateV1(
      started.state,
      compilation.semanticProcess,
      sequentialInstanceId,
    ),
    started.state,
  );

  const {
    sequentialMultiInstanceControllers: _controllers,
    ...missingControllers
  } = started.state;
  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(
      missingControllers,
      compilation.semanticProcess,
      sequentialInstanceId,
    ),
    /RuntimeState is not one resumable stable checkpoint/u,
  );
});

test("a malformed sequential Multi-Instance controller is refused before recovery", () => {
  const forged = {
    ...resumable,
    sequentialMultiInstanceControllers: [{
      id: {
        processInstanceId: instanceId,
        elementId: "UserTask_1",
        activation: 1,
      },
      snapshot: ["one"],
      outputSlots: [],
    }],
  };

  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(forged, program, instanceId),
    /Malformed committed RuntimeState continuation/u,
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

test("a carried User Task identity above its absent counter is refused", () => {
  const control = {
    ...resumable,
    userTaskWaits: [userTaskWait],
    timerWaits: [],
    taskActivations: [{ elementId: "UserTask_1", count: 1 }],
    timerActivations: [],
  } as const satisfies RuntimeState;
  assert.deepEqual(
    requireBpmnWorkflowContinuationStateV1(control, program, instanceId),
    control,
  );

  const withoutIssuedCounter = { ...control, taskActivations: [] };
  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(withoutIssuedCounter, program, instanceId),
    /RuntimeState is not one representable committed state/u,
  );
});

test("a continuation for a different instance is still refused", () => {
  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(resumable, program, "Instance_Other"),
    /Malformed committed RuntimeState continuation/u,
  );
});
