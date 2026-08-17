import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import type { HumanTaskCatalogV1 } from "@bpmn-lean/platform-contracts";
import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceState,
  DefinitionPresentationIntegrityError,
  DefinitionScheduleIntegrityError,
  DefinitionScheduleState,
  MessageStartPublicationIntegrityError,
  MessageStartPublicationState,
} from "@bpmn-lean/platform-definitions";
import type {
  ConfirmedProcessInstanceRepository,
  DefinitionMetadata,
  DefinitionPresentationRepository,
  DefinitionRepository,
  DefinitionScheduleRepository,
  HumanTaskCatalogRepository,
  MessageStartPublicationRepository,
  NewDefinitionMetadata,
} from "@bpmn-lean/platform-definitions";

export type DefinitionsRepositoryContractFixture = Readonly<{
  definitions: DefinitionRepository & HumanTaskCatalogRepository;
  presentations: DefinitionPresentationRepository;
  confirmed: ConfirmedProcessInstanceRepository;
  schedules: DefinitionScheduleRepository;
  messages: MessageStartPublicationRepository;
  dispose: () => Promise<void>;
}>;

export type DefinitionsRepositoryContractFactory =
  () => Promise<DefinitionsRepositoryContractFixture>;

export const sourceBytes = new TextEncoder().encode("<exact-definition/>");
export const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");

