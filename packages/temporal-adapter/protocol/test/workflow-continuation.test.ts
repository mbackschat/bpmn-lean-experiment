import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlStateKind,
  EffectOperation,
  EffectProtocol,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  admitProcessStart,
  applyInternalOperation,
  compareCanonicalStrings,
  initialState,
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  requireBpmnWorkflowContinuationStateV1,
} from "../dist/index.js";

const processId = "Process_CompensationContinuation";
const instanceId = "Instance_CompensationContinuation";
const rootScopeId = `scope:${processId}`;

test("decodes only the paired declaration-owned compensation collections", () => {
  const program = declaringProgram();
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const started = admitProcessStart(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start-compensation-continuation",
    processId,
    instanceId,
    initialVariables: [],
  });
  assert.ok(started !== null);
  const initiated = applyInternalOperation(
    program,
    requiredOperation(program, "operation:Start"),
    started,
  );
  assert.ok(initiated !== null);
  const state = applyInternalOperation(
    program,
    requiredOperation(program, "operation:Task"),
    initiated,
  );
  assert.ok(state !== null);
  assert.ok(state.compensationTriggers !== undefined);
  assert.ok(state.compensationHandlerEffectWaits !== undefined);
  assert.deepEqual(
    requireBpmnWorkflowContinuationStateV1(state, program, instanceId),
    state,
  );

  const {
    compensationTriggers: _triggers,
    ...missingTriggers
  } = state;
  void _triggers;
  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(
      missingTriggers as RuntimeState,
      program,
      instanceId,
    ),
    /Malformed committed RuntimeState continuation|representable committed state/u,
  );

  const {
    compensationHandlerEffectWaits: _waits,
    ...missingWaits
  } = state;
  void _waits;
  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(
      missingWaits as RuntimeState,
      program,
      instanceId,
    ),
    /Malformed committed RuntimeState continuation|representable committed state/u,
  );

  const {
    compensationExecution: _declaration,
    ...undeclaredProgram
  } = program;
  void _declaration;
  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(
      state,
      undeclaredProgram,
      instanceId,
    ),
    /representable committed state/u,
  );

  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1(
      {
        ...state,
        control: {
          kind: ControlStateKind.Failed,
          instanceId,
          failure: compensationFailure(),
        },
      },
      program,
      instanceId,
    ),
    /Malformed committed RuntimeState continuation/u,
  );
});

test("round-trips all four compensation collections with deferred restored context", () => {
  const baseProgram = declaringProgram();
  const program = {
    ...baseProgram,
    definitionScopes: [
      ...baseProgram.definitionScopes,
      {
        id: "scope:B",
        parentScopeId: rootScopeId,
        originElementId: "B",
      },
      {
        id: "scope:Undo_B",
        parentScopeId: "scope:B",
        originElementId: "Undo_B",
      },
    ].sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    compensationActivityRetention: {
      definitionScopeId: rootScopeId,
      targets: [{
        activityElementId: "Task",
        boundaryEventElementId: "Boundary_Task",
        compensationActivityElementId: "Undo_Task",
      }],
      limits: { maxRecords: 2, maxCanonicalBytes: 4_096 },
    },
    compensationEventSubProcessSnapshots: {
      targets: [{ parentScopeId: "scope:B", handlerScopeId: "scope:Undo_B" }],
      limits: { maxRecords: 2, maxCanonicalBytes: 4_096 },
    },
    compensationExecution: {
      ...baseProgram.compensationExecution,
      subjects: [{
        kind: "eventSubProcess",
        parentScopeId: "scope:B",
        handlerScopeId: "scope:Undo_B",
        body: {
          kind: "singleEffect",
          handlerElementId: "Undo_B",
          effectElementId: "Effect_Undo_B",
          descriptor: {
            protocol: EffectProtocol.Activity,
            operation: EffectOperation.CompensationSingleEffect,
          },
          input: {
            kind: "restoredProcessBinding",
            sourceName: "completionContext",
            argumentName: "archivedContext",
          },
        },
      }, {
        kind: "boundaryActivity",
        subjectElementId: "Task",
        body: {
          kind: "singleEffect",
          handlerElementId: "Undo_Task",
          effectElementId: "Undo_Task",
          descriptor: {
            protocol: EffectProtocol.Activity,
            operation: EffectOperation.CompensationSingleEffect,
          },
          input: { kind: "empty" },
        },
      }],
    },
  } as const satisfies SemanticProcessProgram;
  const started = admitProcessStart(baseProgram, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start-populated-compensation-continuation",
    processId,
    instanceId,
    initialVariables: [],
  });
  assert.ok(started !== null);
  const initiated = applyInternalOperation(
    baseProgram,
    requiredOperation(baseProgram, "operation:Start"),
    started,
  );
  assert.ok(initiated !== null);
  const waiting = applyInternalOperation(
    baseProgram,
    requiredOperation(baseProgram, "operation:Task"),
    initiated,
  );
  assert.ok(waiting !== null);
  const owner = waiting.scopeOccurrences.find(({ parent }) => parent === null)?.id;
  assert.ok(owner !== undefined);
  const parent = {
    processInstanceId: instanceId,
    definitionScopeId: "scope:B",
    activation: 1,
  } as const;
  const state = {
    ...waiting,
    compensationActivityRetentions: [{
      owner,
      nextCompletionOrdinal: 1,
      records: [],
    }],
    compensationParentContextRetentions: [],
    compensationTriggers: [{
      id: {
        processInstanceId: instanceId,
        elementId: "operation:Trigger",
        activation: 1,
      },
      owner,
      output: "place:Trigger_To_End",
      lifecycle: "active",
      handlers: [{
        id: {
          processInstanceId: instanceId,
          elementId: "Undo_B",
          activation: 1,
        },
        subject: { kind: "eventSubProcess", parent },
        handlerElementId: "Undo_B",
        lifecycle: "pending",
        restoredContext: {
          frames: [{
            owner,
            bindings: [{
              name: "completionContext",
              value: { kind: VariableValueKind.String, value: "frozen" },
            }],
          }, { owner: parent, bindings: [] }],
        },
      }],
      dependencies: [],
    }],
    compensationHandlerEffectWaits: [],
  } as const satisfies RuntimeState;

  assert.deepEqual(
    requireBpmnWorkflowContinuationStateV1(state, program, instanceId),
    state,
  );
  const trigger = state.compensationTriggers[0];
  const handler = trigger?.handlers[0];
  assert.ok(trigger !== undefined && handler?.lifecycle === "pending");
  const { restoredContext: _restoredContext, ...handlerWithoutContext } = handler;
  void _restoredContext;
  assert.throws(
    () => requireBpmnWorkflowContinuationStateV1({
      ...state,
      compensationTriggers: [{
        ...trigger,
        handlers: [handlerWithoutContext],
      }],
    }, program, instanceId),
    /Malformed committed RuntimeState continuation/u,
  );
  for (const collection of [
    "compensationActivityRetentions",
    "compensationParentContextRetentions",
    "compensationTriggers",
    "compensationHandlerEffectWaits",
  ] as const) {
    const withoutCollection = { ...state } as Record<string, unknown>;
    delete withoutCollection[collection];
    assert.throws(
      () => requireBpmnWorkflowContinuationStateV1(
        withoutCollection,
        program,
        instanceId,
      ),
      /Malformed committed RuntimeState continuation|representable committed state/u,
    );
  }
});

