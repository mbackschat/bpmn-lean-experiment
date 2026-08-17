import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { PostgresqlExactArtifactStore } from "@bpmn-lean/platform-artifact-store";
import { PostgresqlDefinitionRepository } from "@bpmn-lean/platform-definitions";
import type {
  ConfirmedProcessInstancePublication,
  DefinitionMetadata,
  NewDefinitionScheduleRecord,
  NewMessageStartPublicationRecord,
} from "@bpmn-lean/platform-definitions";
import { createPostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  PostgresqlDefinitionsRecoveryIntermediateResult,
  PostgresqlDefinitionsRecoveryStepKind,
} from "../../../dist/postgresql-definitions-recovery-step.js";
import type {
  PostgresqlDefinitionsRecoveryStepResult,
} from "../../../dist/postgresql-definitions-recovery-step.js";
import {
  encodeDefinitionsRecoveryCandidateKey,
  DefinitionsRecoveryFamily,
} from "../../../dist/postgresql-definitions-recovery-candidate-source.js";

export async function continueIntermediate(
  runtime: PostgresqlRuntime,
  step: PostgresqlDefinitionsRecoveryStepResult,
): Promise<PostgresqlDefinitionsRecoveryStepResult> {
  assert.equal(step.kind, PostgresqlDefinitionsRecoveryStepKind.Intermediate);
  if (step.kind !== PostgresqlDefinitionsRecoveryStepKind.Intermediate) {
    throw new TypeError("expected an intermediate recovery step");
  }
  assert.equal(
    await applyIntermediateFence(runtime, step),
    PostgresqlDefinitionsRecoveryIntermediateResult.Applied,
  );
  return await step.continue();
}

export async function applyIntermediateFence(
  runtime: PostgresqlRuntime,
  step: Extract<PostgresqlDefinitionsRecoveryStepResult, { kind: "intermediate" }>,
) {
  return await runtime.transaction(
    async (session) => await step.applyWhileOwned(session),
  );
}

export async function apply(
  runtime: PostgresqlRuntime,
  step: PostgresqlDefinitionsRecoveryStepResult,
): Promise<void> {
  assert.equal(step.kind, PostgresqlDefinitionsRecoveryStepKind.Complete);
  if (step.kind !== PostgresqlDefinitionsRecoveryStepKind.Complete) return;
  await runtime.transaction(async (session) => await step.apply(session));
}

export function subscriber(
  target: "operate" | "work",
  calls: string[],
) {
  return {
    recordConfirmedProcessInstance: async (
      session: PostgresqlSession,
      publication: ConfirmedProcessInstancePublication,
    ) => {
      calls.push(target);
      if (target === "operate") {
        await insertOperate(session, publication);
      } else {
        await insertWork(session, publication);
      }
    },
  };
}

async function insertOperate(
  session: PostgresqlSession,
  publication: ConfirmedProcessInstancePublication,
): Promise<void> {
  const control = await session.query({
    text: `
      SELECT population_head
      FROM bpmn_platform.operate_incident_snapshot_control
      WHERE singleton = true
      FOR UPDATE
    `,
  });
  const populationHead = Number(control.rows[0]?.population_head);
  assert.equal(Number.isSafeInteger(populationHead) && populationHead >= 0, true);
  const nextOrdinal = populationHead + 1;
  const inserted = await session.query({
    text: `
      INSERT INTO bpmn_platform.operate_process_instances (
        process_instance_id, process_id, definition_version, source_sha256,
        public_identity_json, process_locator, observation, population_ordinal
      ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
      ON CONFLICT DO NOTHING
      RETURNING population_ordinal
    `,
    values: [
      bytes(publication.instance.processInstanceId),
      bytes(publication.instance.definition.processId),
      publication.instance.definition.version,
      publication.instance.definition.source.sha256,
      JSON.stringify(publication.instance),
      bytes(publication.locator),
      nextOrdinal,
    ],
  });
  if (inserted.rowCount === 1) {
    const changed = await session.query({
      text: `
        UPDATE bpmn_platform.operate_incident_snapshot_control
        SET population_head = $1
        WHERE singleton = true AND population_head = $2
      `,
      values: [nextOrdinal, populationHead],
    });
    assert.equal(changed.rowCount, 1);
  }
  await requireExactSubscriber(session, "operate", publication);
}

async function insertWork(
  session: PostgresqlSession,
  publication: ConfirmedProcessInstancePublication,
): Promise<void> {
  const control = await session.query({
    text: `
      SELECT population_head
      FROM bpmn_platform.work_snapshot_control
      WHERE singleton = true
      FOR UPDATE
    `,
  });
  const populationHead = Number(control.rows[0]?.population_head);
  assert.equal(Number.isSafeInteger(populationHead) && populationHead >= 0, true);
  const nextOrdinal = populationHead + 1;
  const inserted = await session.query({
    text: `
      INSERT INTO bpmn_platform.work_processes (
        process_instance_id, public_instance_json, work_locator,
        observation, population_ordinal
      ) VALUES ($1, $2, $3, 'indeterminate', $4)
      ON CONFLICT DO NOTHING
      RETURNING population_ordinal
    `,
    values: [
      bytes(publication.instance.processInstanceId),
      JSON.stringify(publication.instance),
      bytes(publication.locator),
      nextOrdinal,
    ],
  });
  if (inserted.rowCount === 1) {
    const changed = await session.query({
      text: `
        UPDATE bpmn_platform.work_snapshot_control
        SET population_head = $1
        WHERE singleton = true AND population_head = $2
      `,
      values: [nextOrdinal, populationHead],
    });
    assert.equal(changed.rowCount, 1);
  }
  await requireExactSubscriber(session, "work", publication);
}