export function registerDefinitionsRepositoryContract(
  label: string,
  createFixture: DefinitionsRepositoryContractFactory,
): void {
  test(`${label}: definitions preserve process-local versions and canonical catalogs`, async () => {
    await usingFixture(createFixture, async ({ definitions }) => {
      const candidate = metadata("Process_🚀");
      const first = await definitions.allocateNext(candidate, catalog(candidate));
      Object.assign(candidate.source, { id: "mutated" });
      const second = await definitions.allocateNext(metadata("Process_🚀"));
      await definitions.allocateNext(metadata("A"));
      await definitions.allocateNext(metadata("\ue000"));
      await definitions.allocateNext(metadata("NUL\u0000Process"));

      assert.equal(first.version, 1);
      assert.equal(first.source.id, "definition.bpmn");
      assert.equal(second.version, 2);
      assert.deepEqual(
        (await definitions.listVersions("Process_🚀")).map(({ version }) => version),
        [1, 2],
      );
      assert.deepEqual(
        (await definitions.listLatest()).map(({ processId }) => processId),
        ["A", "\ue000", "NUL\u0000Process", "Process_🚀"].sort(compareUnicodeScalars),
      );
      assert.equal(
        (await definitions.get({ processId: "NUL\u0000Process", version: 1 }))?.processId,
        "NUL\u0000Process",
      );
      assert.deepEqual(
        await definitions.getHumanTaskCatalog({ processId: "Process_🚀", version: 1 }),
        catalog(metadata("Process_🚀")),
      );
      assert.equal(
        await definitions.getHumanTaskCatalog({ processId: "Process_🚀", version: 2 }),
        null,
      );
      assert.equal(await definitions.get({ processId: "missing", version: 1 }), null);

      for (const [processId, mismatch] of [
        ["Catalog_Process_Mismatch", { processId: "other" }],
        ["Catalog_Profile_Mismatch", { semanticProfile: "other-profile" }],
        ["Catalog_Source_Mismatch", { sourceSha256: "f".repeat(64) }],
      ] as const) {
        const candidateMetadata = metadata(processId);
        await assert.rejects(
          definitions.allocateNext(
            candidateMetadata,
            { ...catalog(candidateMetadata), ...mismatch },
          ),
          /catalog identity does not match/u,
        );
        assert.deepEqual(await definitions.listVersions(processId), []);
      }
    });
  });

  test(`${label}: presentation is exact insert-or-compare storage`, async () => {
    await usingFixture(createFixture, async ({ presentations }) => {
      const exact = sidecar("<bpmndi:BPMNDiagram/>");
      assert.deepEqual(await presentations.insertOrCompare(exact), exact);
      assert.deepEqual(await presentations.insertOrCompare(structuredClone(exact)), exact);
      assert.deepEqual(await presentations.insertOrCompare({
        diagramInterchangeXml: exact.diagramInterchangeXml,
        provenance: {
          effectiveGeneratorSha256: exact.provenance.effectiveGeneratorSha256,
          generatorVersion: exact.provenance.generatorVersion,
          generatorId: exact.provenance.generatorId,
          kind: exact.provenance.kind,
        },
        presentationSha256: exact.presentationSha256,
        diagramInterchangeSha256: exact.diagramInterchangeSha256,
        sourceSha256: exact.sourceSha256,
        schemaEpoch: exact.schemaEpoch,
      }), exact);
      assert.deepEqual(await presentations.get({
        schemaEpoch: 1,
        sourceSha256,
        effectiveGeneratorSha256: "2".repeat(64),
      }), exact);
      await assert.rejects(
        presentations.insertOrCompare({ ...exact, presentationSha256: "4".repeat(64) }),
        DefinitionPresentationIntegrityError,
      );
      const changedXml = sidecar("<bpmndi:BPMNDiagram id=\"changed\"/>");
      await assert.rejects(
        presentations.insertOrCompare(changedXml),
        DefinitionPresentationIntegrityError,
      );
      assert.deepEqual(await presentations.get({
        schemaEpoch: 1,
        sourceSha256,
        effectiveGeneratorSha256: "2".repeat(64),
      }), exact);
    });
  });

  test(`${label}: confirmed registrations preserve intent, CAS, and subscriber isolation`, async () => {
    await usingFixture(createFixture, async ({ confirmed }) => {
      const publication = confirmedPublication();
      const reservation = await confirmed.reserveDirect({
        ...publication,
        intent: { protocol: "direct-v1", intentSha256: "5".repeat(64) },
      });
      assert.equal(reservation.inserted, true);
      const winners = await Promise.all([
        confirmed.compareAndSetState(
          publication.instance.processInstanceId,
          ConfirmedProcessInstanceState.Reserved,
          ConfirmedProcessInstanceState.Starting,
        ),
        confirmed.compareAndSetState(
          publication.instance.processInstanceId,
          ConfirmedProcessInstanceState.Reserved,
          ConfirmedProcessInstanceState.Starting,
        ),
      ]);
      assert.equal(winners.filter((value) => value !== null).length, 1);
      const confirmedRecord = await confirmed.compareAndSetState(
        publication.instance.processInstanceId,
        ConfirmedProcessInstanceState.Starting,
        ConfirmedProcessInstanceState.Confirmed,
      );
      assert.equal(confirmedRecord?.operatePending, true);
      assert.equal(confirmedRecord?.workPending, true);
      const afterOperate = await confirmed.acknowledge(
        publication.instance.processInstanceId,
        "operate",
      );
      assert.equal(afterOperate?.operatePending, false);
      assert.equal(afterOperate?.workPending, true);
      await assert.rejects(
        confirmed.reserveDirect({
          ...publication,
          intent: { protocol: "direct-v1", intentSha256: "6".repeat(64) },
        }),
        ConfirmedProcessInstanceIntegrityError,
      );
      await assert.rejects(
        confirmed.reserveDirect({
          ...publication,
          locator: "different-locator",
          intent: { protocol: "direct-v1", intentSha256: "5".repeat(64) },
        }),
        ConfirmedProcessInstanceIntegrityError,
      );
      for (const processInstanceId of ["A", "\ue000", "😀"]) {
        await confirmed.confirm(confirmedPublication(processInstanceId));
      }
      assert.deepEqual(
        (await confirmed.listForReconciliation()).map(
          ({ instance }) => instance.processInstanceId,
        ),
        ["A", "confirmed-instance", "\ue000", "😀"],
      );
      assert.deepEqual(
        (await confirmed.listConfirmed()).map(({ instance }) => instance.processInstanceId),
        ["A", "confirmed-instance", "\ue000", "😀"],
      );
      const fullyAcknowledged = await confirmed.acknowledge(
        publication.instance.processInstanceId,
        "work",
      );
      assert.equal(fullyAcknowledged?.operatePending, false);
      assert.equal(fullyAcknowledged?.workPending, false);
    });
  });

  test(`${label}: schedules preserve identities, deterministic order, and cancellation`, async () => {
    await usingFixture(createFixture, async ({ definitions, schedules }) => {
      const definition = await definitions.allocateNext(timerMetadata());
      await schedules.reserve(schedule(definition, "😀", 1));
      const exactA = schedule(definition, "A", 2);
      await schedules.reserve(exactA);
      const changedA = schedule(definition, "A", 9);
      assert.deepEqual(
        await schedules.reserve(changedA),
        { inserted: false, record: { ...exactA, state: DefinitionScheduleState.Creating,
          cleanupComplete: false, cancellationOrigin: null,
          executionWorkflowId: null, firstRunId: null } },
      );
      assert.deepEqual(
        (await schedules.listForDefinition(definition)).map(
          ({ reference }) => reference.scheduleId,
        ),
        ["A", "😀"],
      );
      for (const [suffix, collision] of [
        ["process", { processInstanceId: "schedule-instance-1" }],
        ["host", { hostScheduleId: "host-schedule-1" }],
        ["workflow", { configuredWorkflowIdBase: "workflow-base-1" }],
      ] as const) {
        const duplicateIdentity = schedule(definition, `other-${suffix}`, 3);
        Object.assign(duplicateIdentity.identity, collision);
        await assert.rejects(
          schedules.reserve(duplicateIdentity),
          DefinitionScheduleIntegrityError,
        );
      }
      await schedules.reserve(schedule(definition, "race", 4));
      const scheduleRace = await Promise.all([
        schedules.compareAndSet(
          scheduleReference(definition, "race"),
          DefinitionScheduleState.Creating,
          { state: DefinitionScheduleState.CreatingHost },
        ),
        schedules.compareAndSet(
          scheduleReference(definition, "race"),
          DefinitionScheduleState.Creating,
          { state: DefinitionScheduleState.CreatingHost },
        ),
      ]);
      assert.equal(scheduleRace.filter((value) => value !== null).length, 1);
      await schedules.reserve(schedule(definition, "illegal", 5));
      await assert.rejects(
        schedules.compareAndSet(
          scheduleReference(definition, "illegal"),
          DefinitionScheduleState.Creating,
          {
            state: DefinitionScheduleState.Started,
            executionWorkflowId: "execution",
            firstRunId: "run",
          },
        ),
        /illegal schedule transition/u,
      );
      assert.equal(
        (await schedules.get(scheduleReference(definition, "illegal")))?.state,
        DefinitionScheduleState.Creating,
      );
      const creatingHost = await schedules.compareAndSet(
        { processId: definition.processId, version: definition.version, scheduleId: "A" },
        DefinitionScheduleState.Creating,
        { state: DefinitionScheduleState.CreatingHost },
      );
      assert.equal(creatingHost?.state, DefinitionScheduleState.CreatingHost);
      const cancelling = await schedules.requestCancellation(
        { processId: definition.processId, version: definition.version, scheduleId: "A" },
      );
      assert.equal(cancelling?.state, DefinitionScheduleState.Cancelling);
      assert.equal(cancelling?.cancellationOrigin, DefinitionScheduleState.CreatingHost);
      assert.equal(
        await schedules.compareAndSet(
          { processId: definition.processId, version: definition.version, scheduleId: "A" },
          DefinitionScheduleState.CreatingHost,
          { state: DefinitionScheduleState.Scheduled },
        ),
        null,
      );
      const cancelled = await schedules.compareAndSet(
        scheduleReference(definition, "A"),
        DefinitionScheduleState.Cancelling,
        { state: DefinitionScheduleState.Cancelled },
      );
      assert.equal(cancelled?.cleanupComplete, false);
      const cleaned = await schedules.markCleanupComplete(
        scheduleReference(definition, "A"),
        DefinitionScheduleState.Cancelled,
      );
      assert.equal(cleaned?.cleanupComplete, true);
      assert.deepEqual(
        await schedules.markCleanupComplete(
          scheduleReference(definition, "A"),
          DefinitionScheduleState.Cancelled,
        ),
        cleaned,
      );
    });
  });

  test(`${label}: Message Start preserves three private identities and closed CAS`, async () => {
    await usingFixture(createFixture, async ({ definitions, messages }) => {
      const definition = await definitions.allocateNext(messageMetadata());
      const first = messagePublication(definition, "publication-a", 1);
      assert.equal((await messages.reserve(first)).inserted, true);
      const changedSameKey = messagePublication(definition, "publication-a", 9);
      assert.deepEqual(
        await messages.reserve(changedSameKey),
        { inserted: false, record: { ...first, state: MessageStartPublicationState.Reserved } },
      );
      for (const [suffix, collision] of [
        ["process", { processInstanceId: first.identity.processInstanceId }],
        ["command", { commandId: first.identity.commandId }],
        ["workflow", { workflowId: first.identity.workflowId }],
      ] as const) {
        const conflict = messagePublication(definition, `publication-${suffix}`, 2);
        Object.assign(conflict.identity, collision);
        await assert.rejects(
          messages.reserve(conflict),
          MessageStartPublicationIntegrityError,
        );
      }
      await assert.rejects(
        messages.compareAndSet(
          first.publicationId,
          MessageStartPublicationState.Reserved,
          MessageStartPublicationState.Accepted,
        ),
        /illegal Message Start publication transition/u,
      );
      assert.equal(
        (await messages.get(first.publicationId))?.state,
        MessageStartPublicationState.Reserved,
      );
      const winners = await Promise.all([
        messages.compareAndSet(
          first.publicationId,
          MessageStartPublicationState.Reserved,
          MessageStartPublicationState.Starting,
        ),
        messages.compareAndSet(
          first.publicationId,
          MessageStartPublicationState.Reserved,
          MessageStartPublicationState.Starting,
        ),
      ]);
      assert.equal(winners.filter((value) => value !== null).length, 1);
      const accepted = await messages.compareAndSet(
        first.publicationId,
        MessageStartPublicationState.Starting,
        MessageStartPublicationState.Accepted,
      );
      assert.equal(accepted?.state, MessageStartPublicationState.Accepted);
      await assert.rejects(
        messages.compareAndSet(
          first.publicationId,
          MessageStartPublicationState.Accepted,
          MessageStartPublicationState.Starting,
        ),
        /illegal Message Start publication transition/u,
      );
      assert.equal(
        (await messages.get(first.publicationId))?.state,
        MessageStartPublicationState.Accepted,
      );
      assert.deepEqual(await messages.listForReconciliation(), [accepted]);
    });
  });
}