function requiredOperation(
  program: SemanticProcessProgram,
  operationId: string,
): SemanticOperation {
  const operation = program.operations.find(({ id }) => id === operationId);
  assert.ok(operation !== undefined);
  return operation;
}

function declaringProgram(): SemanticProcessProgram & {
  readonly compensationExecution: NonNullable<SemanticProcessProgram["compensationExecution"]>;
} {
  const controlPlaces = ["Start_To_Task", "Task_To_Trigger", "Trigger_To_End"].map(
    (elementId) => ({
      id: `place:${elementId}`,
      origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId },
    }),
  );
  const operations = ([{
    id: "operation:Start",
    kind: SemanticOperationKind.Initiate,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Start" },
    output: "place:Start_To_Task",
  }, {
    id: "operation:Task",
    kind: SemanticOperationKind.AwaitUserTask,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Task" },
    input: "place:Start_To_Task",
    output: "place:Task_To_Trigger",
    task: { elementId: "Task", name: null },
  }, {
    id: "operation:Trigger",
    kind: SemanticOperationKind.TriggerCompensation,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Trigger" },
    definitionScopeId: rootScopeId,
    input: "place:Task_To_Trigger",
    output: "place:Trigger_To_End",
  }, {
    id: "operation:End",
    kind: SemanticOperationKind.ReachNoneEnd,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "End" },
    input: "place:Trigger_To_End",
  }, {
    id: `operation:complete-scope:${rootScopeId}`,
    kind: SemanticOperationKind.CompleteScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: processId },
    scopeId: rootScopeId,
    parentOutput: null,
  }] satisfies SemanticOperation[]).sort((left, right) =>
    compareCanonicalStrings(left.id, right.id)
  );
  return {
    kind: SemanticProcessKind.SemanticProcess,
    internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "bpmn-2.0.2-subprocess-boundary-timer-draft",
      sourceId: "compensation-continuation-contract",
      sourceSha256: "a".repeat(64),
      sourceOverlay: null,
    },
    processId,
    definitionScopes: [{
      id: rootScopeId,
      parentScopeId: null,
      originElementId: processId,
    }],
    operationScopes: operations.map(({ id: operationId }) => ({
      operationId,
      scopeId: rootScopeId,
    })),
    controlPlaceScopes: controlPlaces.map(({ id: controlPlaceId }) => ({
      controlPlaceId,
      scopeId: rootScopeId,
    })),
    controlPlaces,
    operations,
    compensationExecution: {
      definitionScopeId: rootScopeId,
      triggerOperationId: "operation:Trigger",
      subjects: [],
      dependencies: [],
      limits: {
        maxTriggers: 2,
        maxHandlers: 2,
        maxCanonicalBytes: 4_096,
      },
    },
  };
}

function compensationFailure() {
  const handlerId = {
    processInstanceId: instanceId,
    elementId: "Undo_Task",
    activation: 1,
  } as const;
  return {
    kind: "compensationHandlerFailure",
    triggerId: {
      processInstanceId: instanceId,
      elementId: "operation:Trigger",
      activation: 1,
    },
    handlerId,
    effectId: handlerId,
    code: "compensation-rejected",
    message: null,
  } as const;
}
