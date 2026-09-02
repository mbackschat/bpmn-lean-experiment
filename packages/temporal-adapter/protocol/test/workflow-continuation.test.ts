import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlStateKind,
  EffectExecutionResultKind,
  EffectOperation,
  EffectProtocol,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticTransitionKind,
  StimulusKind,
  VariableValueKind,
  admitProcessStart,
  applyInternalOperation,
  attachedHandlersForBodyAnchor,
  compareCanonicalStrings,
  initialState,
  isWellFormedSemanticProcessProgram,
  observeStableState,
  projectCurrentControlPositions,
  projectOpenFlowNodeOccurrences,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  programOccurrenceFactIsValid,
  programOccurrenceStartMatchesTransition,
} from "../dist/flow-node-occurrence-publication-program-validation.js";
import {
  requireBpmnWorkflowContinuationPublicationV1,
  requireBpmnWorkflowContinuationStateV1,
} from "../dist/index.js";
import type { CommittedTransitionRecord } from "../src/semantic-publication.js";

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
    /Malformed committed RuntimeState continuation|resumable stable checkpoint|representable committed state/u,
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
    /Malformed committed RuntimeState continuation|resumable stable checkpoint|representable committed state/u,
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
    /resumable stable checkpoint|representable committed state/u,
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
      /Malformed committed RuntimeState continuation|resumable stable checkpoint|representable committed state/u,
    );
  }

  const handlerId = trigger.id.elementId === "operation:Trigger"
    ? handler.id
    : assert.fail("unexpected trigger fixture");
  const effectId = {
    processInstanceId: instanceId,
    elementId: "Effect_Undo_B",
    activation: 1,
  } as const;
  const activeState = {
    ...state,
    effectActivations: [{ elementId: effectId.elementId, count: 1 }],
    compensationTriggers: [{
      ...trigger,
      handlers: [{ ...handler, lifecycle: "compensating", effectId }],
    }],
    compensationHandlerEffectWaits: [{
      id: effectId,
      triggerId: trigger.id,
      handlerId,
      descriptor: {
        protocol: EffectProtocol.Activity,
        operation: EffectOperation.CompensationSingleEffect,
      },
      arguments: [{
        name: "archivedContext",
        value: { kind: VariableValueKind.String, value: "frozen" },
      }],
    }],
  } as const satisfies RuntimeState;
  assert.deepEqual(
    requireBpmnWorkflowContinuationStateV1(activeState, program, instanceId),
    activeState,
  );
  const triggerOperation = requiredOperation(program, "operation:Trigger");
  assert.equal(triggerOperation.kind, SemanticOperationKind.TriggerCompensation);
  if (triggerOperation.kind !== SemanticOperationKind.TriggerCompensation) {
    assert.fail("fixture trigger operation changed kind");
  }
  const triggerTransition = {
    revision: 1,
    logicalTimeMs: 0,
    transition: {
      kind: SemanticTransitionKind.InternalOperation,
      operationId: triggerOperation.id,
      operationKind: triggerOperation.kind,
      origin: triggerOperation.origin,
      owner,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [],
      enteredScopes: [],
      exitedScopes: [],
    },
  } as const satisfies CommittedTransitionRecord;
  const occurrenceFact = (elementId: string) => ({ processId, elementId, owner });
  for (const elementId of ["Trigger", "Undo_B", "Effect_Undo_B"]) {
    assert.equal(programOccurrenceFactIsValid(occurrenceFact(elementId), program), true);
    assert.equal(programOccurrenceStartMatchesTransition(
      occurrenceFact(elementId),
      program,
      triggerTransition,
    ), true);
  }
  assert.equal(programOccurrenceStartMatchesTransition(
    occurrenceFact("not-a-compensation-element"),
    program,
    triggerTransition,
  ), false);
  const dependencyProgram = {
    ...program,
    compensationExecution: {
      ...program.compensationExecution,
      dependencies: [{
        predecessorElementId: "Task",
        successorElementId: "B",
        reason: "sequenceFlow",
      }],
    },
  } as const satisfies SemanticProcessProgram;
  const completionTransition = {
    revision: 2,
    logicalTimeMs: 0,
    transition: {
      kind: SemanticTransitionKind.ExternalStimulus,
      stimulus: {
        kind: StimulusKind.CompleteEffect,
        commandId: "complete-b-compensation",
        effectId,
        result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
      },
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [],
      enteredScopes: [],
      exitedScopes: [],
    },
  } as const satisfies CommittedTransitionRecord;
  assert.equal(programOccurrenceStartMatchesTransition(
    occurrenceFact("Undo_Task"),
    dependencyProgram,
    completionTransition,
  ), true);
  assert.equal(programOccurrenceStartMatchesTransition(
    occurrenceFact("Undo_B"),
    dependencyProgram,
    completionTransition,
  ), false);
  const projected = projectOpenFlowNodeOccurrences(program, activeState);
  const observation = observeStableState(program, activeState);
  const positions = projectCurrentControlPositions(program, activeState);
  assert.ok(projected !== null && observation !== null && positions !== null);
  const currentOpen = projected.map(({ processId: projectedProcessId, elementId, owner }, index) => ({
    id: { processInstanceId: instanceId, startRevision: 1, startIndex: index },
    processId: projectedProcessId,
    elementId,
    owner,
    startedAtEpochMs: 1_000,
  }));
  const publication = {
    execution: {
      definition: program.identity,
      processId,
      processInstanceId: instanceId,
      headRevision: 1,
      current: {
        revision: 1,
        state: observation,
        controlTokens: positions.controlTokens,
        scopes: positions.scopes,
      },
    },
    flowNodeOccurrences: {
      definition: program.identity,
      processId,
      processInstanceId: instanceId,
      headRevision: 1,
      currentOpen,
      retainedOpen: projected.map((entry, index) => ({
        anchor: entry.anchor,
        occurrence: currentOpen[index]!,
        attachedHandlers: attachedHandlersForBodyAnchor(activeState, entry.anchor),
      })),
      lastCommittedAtEpochMs: 1_000,
    },
    segmentDirectory: {
      format: "bpmn-lean.workflow-publication-segment-directory.v1",
      segments: [{
        format: "bpmn-lean.workflow-publication-segment.v1",
        runId: "run-1",
        runOrdinal: 1,
        fromRevision: 0,
        throughRevision: 1,
        sha256: "a".repeat(64),
      }],
    },
  } as const;
  assert.deepEqual(
    requireBpmnWorkflowContinuationPublicationV1(
      publication,
      program,
      activeState,
      instanceId,
      { firstExecutionRunId: "run-1", successorRunOrdinal: 2 },
    ),
    publication,
  );
  const retainedKinds = publication.flowNodeOccurrences.retainedOpen.map(
    ({ anchor }) => anchor.kind,
  );
  assert.ok(retainedKinds.includes("compensationTrigger"));
  assert.ok(retainedKinds.includes("compensationHandler"));

  const malformed = structuredClone(publication) as unknown as {
    flowNodeOccurrences: {
      retainedOpen: Array<{ anchor: Record<string, unknown> }>;
    };
  };
  const compensationHandler = malformed.flowNodeOccurrences.retainedOpen.find(
    (entry) => entry.anchor.kind === "compensationHandler",
  );
  assert.ok(compensationHandler !== undefined);
  compensationHandler.anchor.unexpected = true;
  assert.throws(
    () => requireBpmnWorkflowContinuationPublicationV1(
      malformed,
      program,
      activeState,
      instanceId,
      { firstExecutionRunId: "run-1", successorRunOrdinal: 2 },
    ),
    /Publication open occurrences do not match RuntimeState/u,
  );
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