async function usingFixture(
  createFixture: DefinitionsRepositoryContractFactory,
  run: (fixture: DefinitionsRepositoryContractFixture) => Promise<void>,
): Promise<void> {
  const fixture = await createFixture();
  try {
    await run(fixture);
  } finally {
    await fixture.dispose();
  }
}

function metadata(processId: string): NewDefinitionMetadata {
  return {
    processId,
    source: {
      kind: "bpmnSource",
      id: "definition.bpmn",
      sha256: sourceSha256,
      byteLength: sourceBytes.byteLength,
      declaredEncoding: null,
      decodedAs: "UTF-8",
    },
    semanticProfile: "profile-v1",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  };
}

function timerMetadata(): NewDefinitionMetadata {
  return {
    ...metadata("Timer_Process"),
    startCapabilities: {
      messageStarts: [],
      timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
    },
  };
}

function messageMetadata(): NewDefinitionMetadata {
  return {
    ...metadata("Message_Process"),
    startCapabilities: { messageStarts: [messageStart()], timerStarts: [] },
  };
}

export function catalog(metadataValue: NewDefinitionMetadata): HumanTaskCatalogV1 {
  return {
    schemaVersion: "bpmn-lean-human-task-catalog/v1",
    processId: metadataValue.processId,
    semanticProfile: metadataValue.semanticProfile,
    sourceSha256: metadataValue.source.sha256,
    tasks: [{
      elementId: "Review",
      description: "Review the request.",
      worklistPriority: 50,
      form: {
        schemaVersion: "bpmn-lean-structured-form/v1",
        fields: [{
          kind: "boolean",
          key: "approved",
          label: "Approved",
          helpText: null,
          defaultValue: null,
          visibleForActions: "all",
          requiredForActions: ["complete"],
        }],
        actions: [{
          id: "complete",
          label: "Complete",
          intent: "primary",
          resolutionValue: "completed",
        }, {
          id: "abort",
          label: "Abort",
          intent: "destructive",
          resolutionValue: "aborted",
        }],
        resolutionVariable: "resolution",
      },
    }],
  };
}

