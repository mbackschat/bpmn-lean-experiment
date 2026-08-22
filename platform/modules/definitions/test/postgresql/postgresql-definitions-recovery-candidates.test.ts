import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { PostgresqlExactArtifactStore } from "@bpmn-lean/platform-artifact-store";
import {
  ConfirmedProcessInstancePublicationService,
  ConfirmedProcessInstanceState,
  DefinitionsRecoveryFamily,
  MessageStartPublicationState,
  PostgresqlConfirmedProcessInstanceRepository,
  PostgresqlDefinitionRepository,
  PostgresqlDefinitionScheduleRepository,
  PostgresqlDefinitionsRecoveryCandidateSource,
  PostgresqlMessageStartPublicationRepository,
  decodeDefinitionsRecoveryCandidateKey,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionMetadata,
  DefinitionScheduleReference,
  NewDefinitionScheduleRecord,
  NewMessageStartPublicationRecord,
} from "@bpmn-lean/platform-definitions";
import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import { runPostgresqlMigrations } from "@bpmn-lean/platform-postgresql-runtime/migrations";

test("PostgreSQL recovery candidate discovery has a bounded typed source", async () => {
  const queries: string[] = [];
  const runtime = {
    query: async ({ text }: Readonly<{ text: string }>) => {
      queries.push(text);
      return { rows: [], rowCount: 0 };
    },
  } as unknown as PostgresqlRuntime;
  const source = new PostgresqlDefinitionsRecoveryCandidateSource(runtime);

  for (const family of Object.values(DefinitionsRecoveryFamily)) {
    assert.deepEqual(await source.listCandidateKeys(family, 1), []);
  }
  assert.equal(queries.length, Object.values(DefinitionsRecoveryFamily).length);
  for (const query of queries) assert.match(query, /LIMIT \$1/u);
  await assert.rejects(
    source.listCandidateKeys(DefinitionsRecoveryFamily.DirectStart, 0),
    /limit must be 1\.\.10000/u,
  );
  assert.equal(queries.length, Object.values(DefinitionsRecoveryFamily).length);
});

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Definitions recovery candidates require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createTestRuntime(baseUrl);
  const artifacts = new PostgresqlExactArtifactStore(runtime);

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      // The whole platform catalog, not just the packages this test reads. Migration ordinals are
      // global and the loader requires them contiguous, so a partial list breaks as soon as any
      // package gains a migration numbered above the gap this subset leaves.
      migrationDirectories: [
        fileURLToPath(
          new URL("../../../../foundation/artifact-store/migrations", import.meta.url),
        ),
        fileURLToPath(new URL("../../migrations", import.meta.url)),
        fileURLToPath(new URL("../../../operate/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../work/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../foundation/audit/migrations", import.meta.url)),
        fileURLToPath(
          new URL("../../../../foundation/recovery-runtime/migrations", import.meta.url),
        ),
      ],
    });
  });

  after(async () => {
    await runtime.close();
  });

  test("discovers four bounded families in bytewise identity order and suppresses published terminals", async () => {
    await resetDatabase(runtime);
    const stored = await seedDefinition(runtime, artifacts);
    const confirmed = new PostgresqlConfirmedProcessInstanceRepository(runtime);
    const schedules = new PostgresqlDefinitionScheduleRepository(runtime);
    const messages = new PostgresqlMessageStartPublicationRepository(runtime);
    const source = new PostgresqlDefinitionsRecoveryCandidateSource(runtime);

    await confirmed.confirm(confirmedPublication("confirmed\u0000😀", stored));
    const directIds = ["direct\u0000😀", "direct-A"];
    for (const processInstanceId of directIds) {
      await confirmed.reserveDirect(directReservation(processInstanceId, stored));
    }

    const activeSchedule = scheduleRecord(stored, "schedule\u0000😀", "active-instance");
    await schedules.reserve(activeSchedule);
    const unpublishedSchedule = scheduleRecord(
      stored,
      "schedule-terminal",
      "schedule-unpublished",
    );
    await storeStartedSchedule(schedules, unpublishedSchedule);
    const publishedSchedule = scheduleRecord(
      stored,
      "schedule-published",
      "schedule-published-instance",
    );
    await storeStartedSchedule(schedules, publishedSchedule);
    await confirmed.confirm(confirmedPublication(
      publishedSchedule.identity.processInstanceId,
      stored,
    ));

    const activeMessage = messageRecord(stored, "message\u0000😀", "message-active");
    await messages.reserve(activeMessage);
    const unpublishedMessage = messageRecord(
      stored,
      "message-terminal",
      "message-unpublished",
    );
    await messages.reserve(unpublishedMessage);
    await storeAcceptedMessage(messages, unpublishedMessage.publicationId);
    const publishedMessage = messageRecord(
      stored,
      "message-published",
      "message-published-instance",
    );
    await messages.reserve(publishedMessage);
    await storeAcceptedMessage(messages, publishedMessage.publicationId);
    await confirmed.confirm(confirmedPublication(
      publishedMessage.identity.processInstanceId,
      stored,
    ));

    assert.deepEqual(
      await decoded(source, DefinitionsRecoveryFamily.ConfirmedRegistration),
      [
        "confirmed\u0000😀",
        "message-published-instance",
        "schedule-published-instance",
      ],
    );
    assert.deepEqual(
      await decoded(source, DefinitionsRecoveryFamily.DirectStart),
      directIds.sort(compareUtf8),
    );
    assert.deepEqual(
      await decoded(source, DefinitionsRecoveryFamily.Schedule),
      [
        activeSchedule.reference,
        unpublishedSchedule.reference,
      ].sort(compareSchedule),
    );
    assert.deepEqual(
      await decoded(source, DefinitionsRecoveryFamily.MessageStart),
      [activeMessage.publicationId, unpublishedMessage.publicationId].sort(compareUtf8),
    );
    assert.equal(
      (await source.listCandidateKeys(DefinitionsRecoveryFamily.DirectStart, 1)).length,
      1,
    );

    await confirmed.compareAndSetState(
      "direct-A",
      ConfirmedProcessInstanceState.Reserved,
      ConfirmedProcessInstanceState.Starting,
    );
    await confirmed.compareAndSetState(
      "direct-A",
      ConfirmedProcessInstanceState.Starting,
      ConfirmedProcessInstanceState.Confirmed,
    );
    let staleHostCalls = 0;
    await new ConfirmedProcessInstancePublicationService({
      repository: confirmed,
      operate: { recordConfirmedProcessInstance: async () => undefined },
      work: { recordConfirmedProcessInstance: async () => undefined },
    }).reconcileDirectProcessInstance("direct-A", {
      start: async () => {
        staleHostCalls += 1;
        return { status: "started" };
      },
      describe: async () => {
        staleHostCalls += 1;
        return { status: "matching" };
      },
    });
    assert.equal(staleHostCalls, 0);
    assert.equal((await runtime.query({ text: "SELECT 1" })).rowCount, 1);
  });
}

