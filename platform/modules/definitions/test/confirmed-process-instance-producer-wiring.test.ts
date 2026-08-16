import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DefinitionStartStatus as EngineDefinitionStartStatus,
} from "@bpmn-lean/platform-engine-gateway";
import {
  ConfirmedProcessInstancePublicationService,
  DefinitionScheduleHostPhase,
  DefinitionScheduleService,
  DefinitionScheduleState,
  DefinitionStartService,
  MessageStartPublicationService,
  MessageStartPublicationState,
  InMemoryConfirmedProcessInstanceRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionStartDescriptionResult,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  DefinitionScheduleHost,
  DefinitionScheduleHostResult,
  DefinitionScheduleRecord,
  DefinitionScheduleReference,
  DefinitionScheduleRepository,
  DefinitionScheduleReservation,
  DefinitionScheduleTransition,
  ExactArtifactStore,
  MessageStartPublicationHost,
  MessageStartPublicationRecord,
  MessageStartPublicationRepository,
  MessageStartPublicationReservation,
  NewDefinitionMetadata,
  NewDefinitionScheduleRecord,
  NewMessageStartPublicationRecord,
  ConfirmedProcessInstanceOperateSubscriber,
  ConfirmedProcessInstancePublication,
} from "@bpmn-lean/platform-definitions";
import type {
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

const bytes = new TextEncoder().encode("exact producer definition");
const definition = exactDefinition();

test("direct start suppresses success when recording the exact identity fails", async () => {
  const publisher = new FailOncePublisher();
  let hostStarts = 0;
  const service = new DefinitionStartService(
    {
      prepareDefinitionVersion: async (request) => ({
        status: EngineDefinitionStartStatus.Admitted,
        source: structuredClone(definition.source),
        definition: {
          processId: definition.processId,
          semanticProfile: definition.semanticProfile,
        },
        processInstanceId: request.processInstanceId,
        locator: "direct-locator",
        intent: {
          protocol: "bpmn-direct-start-v1",
          intentSha256: "a".repeat(64),
        },
      }),
      startPreparedDefinitionVersion: async (request) => {
        hostStarts += 1;
        return {
          status: EngineDefinitionStartStatus.Started,
          source: structuredClone(definition.source),
          definition: {
            processId: definition.processId,
            semanticProfile: definition.semanticProfile,
          },
          processInstanceId: request.processInstanceId,
        };
      },
      describeDefinitionVersionStart: async () => ({
        status: "matching" as DefinitionStartDescriptionResult["status"],
      }),
      startDefinitionVersion: async () => {
        throw new Error("legacy direct start must not be used");
      },
    },
    artifactStore(),
    new OneDefinitionRepository(),
    () => "direct-instance",
    confirmedInstances(publisher),
  );

  await assert.rejects(
    service.start({ processId: definition.processId, version: definition.version }),
    /recording failed/u,
  );

  assert.equal(hostStarts, 1);
  assert.deepEqual(publisher.attempts, [
    exactPublication("direct-instance", "direct-locator"),
  ]);
});

test("started Schedule retry repairs recording without repeating its host action", async () => {
  const publisher = new FailOncePublisher();
  const schedules = new MemoryScheduleRepository();
  let hostCreates = 0;
  const service = new DefinitionScheduleService({
    artifacts: artifactStore(),
    definitions: new OneDefinitionRepository(),
    schedules,
    host: scheduleHost(() => {
      hostCreates += 1;
    }),
    identities: {
      processInstanceId: () => "schedule-instance",
      hostScheduleId: () => "host-schedule",
      configuredWorkflowIdBase: () => "configured-workflow",
    },
    now: () => Date.parse("2026-08-12T09:59:00.000Z"),
    confirmedInstances: confirmedInstances(publisher),
    locators: testLocators,
  });
  const request = {
    processId: definition.processId,
    version: definition.version,
    scheduleId: "schedule",
    activationAt: "2026-08-12T10:00:00.000Z",
  };

  await assert.rejects(service.put(request), /recording failed/u);
  const retried = await service.put(request);

  assert.equal(retried.schedule.status, DefinitionScheduleState.Started);
  assert.deepEqual(retried.schedule.instance, exactIdentity("schedule-instance"));
  assert.equal(hostCreates, 1);
  assert.deepEqual(publisher.attempts, [
    exactPublication("schedule-instance", "schedule:execution-workflow"),
    exactPublication("schedule-instance", "schedule:execution-workflow"),
  ]);
});

test("accepted Message publication retry repairs recording without repeating start", async () => {
  const publisher = new FailOncePublisher();
  const publications = new MemoryPublicationRepository();
  let hostStarts = 0;
  const service = new MessageStartPublicationService({
    artifacts: artifactStore(),
    definitions: new OneDefinitionRepository(),
    publications,
    host: messageHost(() => {
      hostStarts += 1;
    }),
    identities: {
      processInstanceId: () => "message-instance",
      commandId: () => "message-command",
      workflowId: () => "message-workflow",
    },
    confirmedInstances: confirmedInstances(publisher),
    locators: testLocators,
  });
  const request = {
    definition: { processId: definition.processId, version: definition.version },
    messageStart: structuredClone(definition.startCapabilities.messageStarts[0]!),
  };

  await assert.rejects(service.put("publication", request), /recording failed/u);
  const retried = await service.put("publication", request);

  assert.equal(retried.publication.status, "accepted");
  assert.deepEqual(retried.publication.instance, exactIdentity("message-instance"));
  assert.equal(hostStarts, 1);
  assert.deepEqual(publisher.attempts, [
    exactPublication("message-instance", "canonical:message-instance"),
    exactPublication("message-instance", "canonical:message-instance"),
  ]);
});

test("non-confirmed producer states never record an instance", async () => {
  const publisher = new RecordingPublisher();
  const rejectedStart = new DefinitionStartService(
    {
      prepareDefinitionVersion: async () => ({
        status: EngineDefinitionStartStatus.Rejected,
        source: structuredClone(definition.source),
        definition: {
          processId: definition.processId,
          semanticProfile: definition.semanticProfile,
        },
        failure: { code: "rejected", evidence: "not started" },
      }),
      startPreparedDefinitionVersion: async () => {
        throw new Error("rejected preparation must not start");
      },
      describeDefinitionVersionStart: async () => {
        throw new Error("rejected preparation must not describe");
      },
      startDefinitionVersion: async () => {
        throw new Error("legacy direct start must not be used");
      },
    },
    artifactStore(),
    new OneDefinitionRepository(),
    () => "rejected-instance",
    confirmedInstances(publisher),
  );
  await rejectedStart.start({
    processId: definition.processId,
    version: definition.version,
  });

  const schedules = new MemoryScheduleRepository();
  await new DefinitionScheduleService({
    artifacts: artifactStore(),
    definitions: new OneDefinitionRepository(),
    schedules,
    host: scheduleHost(undefined, DefinitionScheduleHostPhase.Pending),
    identities: {
      processInstanceId: () => "scheduled-instance",
      hostScheduleId: () => "host-schedule",
      configuredWorkflowIdBase: () => "configured-workflow",
    },
    now: () => Date.parse("2026-08-12T09:59:00.000Z"),
    confirmedInstances: confirmedInstances(publisher),
    locators: testLocators,
  }).put({
    processId: definition.processId,
    version: definition.version,
    scheduleId: "pending",
    activationAt: "2026-08-12T10:00:00.000Z",
  });

  const missedSchedules = new MemoryScheduleRepository();
  const missed = await scheduleService(
    publisher,
    missedSchedules,
    DefinitionScheduleHostPhase.Missed,
  ).put({
    processId: definition.processId,
    version: definition.version,
    scheduleId: "missed",
    activationAt: "2026-08-12T10:00:00.000Z",
  });
  assert.equal(missed.schedule.status, DefinitionScheduleState.Missed);

  const cancelledSchedules = new MemoryScheduleRepository();
  const cancellable = scheduleService(
    publisher,
    cancelledSchedules,
    DefinitionScheduleHostPhase.Pending,
  );
  const cancelledReference = {
    processId: definition.processId,
    version: definition.version,
    scheduleId: "cancelled",
  };
  await cancellable.put({
    ...cancelledReference,
    activationAt: "2026-08-12T10:00:00.000Z",
  });
  const cancelled = await cancellable.delete(cancelledReference);
  assert.equal(cancelled?.status, DefinitionScheduleState.Cancelled);

  const indeterminatePublications = new MemoryPublicationRepository();
  const publicationRequest = {
    definition: { processId: definition.processId, version: definition.version },
    messageStart: structuredClone(definition.startCapabilities.messageStarts[0]!),
  };
  const indeterminate = await new MessageStartPublicationService({
    artifacts: artifactStore(),
    definitions: new OneDefinitionRepository(),
    publications: indeterminatePublications,
    host: {
      prepare: async () => ({
        status: "admitted",
        intent: { protocol: "intent-v1", intentSha256: "8".repeat(64) },
      }),
      start: async () => {
        throw new Error("possibly delivered");
      },
      describe: async () => ({ status: "missing" }),
    },
    identities: publicationIdentities(),
    confirmedInstances: confirmedInstances(publisher),
    locators: testLocators,
  }).put("indeterminate", publicationRequest);
  assert.equal(indeterminate.publication.status, "indeterminate");

  const integrityPublications = new MemoryPublicationRepository();
  await assert.rejects(
    new MessageStartPublicationService({
      artifacts: artifactStore(),
      definitions: new OneDefinitionRepository(),
      publications: integrityPublications,
      host: {
        prepare: async () => ({
          status: "admitted",
          intent: { protocol: "intent-v1", intentSha256: "8".repeat(64) },
        }),
        start: async () => ({ status: "rejected", evidence: "not accepted" }),
        describe: async () => ({ status: "divergent" }),
      },
      identities: publicationIdentities(),
      confirmedInstances: confirmedInstances(publisher),
      locators: testLocators,
    }).put("integrity", publicationRequest),
  );
  assert.equal(
    integrityPublications.record?.state,
    MessageStartPublicationState.IntegrityFailure,
  );

  assert.deepEqual(publisher.attempts, []);
});

class RecordingPublisher implements ConfirmedProcessInstanceOperateSubscriber {
  readonly attempts: ConfirmedProcessInstancePublication[] = [];

  async recordConfirmedProcessInstance(
    publication: ConfirmedProcessInstancePublication,
  ): Promise<void> {
    this.attempts.push(structuredClone(publication));
  }
}

class FailOncePublisher extends RecordingPublisher {
  override async recordConfirmedProcessInstance(
    publication: ConfirmedProcessInstancePublication,
  ): Promise<void> {
    await super.recordConfirmedProcessInstance(publication);
    if (this.attempts.length === 1) {
      throw new Error("recording failed");
    }
  }
}

class OneDefinitionRepository implements DefinitionRepository {
  async allocateNext(
    _metadata: NewDefinitionMetadata,
  ): Promise<DefinitionMetadata> {
    throw new Error("not used");
  }
  async listLatest(): Promise<ReadonlyArray<DefinitionMetadata>> {
    return [structuredClone(definition)];
  }
  async listVersions(
    _processId: string,
  ): Promise<ReadonlyArray<DefinitionMetadata>> {
    return [structuredClone(definition)];
  }
  async get(reference: DefinitionReference): Promise<DefinitionMetadata | null> {
    return reference.processId === definition.processId &&
      reference.version === definition.version
      ? structuredClone(definition)
      : null;
  }
}

class MemoryScheduleRepository implements DefinitionScheduleRepository {
  record: DefinitionScheduleRecord | null = null;

  async reserve(
    value: NewDefinitionScheduleRecord,
  ): Promise<DefinitionScheduleReservation> {
    if (this.record !== null) {
      return { inserted: false, record: structuredClone(this.record) };
    }
    this.record = {
      ...structuredClone(value),
      state: DefinitionScheduleState.Creating,
      cleanupComplete: false,
      cancellationOrigin: null,
      executionWorkflowId: null,
      firstRunId: null,
    };
    return { inserted: true, record: structuredClone(this.record) };
  }
  async get(
    _reference: DefinitionScheduleReference,
  ): Promise<DefinitionScheduleRecord | null> {
    return structuredClone(this.record);
  }
  async listForDefinition(_reference: DefinitionReference) {
    return this.record === null ? [] : [structuredClone(this.record)];
  }
  async listForReconciliation() {
    return this.record === null ? [] : [structuredClone(this.record)];
  }
  async compareAndSet(
    _reference: DefinitionScheduleReference,
    expected: DefinitionScheduleState,
    transition: DefinitionScheduleTransition,
  ): Promise<DefinitionScheduleRecord | null> {
    if (this.record === null || this.record.state !== expected) {
      return null;
    }
    this.record = { ...this.record, ...transition };
    return structuredClone(this.record);
  }
  async requestCancellation(_reference: DefinitionScheduleReference) {
    if (this.record === null) {
      return null;
    }
    switch (this.record.state) {
      case DefinitionScheduleState.Creating:
        this.record = {
          ...this.record,
          state: DefinitionScheduleState.Cancelled,
          cleanupComplete: true,
        };
        break;
      case DefinitionScheduleState.CreatingHost:
      case DefinitionScheduleState.Scheduled:
        this.record = {
          ...this.record,
          state: DefinitionScheduleState.Cancelling,
          cancellationOrigin: this.record.state,
        };
        break;
    }
    return structuredClone(this.record);
  }
  async markCleanupComplete(
    reference: DefinitionScheduleReference,
    expected: DefinitionScheduleState,
  ) {
    return await this.compareAndSet(reference, expected, {
      state: expected,
      cleanupComplete: true,
    });
  }
}

class MemoryPublicationRepository implements MessageStartPublicationRepository {
  record: MessageStartPublicationRecord | null = null;

  async reserve(
    value: NewMessageStartPublicationRecord,
  ): Promise<MessageStartPublicationReservation> {
    if (this.record !== null) {
      return { inserted: false, record: structuredClone(this.record) };
    }
    this.record = {
      ...structuredClone(value),
      state: MessageStartPublicationState.Reserved,
    };
    return { inserted: true, record: structuredClone(this.record) };
  }
  async get(
    _publicationId: string,
  ): Promise<MessageStartPublicationRecord | null> {
    return structuredClone(this.record);
  }
  async listForReconciliation() {
    return this.record === null ? [] : [structuredClone(this.record)];
  }
  async compareAndSet(
    _publicationId: string,
    expected: MessageStartPublicationState,
    next: MessageStartPublicationState,
  ): Promise<MessageStartPublicationRecord | null> {
    if (this.record === null || this.record.state !== expected) {
      return null;
    }
    this.record = { ...this.record, state: next };
    return structuredClone(this.record);
  }
}

function artifactStore(): ExactArtifactStore {
  return {
    put: async () => ({ status: "stored" }),
    get: async () => Uint8Array.from(bytes),
  };
}

function scheduleHost(
  onCreate?: () => void,
  phase: typeof DefinitionScheduleHostPhase.Started |
    typeof DefinitionScheduleHostPhase.Pending |
    typeof DefinitionScheduleHostPhase.Missed = DefinitionScheduleHostPhase.Started,
): DefinitionScheduleHost {
  let result: DefinitionScheduleHostResult;
  switch (phase) {
    case DefinitionScheduleHostPhase.Started:
      result = {
        phase,
        executionWorkflowId: "execution-workflow",
        firstRunId: "first-run",
      };
      break;
    case DefinitionScheduleHostPhase.Pending:
      result = { phase, paused: false };
      break;
    case DefinitionScheduleHostPhase.Missed:
      result = { phase };
      break;
  }
  return {
    validateDefinition: async () => ({
      status: "accepted",
      source: structuredClone(definition.source),
      processId: definition.processId,
      semanticProfile: definition.semanticProfile,
      startCapabilities: structuredClone(definition.startCapabilities),
    }),
    createOrCompare: async () => {
      onCreate?.();
      return result;
    },
    inspect: async () => result,
    pause: async () => ({
      phase: DefinitionScheduleHostPhase.Pending,
      paused: true,
    }),
    delete: async () => undefined,
  };
}

function scheduleService(
  startedInstances: ConfirmedProcessInstanceOperateSubscriber,
  schedules: DefinitionScheduleRepository,
  phase: typeof DefinitionScheduleHostPhase.Pending |
    typeof DefinitionScheduleHostPhase.Missed,
): DefinitionScheduleService {
  return new DefinitionScheduleService({
    artifacts: artifactStore(),
    definitions: new OneDefinitionRepository(),
    schedules,
    host: scheduleHost(undefined, phase),
    identities: {
      processInstanceId: () => `${phase}-instance`,
      hostScheduleId: () => `${phase}-host-schedule`,
      configuredWorkflowIdBase: () => `${phase}-configured-workflow`,
    },
    now: () => Date.parse("2026-08-12T09:59:00.000Z"),
    confirmedInstances: confirmedInstances(startedInstances),
    locators: testLocators,
  });
}

function messageHost(onStart: () => void): MessageStartPublicationHost {
  return {
    prepare: async () => ({
      status: "admitted",
      intent: { protocol: "intent-v1", intentSha256: "9".repeat(64) },
    }),
    start: async () => {
      onStart();
      return { status: "started" };
    },
    describe: async () => ({ status: "matching" }),
  };
}

function publicationIdentities() {
  return {
    processInstanceId: (publicationId: string) => `${publicationId}-instance`,
    commandId: (publicationId: string) => `${publicationId}-command`,
    workflowId: (processInstanceId: string) => `${processInstanceId}-workflow`,
  };
}

const testLocators = {
  canonicalLocator: (processInstanceId: string) =>
    `canonical:${encodeURIComponent(processInstanceId)}`,
  scheduleExecutionLocator: (executionWorkflowId: string) =>
    `schedule:${encodeURIComponent(executionWorkflowId)}`,
} as const;

function confirmedInstances(
  publisher: ConfirmedProcessInstanceOperateSubscriber,
): ConfirmedProcessInstancePublicationService {
  return new ConfirmedProcessInstancePublicationService({
    repository: new InMemoryConfirmedProcessInstanceRepository(),
    operate: publisher,
    work: { recordConfirmedProcessInstance: async () => undefined },
  });
}

function exactIdentity(processInstanceId: string): PublicProcessInstanceIdentity {
  return { processInstanceId, definition: structuredClone(definition) };
}

function exactPublication(
  processInstanceId: string,
  locator: string,
): ConfirmedProcessInstancePublication {
  return { instance: exactIdentity(processInstanceId), locator };
}

function exactDefinition(): DefinitionMetadata {
  return {
    processId: "Process_Producer",
    version: 7,
    source: {
      kind: "bpmnSource",
      id: "producer-source",
      sha256: "7".repeat(64),
      byteLength: bytes.byteLength,
      declaredEncoding: null,
      decodedAs: "UTF-8",
    },
    semanticProfile: "producer-profile",
    startCapabilities: {
      messageStarts: [{
        startEventId: "MessageStart",
        channel: {
          kind: "operationMessage",
          interfaceId: "ProducerInterface",
          interfaceOperationId: "StartProducer",
          messageId: "ProducerMessage",
        },
      }],
      timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
    },
  };
}