async function requireExactSubscriber(
  session: PostgresqlSession,
  target: "operate" | "work",
  publication: ConfirmedProcessInstancePublication,
): Promise<void> {
  const table = target === "operate" ? "operate_process_instances" : "work_processes";
  const identity = target === "operate" ? "public_identity_json" : "public_instance_json";
  const locator = target === "operate" ? "process_locator" : "work_locator";
  const row = (await session.query({
    text: `SELECT ${identity}, ${locator} FROM bpmn_platform.${table}
      WHERE process_instance_id = $1 FOR UPDATE`,
    values: [bytes(publication.instance.processInstanceId)],
  })).rows[0];
  assert.equal(row?.[identity], JSON.stringify(publication.instance));
  assert.deepEqual(row?.[locator], bytes(publication.locator));
}

export async function registered(
  runtime: PostgresqlRuntime,
  target: "operate" | "work",
  processInstanceId: string,
): Promise<boolean> {
  const table = target === "operate" ? "operate_process_instances" : "work_processes";
  return (await runtime.query({
    text: `SELECT 1 FROM bpmn_platform.${table} WHERE process_instance_id = $1`,
    values: [bytes(processInstanceId)],
  })).rowCount === 1;
}

export async function registrationCounts(runtime: PostgresqlRuntime) {
  const operate = await runtime.query({
    text: "SELECT 1 FROM bpmn_platform.operate_process_instances",
  });
  const work = await runtime.query({
    text: "SELECT 1 FROM bpmn_platform.work_processes",
  });
  return { operate: operate.rowCount, work: work.rowCount };
}

export async function seedDefinition(
  runtime: PostgresqlRuntime,
  artifacts: PostgresqlExactArtifactStore,
): Promise<DefinitionMetadata> {
  const artifact = new TextEncoder().encode("lease-fenced recovery definition");
  const sha256 = createHash("sha256").update(artifact).digest("hex");
  await artifacts.put({ sha256, bytes: artifact });
  return await new PostgresqlDefinitionRepository(runtime).allocateNext({
    processId: "Recovery\u0000😀",
    source: {
      kind: "bpmnSource",
      id: "recovery\u0000😀.bpmn",
      sha256,
      byteLength: artifact.byteLength,
      declaredEncoding: null,
      decodedAs: "UTF-8",
    },
    semanticProfile: "recovery-profile",
    startCapabilities: {
      timerStarts: [{ startEventId: "Timer", durationMs: 1_000 }],
      messageStarts: [{
        startEventId: "Message",
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
export function confirmedPublication(
  processInstanceId: string,
  definition: DefinitionMetadata,
) {
  return {
    instance: { processInstanceId, definition: structuredClone(definition) },
    locator: `locator:${processInstanceId}`,
  };
}

export function directReservation(
  processInstanceId: string,
  definition: DefinitionMetadata,
) {
  return {
    ...confirmedPublication(processInstanceId, definition),
    intent: { protocol: "direct-start-v1", intentSha256: "d".repeat(64) },
  };
}

export function scheduleRecord(
  definition: DefinitionMetadata,
  scheduleId: string,
  processInstanceId: string,
): NewDefinitionScheduleRecord {
  return {
    reference: { processId: definition.processId, version: definition.version, scheduleId },
    definition: structuredClone(definition),
    timerStart: { startEventId: "Timer", durationMs: 1_000 },
    activationAt: "2026-08-17T10:00:00.000Z",
    dueAt: "2026-08-17T10:00:01.000Z",
    identity: {
      processInstanceId,
      hostScheduleId: `host:${scheduleId}`,
      configuredWorkflowIdBase: `workflow:${scheduleId}`,
    },
  };
}

export function messageRecord(
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

export function directKey(processInstanceId: string) {
  return encodeDefinitionsRecoveryCandidateKey({
    family: DefinitionsRecoveryFamily.DirectStart,
    processInstanceId,
  });
}

export function confirmedKey(processInstanceId: string) {
  return encodeDefinitionsRecoveryCandidateKey({
    family: DefinitionsRecoveryFamily.ConfirmedRegistration,
    processInstanceId,
  });
}

export function scheduleKey(record: NewDefinitionScheduleRecord) {
  return encodeDefinitionsRecoveryCandidateKey({
    family: DefinitionsRecoveryFamily.Schedule,
    reference: record.reference,
  });
}

export function messageKey(publicationId: string) {
  return encodeDefinitionsRecoveryCandidateKey({
    family: DefinitionsRecoveryFamily.MessageStart,
    publicationId,
  });
}

function bytes(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export async function resetDatabase(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.work_processes,
        bpmn_platform.operate_process_instances,
        bpmn_platform.message_start_publications,
        bpmn_platform.definition_schedules,
        bpmn_platform.confirmed_process_instances,
        bpmn_platform.definition_diagram_presentations,
        bpmn_platform.definition_versions,
        bpmn_platform.definition_version_heads,
        bpmn_platform.exact_artifacts
      CASCADE
    `,
  });
}

export function createTestRuntime(connectionString: string): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName: "definitions-recovery-steps",
    maxConnections: 4,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 4_000,
    statementTimeoutMs: 4_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 4_000,
  });
}