async function decoded(
  source: PostgresqlDefinitionsRecoveryCandidateSource,
  family: typeof DefinitionsRecoveryFamily[keyof typeof DefinitionsRecoveryFamily],
) {
  return (await source.listCandidateKeys(family, 100)).map((key) => {
    const candidate = decodeDefinitionsRecoveryCandidateKey(family, key);
    switch (candidate.family) {
      case DefinitionsRecoveryFamily.ConfirmedRegistration:
      case DefinitionsRecoveryFamily.DirectStart:
        return candidate.processInstanceId;
      case DefinitionsRecoveryFamily.Schedule:
        return candidate.reference;
      case DefinitionsRecoveryFamily.MessageStart:
        return candidate.publicationId;
      default:
        return assertNever(candidate);
    }
  });
}

async function seedDefinition(
  runtime: PostgresqlRuntime,
  artifacts: PostgresqlExactArtifactStore,
): Promise<DefinitionMetadata> {
  const bytes = new TextEncoder().encode("recovery candidate definition");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await artifacts.put({ sha256, bytes });
  return await new PostgresqlDefinitionRepository(runtime).allocateNext({
    processId: "Process\u0000Recovery",
    source: {
      kind: "bpmnSource",
      id: "recovery\u0000definition.bpmn",
      sha256,
      byteLength: bytes.byteLength,
      declaredEncoding: null,
      decodedAs: "UTF-8",
    },
    semanticProfile: "recovery-profile",
    startCapabilities: {
      timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
      messageStarts: [{
        startEventId: "MessageStart",
        channel: {
          kind: "operationMessage",
          interfaceId: "Orders",
          interfaceOperationId: "Submit",
          messageId: "Order",
        },
      }],
    },
  });
}

