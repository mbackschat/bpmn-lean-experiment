import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  CorrelationScalarPathLanguage,
  InternalSchedulingMode,
  MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
  MessageChannelKind,
  ScenarioStepKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  compareCanonicalStrings,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitCorrelatedPayloadMessageOperation,
  ControlPlace,
  DeliverPayloadMessageStimulus,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationCandidateRegistrationPhase,
  ProcessCorrelationRegistrationPhase,
  ProcessCorrelationRegistrationResolutionKind,
  WorkflowChainBudgetKind,
  bpmnProcessCorrelationRegistrationContinuationV1,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowChainCapacityState,
  WorkflowCommandCapacityState,
  WorkflowCommandRecoveryLedger,
  ProcessCorrelationRegistrationCycleKind,
  buildWorkflowChainSuccessor,
  commandOutcome,
  createCommandPublicationState,
  createProcessCorrelationRegistrationStage,
  integrateCommandPublication,
  initializeWorkflowRunRetention,
  projectProcessCorrelationCandidateQuery,
  recordCommandPublicationOutcome,
  runProcessCorrelationRegistrationCycle,
  validateIncomingWorkflowContinuation,
} from "../dist/index.js";
import type {
  WorkflowChainRuntime,
} from "../dist/index.js";

const processId = "Process_SettlementCorrelation";
const processInstanceId = "ProcessInstance_Selected";
const processWorkflowId = "bpmn-process-sha256:selected";
const taskQueue = "configured-process-queue";
const channel = {
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_Settlement",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
} as const;
const firstSubscriptionId = {
  processInstanceId,
  elementId: "MessageCatch_InitialSettlement",
  activation: 1,
} as const;

test("stages the exact first correlated candidate without changing the committed pre-state", () => {
  const program = correlationProgram();
  const started = advanceScenario(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start-correlation",
    processId,
    instanceId: processInstanceId,
    initialVariables: [],
  });
  assert.equal(started.kind, ScenarioStepKind.Committed);
  const stimulus = initialPayload("initialize-correlation", "settlement-42");
  const step = advanceScenario(program, started.state, stimulus);
  assert.equal(step.kind, ScenarioStepKind.Committed);

  const stage = createProcessCorrelationRegistrationStage({
    program,
    committedState: started.state,
    stimulus,
    step,
    processWorkflowId,
    committedAtEpochMs: 1_723_456_789_000,
  });
  assert.notEqual(stage, null);
  assert.equal(stage?.phase, ProcessCorrelationRegistrationPhase.Prepare);
  assert.equal(stage?.registration.transactionId, stimulus.commandId);
  assert.equal(stage?.registration.processLocator.workflowId, processWorkflowId);
  assert.equal(stage?.committedAtEpochMs, 1_723_456_789_000);
  assert.strictEqual(stage?.preState, started.state);
  assert.strictEqual(stage?.step, step);

  assert.equal(
    projectProcessCorrelationCandidateQuery(
      program,
      started.state,
      stage!.registration.candidate.address,
      stage!.registration.candidate.subscriptionId,
    ),
    null,
  );
  assert.deepEqual(
    projectProcessCorrelationCandidateQuery(
      program,
      step.state,
      stage!.registration.candidate.address,
      stage!.registration.candidate.subscriptionId,
    ),
    stage?.registration.candidate,
  );
});

test("does not stage a semantic refusal or a direct payload wait that arms no correlated candidate", () => {
  const program = correlationProgram();
  const started = advanceScenario(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start-correlation",
    processId,
    instanceId: processInstanceId,
    initialVariables: [],
  });
  assert.equal(started.kind, ScenarioStepKind.Committed);
  const wrong = initialPayload("wrong-subscription", "settlement-42");
  const refused = advanceScenario(program, started.state, {
    ...wrong,
    subscriptionId: { ...wrong.subscriptionId, activation: 2 },
  });
  assert.equal(refused.kind, ScenarioStepKind.Terminal);
  assert.deepEqual(refused.outcome, {
    kind: "semantic",
    outcome: CommandOutcome.Rejected,
  });
  assert.equal(
    createProcessCorrelationRegistrationStage({
      program,
      committedState: started.state,
      stimulus: wrong,
      step: refused,
      processWorkflowId,
      committedAtEpochMs: 1,
    }),
    null,
  );
});

