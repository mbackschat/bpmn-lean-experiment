/** Source-derived payloads for the private Sequential Multi-Instance host-capacity probe. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
  admitProcessStart,
  applyInternalOperationStep,
  initialState,
  sequentialMultiInstanceLimits,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  ProcessStartStimulus,
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind,
  WorkflowChainBudgetKind,
  bpmnWorkflowContinuationV1,
  bpmnWorkflowPublicationSegmentDescriptorV1,
  bpmnWorkflowPublicationSegmentDirectoryV1,
  canonicalStimulusEncoding,
  requireBpmnWorkflowContinuationPublicationV1,
  requireBpmnWorkflowContinuationStateV1,
  requireBpmnWorkflowHostInputV1,
  workflowChainProductionLimit,
  workflowContinuationBudgetViolation,
  workflowPublicationSegmentDirectorySha256,
  workflowPublicationSegmentSha256,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnWorkflowContinuationHostInputV1,
  BpmnWorkflowContinuationPublicationV1,
  BpmnWorkflowContinuationRecoveryV1,
} from "@bpmn-lean/temporal-protocol";

import {
  emptyCapacityPublication,
  publicationPages,
  appendCapacityPublication,
} from "./sequential-multi-instance-history-capacity-publication.ts";
import type {
  CapacityPublicationState,
} from "./sequential-multi-instance-history-capacity-publication.ts";
import {
  buildInterruptedCapacityTopology,
  buildNaturalCapacityTopology,
  closeCapacityOperations,
  projectCapacityCommand,
} from "./sequential-multi-instance-history-capacity-topologies.ts";
import type {
  SequentialMultiInstanceCapacityProbeTopologyFixture,
} from "./sequential-multi-instance-history-capacity-topologies.ts";
import type {
  SequentialMultiInstanceCapacityProbeStaticPayload,
} from "./sequential-multi-instance-history-capacity-workflows.ts";

const profile = "bpmn-2.0.2-sequential-multi-instance-user-task-draft";
const instanceId = "SMI_History_Capacity_Instance";
const firstExecutionRunId = "smi-capacity-probe-run-1";
const compileLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});
const fixtureUrl = new URL(
  "../../../bpmn-source/test/fixtures/sequential-multi-instance-user-task.bpmn",
  import.meta.url,
);

export type SequentialMultiInstanceCapacityProbeFixture = Readonly<{
  natural: SequentialMultiInstanceCapacityProbeTopologyFixture;
  interrupted: SequentialMultiInstanceCapacityProbeTopologyFixture;
  separator: {
    maximumItems: number;
    maximumItemUtf8Bytes: number;
    maximumCanonicalCollectionUtf8Bytes: number;
    canonicalMaximumCollectionBytes: number;
    equal508CollectionBytes: number;
    equal512CollectionBytes: number;
    exact16Admitted: true;
    exact17Refused: true;
  };
}>;

export async function createSequentialMultiInstanceCapacityProbeFixture():
Promise<SequentialMultiInstanceCapacityProbeFixture> {
  const source = await readFile(fixtureUrl);
  const compiled = await compileBpmnToSemanticProcess({
    bytes: source,
    sourceId: "sequential-multi-instance-history-capacity-probe",
    expectedSha256: undefined,
    semanticProfile: profile,
    sourceOverlay: null,
    limits: compileLimits,
  });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("exact SMI source was not admitted for capacity preparation");
  }
  const program = compiled.semanticProcess;
  const operation = requiredOperation(
    program,
    SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  if (operation.kind !== SemanticOperationKind.AwaitSequentialMultiInstanceUserTask) {
    throw new TypeError("compiled SMI source has no loop operation");
  }
  const initiate = requiredOperation(program, SemanticOperationKind.Initiate);
  const naturalEnd = requiredOperationByOrigin(
    program,
    SemanticOperationKind.ReachNoneEnd,
    "EndEvent_Completed",
  );
  const escalationTask = requiredOperationByOrigin(
    program,
    SemanticOperationKind.AwaitUserTask,
    "UserTask_Escalation",
  );
  const interruptedEnd = requiredOperationByOrigin(
    program,
    SemanticOperationKind.ReachNoneEnd,
    "EndEvent_Interrupted",
  );
  const completedScope = requiredOperationByOrigin(
    program,
    SemanticOperationKind.CompleteScope,
    program.processId,
  );
  const collection = maximumCanonicalCollection();
  const start: Extract<ProcessStartStimulus, { kind: StimulusKind.StartProcess }> = {
    kind: StimulusKind.StartProcess,
    commandId: "start-smi-history-capacity",
    processId: program.processId,
    instanceId,
    initialVariables: [{
      name: operation.data.input.dataObjectId,
      value: { kind: VariableValueKind.StringList, value: collection },
    }],
  };
  canonicalStimulusEncoding(start);

  const admittedStart = admitProcessStart(program, initialState, start);
  assert.ok(admittedStart !== null);
  const startClosure = closeCapacityOperations(program, admittedStart, [
    initiate,
    operation,
  ]);
  const startFacts = projectCapacityCommand(
    program,
    initialState,
    start,
    admittedStart,
    startClosure.steps,
  );
  let startPublication = emptyCapacityPublication(program, instanceId);
  startPublication = appendCapacityPublication(
    program,
    startPublication,
    start,
    startFacts,
    1_000,
  );
  publicationPages(program, instanceId, startPublication);
  const continuation = continuationPayload(
    program,
    start,
    startFacts.state,
    startPublication,
  );
  const common = {
    program,
    processInstanceId: instanceId,
    operation,
    collection,
    initialState: startFacts.state,
    initialPublication: startPublication,
    initialObservations: startFacts.observations,
    continuation,
  };

  return {
    natural: buildNaturalCapacityTopology({
      ...common,
      naturalEnd,
      completedScope,
    }),
    interrupted: buildInterruptedCapacityTopology({
      ...common,
      escalationTask,
      interruptedEnd,
      completedScope,
    }),
    separator: separator(
      program,
      operation,
      initiate,
      start,
      collection,
      startClosure.steps.some(({ operation: applied }) =>
        applied.id === operation.id
      ),
    ),
  };
}

function maximumCanonicalCollection(): readonly string[] {
  const collection = [
    "x".repeat(512),
    ...Array.from({ length: 14 }, () => "x".repeat(509)),
    "x".repeat(505),
  ];
  assert.equal(collection.length, sequentialMultiInstanceLimits.maximumItems);
  assert.equal(utf8ByteLength(JSON.stringify(collection)), 8_192);
  assert.equal(Math.max(...collection.map(utf8ByteLength)), 512);
  return collection;
}

function separator(
  program: SemanticProcessProgram,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask }
  >,
  initiate: SemanticOperation,
  start: Extract<ProcessStartStimulus, { kind: StimulusKind.StartProcess }>,
  collection: readonly string[],
  exact16Admitted: boolean,
) {
  const exact17 = Array.from({ length: 17 }, () => "x");
  const equal508 = Array.from({ length: 16 }, () => "x".repeat(508));
  const equal512 = Array.from({ length: 16 }, () => "x".repeat(512));
  assert.ok(
    utf8ByteLength(JSON.stringify(exact17)) <
      sequentialMultiInstanceLimits.maximumCanonicalCollectionUtf8Bytes,
  );
  const exact17Start = {
    ...start,
    initialVariables: [{
      name: operation.data.input.dataObjectId,
      value: { kind: VariableValueKind.StringList, value: exact17 },
    }],
  } as const;
  const exact17Admitted = admitProcessStart(program, initialState, exact17Start);
  assert.ok(exact17Admitted !== null);
  const exact17Initiated = closeCapacityOperations(
    program,
    exact17Admitted,
    [initiate],
  ).state;
  const exact17Before = structuredClone(exact17Initiated);
  const exact17Refused = applyInternalOperationStep(
    program,
    operation,
    exact17Initiated,
  ) === null;
  assert.deepEqual(exact17Initiated, exact17Before);
  requireTrue(exact16Admitted, "exact 16 collection was not admitted");
  requireTrue(exact17Refused, "exact 17 collection was not refused");
  return {
    maximumItems: sequentialMultiInstanceLimits.maximumItems,
    maximumItemUtf8Bytes: sequentialMultiInstanceLimits.maximumItemUtf8Bytes,
    maximumCanonicalCollectionUtf8Bytes:
      sequentialMultiInstanceLimits.maximumCanonicalCollectionUtf8Bytes,
    canonicalMaximumCollectionBytes: utf8ByteLength(JSON.stringify(collection)),
    equal508CollectionBytes: utf8ByteLength(JSON.stringify(equal508)),
    equal512CollectionBytes: utf8ByteLength(JSON.stringify(equal512)),
    exact16Admitted,
    exact17Refused,
  } as const;
}

function requiredOperation(
  program: SemanticProcessProgram,
  kind: SemanticOperationKind,
): SemanticOperation {
  const matches = program.operations.filter((operation) => operation.kind === kind);
  const operation = matches[0];
  assert.ok(matches.length === 1 && operation !== undefined, `expected one ${kind}`);
  return operation;
}

function requiredOperationByOrigin(
  program: SemanticProcessProgram,
  kind: SemanticOperationKind,
  elementId: string,
): SemanticOperation {
  const matches = program.operations.filter((operation) =>
    operation.kind === kind &&
    operation.origin.kind === "bpmnElement" &&
    operation.origin.elementId === elementId
  );
  const operation = matches[0];
  assert.ok(
    matches.length === 1 && operation !== undefined,
    `expected one ${kind} at ${elementId}`,
  );
  return operation;
}

function requireTrue(value: boolean, message: string): asserts value is true {
  assert.equal(value, true, message);
}

function continuationPayload(
  program: SemanticProcessProgram,
  start: ProcessStartStimulus,
  state: RuntimeState,
  publication: CapacityPublicationState,
): SequentialMultiInstanceCapacityProbeStaticPayload["continuation"] {
  const descriptor = {
    format: bpmnWorkflowPublicationSegmentDescriptorV1,
    runId: firstExecutionRunId,
    runOrdinal: 1,
    fromRevision: 0,
    throughRevision: publication.execution.headRevision,
    sha256: workflowPublicationSegmentSha256(
      publication.execution.batches,
      publication.flowNodeOccurrences.batches,
    ),
  } as const;
  const segmentDirectory = {
    format: bpmnWorkflowPublicationSegmentDirectoryV1,
    segments: [descriptor],
  } as const;
  const carriedPublication: BpmnWorkflowContinuationPublicationV1 = {
    execution: {
      definition: publication.execution.definition,
      processId: publication.execution.processId,
      processInstanceId: publication.execution.processInstanceId,
      headRevision: publication.execution.headRevision,
      current: publication.execution.current,
    },
    flowNodeOccurrences: {
      definition: publication.flowNodeOccurrences.definition,
      processId: publication.flowNodeOccurrences.processId,
      processInstanceId: publication.flowNodeOccurrences.processInstanceId,
      headRevision: publication.flowNodeOccurrences.headRevision,
      currentOpen: publication.flowNodeOccurrences.currentOpen,
      retainedOpen: publication.flowNodeOccurrences.retainedOpen,
      lastCommittedAtEpochMs: publication.flowNodeOccurrences.lastCommittedAtEpochMs,
    },
    segmentDirectory,
  };
  const host: BpmnWorkflowContinuationHostInputV1 = {
    protocol: bpmnWorkflowContinuationV1,
    kind: BpmnWorkflowHostInputKind.Continuation,
    eventHistoryEventLimit: workflowChainProductionLimit(
      WorkflowChainBudgetKind.EventHistoryEvents,
    ),
    eventHistoryByteLimit: workflowChainProductionLimit(
      WorkflowChainBudgetKind.EventHistoryBytes,
    ),
    runOrdinal: 2,
    firstExecutionRunId,
    definition: program.identity,
    processId: program.processId,
    processInstanceId: start.instanceId,
    startCommandId: start.commandId,
    publicationSegmentDirectorySha256:
      workflowPublicationSegmentDirectorySha256(segmentDirectory),
    completedMessageDeliveryRecords: [],
  };
  const recovery: BpmnWorkflowContinuationRecoveryV1 = { entries: [] };
  requireBpmnWorkflowHostInputV1(host);
  requireBpmnWorkflowContinuationStateV1(state, program, start.instanceId);
  requireBpmnWorkflowContinuationPublicationV1(
    carriedPublication,
    program,
    state,
    start.instanceId,
    { firstExecutionRunId, successorRunOrdinal: 2 },
  );
  assert.equal(
    workflowContinuationBudgetViolation(
      start,
      program,
      host,
      state,
      recovery,
      carriedPublication,
    ),
    null,
  );
  return { start, program, host, state, recovery, publication: carriedPublication };
}
