import assert from "node:assert/strict";
import { test } from "node:test";
import * as semanticCore from "@bpmn-lean/semantic-core";

import {
  CommandOutcome,
  ControlStateKind,
  MessageChannelKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  SemanticOriginKind,
  StimulusKind,
  applyInternalOperationStep,
  applyStimulus,
  initialState,
  isWellFormedRuntimeState,
  isWellFormedSemanticProcessProgram,
  projectFlowNodeOccurrenceLifecycleDelta,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  callActivityProgram,
  callActivityStart,
  expectedCalledInstanceId,
  instanceId as callerInstanceId,
} from "./call-activity-fixture.ts";
import {
  boundedProgram,
  owner as boundedOwner,
} from "./bounded-task-fixture.ts";
import {
  incidentProgram,
  startFor,
} from "./flow-node-occurrence-lifecycle-fixture.ts";
import {
  InternalTransitionPublicationAtomKind,
  deriveInternalTransitionFootprint,
} from "./internal-commutation-fixture.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

test("keeps commutation machinery outside the package root", () => {
  assert.equal("compareActivityVariableScopes" in semanticCore, false);
  assert.equal("deriveInternalTransitionFootprint" in semanticCore, false);
  assert.equal("internalOperationPairIsIndependent" in semanticCore, false);
  assert.equal("closeSupportedInternalOperations" in semanticCore, false);
});

test("called Message arming uses the selected owner's semantic instance", () => {
  const messageOperation: SemanticOperation = {
    id: "operation:Task_Called",
    kind: SemanticOperationKind.AwaitMessage,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: "Task_Called",
    },
    input: "place:Called_Start",
    output: "place:Called_End",
    message: {
      elementId: "Task_Called",
      channel: {
        kind: MessageChannelKind.DirectMessage,
        messageId: "Message_Called",
      },
    },
  };
  const messageProgram: SemanticProcessProgram = {
    ...callActivityProgram,
    operations: callActivityProgram.operations.map((operation) =>
      operation.id === messageOperation.id ? messageOperation : operation
    ),
  };
  const before = applyStimulus(
    callActivityProgram,
    initialState,
    callActivityStart(),
    2,
  );
  assert.equal(before.outcome, CommandOutcome.Committed);
  assert.equal(before.internalStepBoundExceeded, true);
  const step = applyInternalOperationStep(
    messageProgram,
    messageOperation,
    before.state,
  );
  assert.ok(step !== null && step.owner !== null);
  const footprint = deriveInternalTransitionFootprint(
    messageProgram,
    before.state,
    step,
  );
  assert.ok(footprint !== null);
  const footprintLifecycle = footprint.publications.find(({ kind }) =>
    kind === InternalTransitionPublicationAtomKind.FlowNodeLifecycle
  );
  assert.ok(
    footprintLifecycle?.kind ===
      InternalTransitionPublicationAtomKind.FlowNodeLifecycle,
  );
  const actualLifecycle = projectFlowNodeOccurrenceLifecycleDelta(
    messageProgram,
    before.state,
    step.successor,
    {
      kind: "internal",
      operation: step.operation,
      owner: step.owner,
    },
    "called-message-owner",
    0,
  );
  assert.ok(actualLifecycle !== null);
  const actualStart = actualLifecycle.started[0];
  assert.ok(
    actualStart?.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait,
  );

  assert.deepEqual({
    runtimeInstanceId: before.state.control.kind === ControlStateKind.Running
      ? before.state.control.instanceId
      : null,
    ownerInstanceId: step.owner.processInstanceId,
    waitInstanceId: step.successor.messageWaits[0]?.id.processInstanceId,
    footprintInstanceId: footprint.publicationSortKey.processInstanceId,
    footprintLifecycleInstanceId:
      footprintLifecycle.occurrence.processInstanceId,
    actualLifecycleInstanceId:
      actualStart.anchor.id.processInstanceId,
  }, {
    runtimeInstanceId: callerInstanceId,
    ownerInstanceId: expectedCalledInstanceId,
    waitInstanceId: expectedCalledInstanceId,
    footprintInstanceId: expectedCalledInstanceId,
    footprintLifecycleInstanceId: expectedCalledInstanceId,
    actualLifecycleInstanceId: expectedCalledInstanceId,
  });
});

test("Program admission and the local footprint defense reject a composite declarer collision", () => {
  const ordinary = boundedProgram.operations.find((operation) =>
    operation.kind === SemanticOperationKind.AwaitUserTask &&
    operation.task.elementId === "NormalTask"
  );
  assert.ok(ordinary?.kind === SemanticOperationKind.AwaitUserTask);
  const collidingOrdinary: SemanticOperation = {
    ...ordinary,
    origin: { ...ordinary.origin, elementId: "BoundedTask" },
    task: { ...ordinary.task, elementId: "BoundedTask" },
  };
  const program: SemanticProcessProgram = {
    ...boundedProgram,
    operations: boundedProgram.operations.map((operation) =>
      operation.id === collidingOrdinary.id ? collidingOrdinary : operation
    ),
  };
  assert.equal(isWellFormedSemanticProcessProgram(program), false);
  const state = {
    ...initialState,
    control: {
      kind: ControlStateKind.Running,
      instanceId: boundedOwner.processInstanceId,
    },
    scopeOccurrences: [{ id: boundedOwner, parent: null }],
    controlTokens: [{
      placeId: collidingOrdinary.input,
      owner: boundedOwner,
      multiplicity: 1,
    }],
  } as const;
  const candidate = applyInternalOperationStep(program, collidingOrdinary, state);
  assert.ok(candidate !== null);

  assert.equal(
    deriveInternalTransitionFootprint(program, state, candidate),
    null,
  );
});

test("a pre-existing effect incident reserves its untagged wait anchor", () => {
  const processInstanceId = "IncidentAnchorCollision";
  const started = applyStimulus(
    incidentProgram,
    initialState,
    startFor(incidentProgram, processInstanceId),
  );
  assert.equal(started.outcome, CommandOutcome.Committed);
  const effectId = started.state.effectWaits[0]?.id;
  assert.ok(effectId !== undefined);
  const reported = applyStimulus(incidentProgram, started.state, {
    kind: StimulusKind.ReportEffectFailure,
    commandId: "report-anchor-collision",
    effectId,
    generation: 1,
  });
  assert.equal(reported.outcome, CommandOutcome.Committed);
  const owner = reported.state.scopeOccurrences[0]?.id;
  assert.ok(owner !== undefined);
  const ordinary: SemanticOperation = {
    id: "operation:WaitCandidate",
    kind: SemanticOperationKind.AwaitUserTask,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: effectId.elementId,
    },
    input: "place:Flow_ToEnd",
    output: "place:Flow_ToEnd",
    task: { elementId: effectId.elementId, name: "Anchor candidate" },
  };
  const program = rootScopedProgram({
    kind: incidentProgram.kind,
    identity: incidentProgram.identity,
    processId: incidentProgram.processId,
    controlPlaces: incidentProgram.controlPlaces,
    operations: [...incidentProgram.operations, ordinary],
  });
  const state = {
    ...reported.state,
    controlTokens: [{ placeId: ordinary.input, owner, multiplicity: 1 }],
  };
  assert.equal(isWellFormedRuntimeState(program, processInstanceId, state), true);
  const candidate = applyInternalOperationStep(program, ordinary, state);
  assert.ok(candidate !== null);

  assert.equal(
    deriveInternalTransitionFootprint(program, state, candidate),
    null,
  );
});