test("preserves one exact staged registration through patched continuation only", () => {
  const program = correlationProgram();
  const start = startStimulus();
  const started = advanceScenario(program, initialState, start);
  assert.equal(started.kind, ScenarioStepKind.Committed);
  const stimulus = initialPayload("initialize-correlation", "settlement-42");
  const step = advanceScenario(program, started.state, stimulus);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  const stage = createProcessCorrelationRegistrationStage({
    program,
    committedState: started.state,
    stimulus,
    step,
    processWorkflowId,
    committedAtEpochMs: 1_723_456_789_000,
  });
  assert.notEqual(stage, null);
  const startedPublication = integrateCommandPublication(
    program,
    createCommandPublicationState(program, processInstanceId),
    start,
    started,
    () => 1_700_000_000_000,
  );
  const publication = recordCommandPublicationOutcome(
    startedPublication,
    start,
    started.observations,
  );
  const runtime = continuationRuntime();

  const successor = buildWorkflowChainSuccessor(
    runtime,
    start,
    program,
    started.state,
    publication,
    [],
    stage,
    true,
  );
  assert.equal(successor.length, 7);
  assert.deepEqual(successor[6], {
    protocol: bpmnProcessCorrelationRegistrationContinuationV1,
    registration: stage,
  });
  const restored = validateIncomingWorkflowContinuation(
    successor[0],
    successor[1],
    successor[2],
    successor[3],
    successor[4],
    successor[5],
    runtime.firstExecutionRunId,
    successor[6],
    true,
  );
  assert.deepEqual(restored.correlation, successor[6]);
  assert.throws(
    () => validateIncomingWorkflowContinuation(
      successor[0],
      successor[1],
      {
        ...successor[2],
        completedMessageDeliveryRecords: [{
          kind: "semantic",
          stimulus,
          outcome: CommandOutcome.Committed,
        }],
      },
      successor[3],
      successor[4],
      successor[5],
      runtime.firstExecutionRunId,
      successor[6],
      true,
    ),
    (error: unknown) =>
      error instanceof Error &&
      "type" in error &&
      error.type === "BpmnWorkflowContinuationInvalid",
  );
  assert.throws(
    () => validateIncomingWorkflowContinuation(
      successor[0],
      successor[1],
      successor[2],
      successor[3],
      successor[4],
      successor[5],
      runtime.firstExecutionRunId,
      successor[6],
      false,
    ),
    (error: unknown) =>
      error instanceof Error &&
      "type" in error &&
      error.type === "BpmnWorkflowContinuationInvalid",
  );

  const finalizingStage = {
    ...stage!,
    phase: ProcessCorrelationRegistrationPhase.Finalize,
  } as const;
  const stagedPublication = integrateCommandPublication(
    program,
    publication,
    stimulus,
    step,
    () => stage!.committedAtEpochMs,
  );
  const finalizingSuccessor = buildWorkflowChainSuccessor(
    runtime,
    start,
    program,
    step.state,
    stagedPublication,
    [],
    finalizingStage,
    true,
  );
  assert.equal(finalizingSuccessor.length, 7);
  assert.deepEqual(finalizingSuccessor[6]?.registration, finalizingStage);
  assert.doesNotThrow(() => validateIncomingWorkflowContinuation(
    finalizingSuccessor[0],
    finalizingSuccessor[1],
    finalizingSuccessor[2],
    finalizingSuccessor[3],
    finalizingSuccessor[4],
    finalizingSuccessor[5],
    runtime.firstExecutionRunId,
    finalizingSuccessor[6],
    true,
  ));
});