export function sidecar(diagramInterchangeXml: string) {
  return {
    schemaEpoch: 1 as const,
    sourceSha256,
    diagramInterchangeSha256: createHash("sha256")
      .update(diagramInterchangeXml, "utf8")
      .digest("hex"),
    presentationSha256: "3".repeat(64),
    provenance: {
      kind: "generated" as const,
      generatorId: "bpmn-auto-layout" as const,
      generatorVersion: "1.3.0" as const,
      effectiveGeneratorSha256: "2".repeat(64),
    },
    diagramInterchangeXml,
  };
}

function confirmedPublication(processInstanceId: string = "confirmed-instance") {
  const definition = { ...metadata("Confirmed_Process"), version: 1 };
  return {
    instance: { processInstanceId, definition },
    locator: "private-work-locator",
  };
}

function schedule(definition: DefinitionMetadata, scheduleId: string, identity: number) {
  return {
    reference: { processId: definition.processId, version: definition.version, scheduleId },
    definition,
    timerStart: { startEventId: "TimerStart", durationMs: 1_000 },
    activationAt: "2026-08-11T12:00:00.000Z",
    dueAt: "2026-08-11T12:00:01.000Z",
    identity: {
      processInstanceId: `schedule-instance-${identity}`,
      hostScheduleId: `host-schedule-${identity}`,
      configuredWorkflowIdBase: `workflow-base-${identity}`,
    },
  };
}

function scheduleReference(definition: DefinitionMetadata, scheduleId: string) {
  return {
    processId: definition.processId,
    version: definition.version,
    scheduleId,
  };
}

function messageStart() {
  return {
    startEventId: "MessageStart",
    channel: {
      kind: "operationMessage" as const,
      interfaceId: "Orders",
      interfaceOperationId: "SubmitOrder",
      messageId: "OrderSubmitted",
    },
  };
}

function messagePublication(
  definition: DefinitionMetadata,
  publicationId: string,
  identity: number,
) {
  return {
    publicationId,
    definition,
    messageStart: messageStart(),
    identity: {
      processInstanceId: `message-instance-${identity}`,
      commandId: `message-command-${identity}`,
      workflowId: `message-workflow-${identity}`,
    },
    intent: {
      protocol: "message-start-v1",
      intentSha256: identity.toString().repeat(64),
    },
  };
}

function compareUnicodeScalars(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0) ?? 0);
  const rightPoints = [...right].map((value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