function confirmedPublication(processInstanceId: string, definition: DefinitionMetadata) {
  return {
    instance: {
      processInstanceId,
      definition: structuredClone(definition),
    },
    locator: `locator:${processInstanceId}`,
  };
}

function directReservation(processInstanceId: string, definition: DefinitionMetadata) {
  return {
    ...confirmedPublication(processInstanceId, definition),
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "d".repeat(64),
    },
  };
}

function scheduleRecord(
  definition: DefinitionMetadata,
  scheduleId: string,
  processInstanceId: string,
): NewDefinitionScheduleRecord {
  return {
    reference: { processId: definition.processId, version: definition.version, scheduleId },
    definition: structuredClone(definition),
    timerStart: { startEventId: "TimerStart", durationMs: 1_000 },
    activationAt: "2026-08-17T10:00:00.000Z",
    dueAt: "2026-08-17T10:00:01.000Z",
    identity: {
      processInstanceId,
      hostScheduleId: `host:${scheduleId}`,
      configuredWorkflowIdBase: `workflow:${scheduleId}`,
    },
  };
}

async function storeStartedSchedule(
  repository: PostgresqlDefinitionScheduleRepository,
  record: NewDefinitionScheduleRecord,
): Promise<void> {
  await repository.reserve(record);
  await repository.compareAndSet(
    record.reference,
    "creating",
    { state: "creatingHost" },
  );
  await repository.compareAndSet(
    record.reference,
    "creatingHost",
    {
      state: "started",
      processLocator:
        `bpmn-process-work-v1:execution%3A${record.reference.scheduleId}`,
    },
  );
  await repository.markCleanupComplete(record.reference, "started");
}

function messageRecord(
  definition: DefinitionMetadata,
  publicationId: string,
  processInstanceId: string,
): NewMessageStartPublicationRecord {
  const messageStart = definition.startCapabilities.messageStarts[0];
  assert(messageStart !== undefined);
  return {
    publicationId,
    definition: structuredClone(definition),
    messageStart: structuredClone(messageStart),
    identity: {
      processInstanceId,
      commandId: `command:${publicationId}`,
      workflowId: `workflow:${publicationId}`,
    },
    intent: { protocol: "message-start-v1", intentSha256: "c".repeat(64) },
  };
}

async function storeAcceptedMessage(
  repository: PostgresqlMessageStartPublicationRepository,
  publicationId: string,
): Promise<void> {
  await repository.compareAndSet(
    publicationId,
    MessageStartPublicationState.Reserved,
    MessageStartPublicationState.Starting,
  );
  await repository.compareAndSet(
    publicationId,
    MessageStartPublicationState.Starting,
    MessageStartPublicationState.Accepted,
  );
}

async function resetDatabase(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.message_start_publications,
        bpmn_platform.definition_schedules,
        bpmn_platform.confirmed_process_instances,
        bpmn_platform.definition_diagram_presentations,
        bpmn_platform.definition_versions,
        bpmn_platform.definition_version_heads,
        bpmn_platform.exact_artifacts
    `,
  });
}

function createTestRuntime(connectionString: string): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName: "definitions-recovery-candidates",
    maxConnections: 4,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 4_000,
    statementTimeoutMs: 4_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 4_000,
  });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function compareSchedule(
  left: DefinitionScheduleReference,
  right: DefinitionScheduleReference,
): number {
  return compareUtf8(left.processId, right.processId) ||
    left.version - right.version ||
    compareUtf8(left.scheduleId, right.scheduleId);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported test recovery candidate: ${String(value)}`);
}