test("installs the staged successor only after prepare and publishes its outcome only after finalize", async () => {
  const fixture = correlationRegistrationFixture();
  const retained = initializeWorkflowRunRetention(
    fixture.started.observations,
    fixture.publication,
  );
  const prepared = await runProcessCorrelationRegistrationCycle({
    program: fixture.program,
    stage: fixture.stage,
    publication: fixture.publication,
    traceEntries: fixture.started.observations.length,
    retention: retained,
    taskQueue,
    resolve: async (request) => {
      assert.equal(request.taskQueue, taskQueue);
      return {
        kind: ProcessCorrelationRegistrationResolutionKind.Prepared,
        transactionId: request.registration.transactionId,
        phase: CorrelationCandidateRegistrationPhase.Pending,
      };
    },
    retryDelay: async () => assert.fail("prepare did not require a retry"),
  });
  assert.equal(
    prepared.kind,
    ProcessCorrelationRegistrationCycleKind.CommitSuccessor,
  );
  if (prepared.kind !== ProcessCorrelationRegistrationCycleKind.CommitSuccessor) {
    assert.fail("prepare did not return the staged successor");
  }
  assert.equal(prepared.stage.phase, ProcessCorrelationRegistrationPhase.Finalize);
  assert.equal(
    commandOutcome(prepared.publication, fixture.stimulus.commandId),
    undefined,
  );

  const finalized = await runProcessCorrelationRegistrationCycle({
    program: fixture.program,
    stage: prepared.stage,
    publication: prepared.publication,
    traceEntries:
      fixture.started.observations.length + prepared.observations.length,
    retention: prepared.retention,
    taskQueue,
    resolve: async (request) => ({
      kind: ProcessCorrelationRegistrationResolutionKind.Finalized,
      transactionId: request.registration.transactionId,
      phase: CorrelationCandidateRegistrationPhase.Active,
    }),
    retryDelay: async () => assert.fail("finalize did not require a retry"),
  });
  assert.equal(
    finalized.kind,
    ProcessCorrelationRegistrationCycleKind.CompleteOpening,
  );
  if (finalized.kind !== ProcessCorrelationRegistrationCycleKind.CompleteOpening) {
    assert.fail("finalize did not complete the opening command");
  }
  assert.equal(finalized.outcome, CommandOutcome.Committed);
  assert.equal(
    commandOutcome(finalized.publication, fixture.stimulus.commandId),
    CommandOutcome.Committed,
  );
});

test("retains the exact pre-commit stage when a scan defers prepare", async () => {
  const fixture = correlationRegistrationFixture();
  const before = structuredClone(fixture.stage);
  let retryCount = 0;
  const cycle = await runProcessCorrelationRegistrationCycle({
    program: fixture.program,
    stage: fixture.stage,
    publication: fixture.publication,
    traceEntries: fixture.started.observations.length,
    retention: initializeWorkflowRunRetention(
      fixture.started.observations,
      fixture.publication,
    ),
    taskQueue,
    resolve: async (request) => ({
      kind: ProcessCorrelationRegistrationResolutionKind.DeferredByScan,
      transactionId: request.registration.transactionId,
      scanId: "scan-held",
    }),
    retryDelay: async () => {
      retryCount += 1;
    },
  });
  assert.deepEqual(cycle, {
    kind: ProcessCorrelationRegistrationCycleKind.Retry,
  });
  assert.equal(retryCount, 1);
  assert.deepEqual(fixture.stage, before);
});

function startStimulus() {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-correlation",
    processId,
    instanceId: processInstanceId,
    initialVariables: [],
  } as const;
}

function correlationRegistrationFixture() {
  const program = correlationProgram();
  const start = startStimulus();
  const started = advanceScenario(program, initialState, start);
  assert.equal(started.kind, ScenarioStepKind.Committed);
  const stimulus = initialPayload("initialize-correlation", "settlement-42");
  const step = advanceScenario(program, started.state, stimulus);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  const stage = createProcessCorrelationRegistrationStage({
    program,
    committedState: started.state,
    stimulus,
    step,
    processWorkflowId,
    committedAtEpochMs: 1_723_456_789_000,
  });
  assert.notEqual(stage, null);
  const publication = recordCommandPublicationOutcome(
    integrateCommandPublication(
      program,
      createCommandPublicationState(program, processInstanceId),
      start,
      started,
      () => 1_700_000_000_000,
    ),
    start,
    started.observations,
  );
  return { program, started, stimulus, step, stage: stage!, publication };
}

function continuationRuntime(): WorkflowChainRuntime {
  return {
    eventHistoryEventLimit: 4,
    eventHistoryByteLimit: workflowChainProductionLimit(
      WorkflowChainBudgetKind.EventHistoryBytes,
    ),
    runId: "correlation-run-1",
    runOrdinal: 1,
    firstExecutionRunId: "correlation-run-1",
    segmentDirectory: {
      format: "bpmn-lean.workflow-publication-segment-directory.v1",
      segments: [],
    },
    recovery: new WorkflowCommandRecoveryLedger(),
    capacity: new WorkflowChainCapacityState({
      processInstanceId,
      runOrdinal: 1,
    }),
    commandCapacity: new WorkflowCommandCapacityState(),
  };
}

function initialPayload(
  commandId: string,
  value: string,
): DeliverPayloadMessageStimulus {
  return {
    kind: StimulusKind.DeliverPayloadMessage,
    commandId,
    subscriptionId: firstSubscriptionId,
    channel,
    payload: { kind: VariableValueKind.String, value },
  };
}

function correlationProgram(): SemanticProcessProgram {
  const correlated: AwaitCorrelatedPayloadMessageOperation = {
    ...operationBase("MessageCatch_CorrelatedSettlement"),
    kind: SemanticOperationKind.AwaitCorrelatedPayloadMessage,
    input: "place:Flow_Initial_Correlated",
    output: "place:Flow_Correlated_Review",
    message: {
      elementId: "MessageCatch_CorrelatedSettlement",
      channel,
    },
    correlationKeyId: "CorrelationKey_SettlementReference",
    correlationPropertyId: "CorrelationProperty_SettlementReference",
    payloadSelector: {
      language: CorrelationScalarPathLanguage,
      body: "payload",
    },
    processPropertySelector: {
      language: CorrelationScalarPathLanguage,
      body: "property:Property_SettlementReference",
      propertyId: "Property_SettlementReference",
    },
  };
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
      sourceId: "settlement-correlation",
      sourceSha256: "a".repeat(64),
      sourceOverlay: null,
    },
    processId,
    controlPlaces: [
      controlPlace("Flow_Correlated_Review"),
      controlPlace("Flow_Initial_Correlated"),
      controlPlace("Flow_Review_End"),
      controlPlace("Flow_Start_Initial"),
    ],
    operations: [
      {
        ...operationBase("Start_SettlementCorrelation"),
        kind: SemanticOperationKind.Initiate,
        output: "place:Flow_Start_Initial",
      },
      {
        ...operationBase("MessageCatch_InitialSettlement"),
        kind: SemanticOperationKind.AwaitPayloadMessage,
        input: "place:Flow_Start_Initial",
        output: "place:Flow_Initial_Correlated",
        message: {
          elementId: "MessageCatch_InitialSettlement",
          channel,
        },
        directOutput: {
          associationId: "DataOutputAssociation_SettlementReference",
          sourceDataOutputId: "DataOutput_SettlementReference",
          sourceDataOutputName: "Settlement reference",
          targetPropertyId: "Property_SettlementReference",
        },
      },
      correlated,
      {
        ...operationBase("UserTask_ReviewSettlement"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_Correlated_Review",
        output: "place:Flow_Review_End",
        task: {
          elementId: "UserTask_ReviewSettlement",
          name: "Review settlement",
        },
      },
      {
        ...operationBase("End_SettlementReviewed"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_Review_End",
      },
    ],
  });
}

function controlPlace(elementId: string): ControlPlace {
  return {
    id: `place:${elementId}`,
    origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId },
  };
}

function operationBase(elementId: string) {
  return {
    id: `operation:${elementId}`,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId },
  } as const;
}

function rootScopedProgram(
  input: Omit<
    SemanticProcessProgram,
    | "definitionScopes"
    | "operationScopes"
    | "controlPlaceScopes"
    | "internalSchedulingMode"
    | "operations"
  > & Readonly<{ operations: ReadonlyArray<SemanticOperation> }>,
): SemanticProcessProgram {
  const scopeId = `scope:${input.processId}`;
  const completion: SemanticOperation = {
    id: `operation:complete-scope:${scopeId}`,
    kind: SemanticOperationKind.CompleteScope,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: input.processId,
    },
    scopeId,
    parentOutput: null,
  };
  const operations = [...input.operations, completion].sort((left, right) =>
    compareCanonicalStrings(left.id, right.id)
  );
  return {
    ...input,
    internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
    definitionScopes: [{
      id: scopeId,
      parentScopeId: null,
      originElementId: input.processId,
    }],
    operationScopes: operations.map(({ id: operationId }) => ({
      operationId,
      scopeId,
    })),
    controlPlaceScopes: input.controlPlaces.map(({ id: controlPlaceId }) => ({
      controlPlaceId,
      scopeId,
    })),
    operations,
  };
}
