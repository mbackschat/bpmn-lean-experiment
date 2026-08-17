import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";
import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import { WorkRepositoryIntegrityError } from "./work-contracts.js";
import type {
  StoredWorkClaimReleaseAction,
  StoredWorkCompletionAction,
  WorkClaimSnapshot,
  WorkClaimTransitionInput,
  WorkClaimTransitionResult,
  WorkProcessRegistration,
  WorkReleaseTransitionInput,
  WorkReleaseTransitionResult,
  WorkTaskReference,
} from "./work-contracts.js";
import {
  decodePostgresqlAction,
  decodePostgresqlClaim,
  decodePostgresqlCompletion,
  decodePostgresqlRegistration,
  encodePostgresqlWorkText,
  taskSqlValues,
} from "./postgresql-work-values.js";
import {
  decodeStoredAuditEvent,
  requireString,
  sameJson,
  snapshotAuditEvent,
} from "./work-repository-values.js";
import {
  isStoredClaimAction,
  isStoredReleaseAction,
  sameAuditLogicalEvent,
} from "./work-transition-values.js";

export const claimSelectSql = `
  SELECT claim_generation, actor_id
  FROM bpmn_platform.work_claims
`;

export function taskPredicate(start: number): string {
  return `hosting_process_instance_id = $${start}
    AND task_process_instance_id = $${start + 1}
    AND element_id = $${start + 2}
    AND activation = $${start + 3}`;
}

export async function readRegistration(
  session: PostgresqlSession,
  processInstanceId: string,
  lock: boolean,
): Promise<WorkProcessRegistration | null> {
  const result = await session.query({
    text: `
      SELECT * FROM bpmn_platform.work_processes
      WHERE process_instance_id = $1${lock ? " FOR UPDATE" : ""}
    `,
    values: [text(processInstanceId, "processInstanceId")],
  });
  return result.rows[0] === undefined ? null : decodePostgresqlRegistration(result.rows[0]);
}

export async function readAction(
  session: PostgresqlSession,
  actionId: string,
  lock: boolean,
): Promise<StoredWorkClaimReleaseAction | null> {
  const result = await session.query({
    text: `
      SELECT * FROM bpmn_platform.work_actions
      WHERE action_id = $1${lock ? " FOR UPDATE" : ""}
    `,
    values: [text(actionId, "actionId")],
  });
  return result.rows[0] === undefined ? null : decodePostgresqlAction(result.rows[0]);
}

export async function readCompletion(
  session: PostgresqlSession,
  actionId: string,
  lock: boolean,
): Promise<StoredWorkCompletionAction | null> {
  const result = await session.query({
    text: `
      SELECT * FROM bpmn_platform.work_completions
      WHERE action_id = $1${lock ? " FOR UPDATE" : ""}
    `,
    values: [text(actionId, "actionId")],
  });
  return result.rows[0] === undefined ? null : decodePostgresqlCompletion(result.rows[0]);
}

export async function lockClaim(
  session: PostgresqlSession,
  task: WorkTaskReference,
): Promise<WorkClaimSnapshot> {
  await session.query({
    text: `
      INSERT INTO bpmn_platform.work_claims (
        hosting_process_instance_id, task_process_instance_id, element_id,
        activation, claim_generation, actor_id
      ) VALUES ($1, $2, $3, $4, 0, NULL)
      ON CONFLICT DO NOTHING
    `,
    values: taskSqlValues(task),
  });
  const result = await session.query({
    text: `${claimSelectSql} WHERE ${taskPredicate(1)} FOR UPDATE`,
    values: taskSqlValues(task),
  });
  const row = result.rows[0];
  if (row === undefined) throw new WorkRepositoryIntegrityError("claim row disappeared");
  return decodePostgresqlClaim(row);
}

export async function writeClaim(
  session: PostgresqlSession,
  task: WorkTaskReference,
  generation: number,
  actorId: string | null,
): Promise<void> {
  const result = await session.query({
    text: `
      UPDATE bpmn_platform.work_claims
      SET claim_generation = $5, actor_id = $6
      WHERE ${taskPredicate(1)}
    `,
    values: [
      ...taskSqlValues(task),
      generation,
      actorId === null ? null : text(actorId, "actorId"),
    ],
  });
  if (result.rowCount !== 1) throw new WorkRepositoryIntegrityError("claim update lost its row");
}

export async function insertAction(
  session: PostgresqlSession,
  actionId: string,
  kind: "claim" | "release",
  actorId: string,
  task: WorkTaskReference,
  generation: number,
  result: unknown,
): Promise<void> {
  await session.query({
    text: `
      INSERT INTO bpmn_platform.work_actions (
        action_id, action_kind, actor_id, hosting_process_instance_id,
        task_process_instance_id, element_id, activation, input_generation, result_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    values: [
      text(actionId, "actionId"),
      kind,
      text(actorId, "actorId"),
      ...taskSqlValues(task),
      generation,
      JSON.stringify(result),
    ],
  });
}

export async function applyRetainedClaim(
  session: PostgresqlSession,
  input: WorkClaimTransitionInput,
  task: WorkTaskReference,
  retained: StoredWorkClaimReleaseAction,
  lockedCurrent?: WorkClaimSnapshot,
): Promise<WorkClaimTransitionResult> {
  const expected = {
    actionId: input.actionId,
    actorId: input.actorId,
    task,
    kind: "claim" as const,
    expectedGeneration: input.expectedGeneration,
  };
  if (!isStoredClaimAction(retained) || !sameJson(retained.binding, expected)) {
    await writeOutbox(session, input.audit.conflict);
    return { kind: "conflict" };
  }
  const current = lockedCurrent ?? await lockClaim(session, task);
  const generation = retained.result.claim.generation;
  if (current.claim === null ||
      current.claim.actorId !== retained.binding.actorId ||
      current.claim.generation !== generation ||
      current.claimGeneration !== generation) {
    return { kind: "conflict" };
  }
  await writeOutbox(session, input.audit.idempotent);
  return { kind: "idempotent", result: retained.result };
}

export async function applyRetainedRelease(
  session: PostgresqlSession,
  input: WorkReleaseTransitionInput,
  task: WorkTaskReference,
  retained: StoredWorkClaimReleaseAction,
): Promise<WorkReleaseTransitionResult> {
  const expected = {
    actionId: input.actionId,
    actorId: input.actorId,
    task,
    kind: "release" as const,
    generation: input.generation,
  };
  if (!isStoredReleaseAction(retained) || !sameJson(retained.binding, expected)) {
    await writeOutbox(session, input.audit.conflict);
    return { kind: "conflict" };
  }
  await writeOutbox(session, input.audit.idempotent);
  return { kind: "idempotent", result: retained.result };
}

export async function writeOutbox(
  session: PostgresqlSession,
  event: WorkAuditEvent,
): Promise<void> {
  const exact = snapshotAuditEvent(event);
  const encoded = JSON.stringify(exact);
  await session.query({
    text: `
      SELECT head FROM bpmn_platform.work_audit_source_head
      WHERE singleton = true FOR UPDATE
    `,
  });
  const existing = await session.query({
    text: `
      SELECT event_json FROM bpmn_platform.work_audit_outbox
      WHERE event_id = $1
    `,
    values: [text(exact.eventId, "eventId")],
  });
  if (existing.rows[0] !== undefined) {
    if (requireString(existing.rows[0].event_json, "stored event_json") !== encoded) {
      throw new WorkRepositoryIntegrityError(`audit event ${exact.eventId} conflicts`);
    }
    return;
  }
  const logical = await session.query({
    text: `
      SELECT event_json FROM bpmn_platform.work_audit_outbox
      WHERE action_id = $1 AND action_outcome = $2
    `,
    values: [text(exact.action.actionId, "actionId"), exact.action.outcome],
  });
  if (logical.rows[0] !== undefined) {
    const retained = decodeStoredAuditEvent(logical.rows[0].event_json);
    if (!sameAuditLogicalEvent(retained, exact)) {
      throw new WorkRepositoryIntegrityError(
        `audit outcome ${exact.action.actionId}/${exact.action.outcome} conflicts`,
      );
    }
    return;
  }
  const allocation = await session.query({
    text: `
      UPDATE bpmn_platform.work_audit_source_head
      SET head = head + 1
      WHERE singleton = true
      RETURNING head AS ordinal
    `,
  });
  const ordinal = allocation.rows[0]?.ordinal;
  if (ordinal === undefined) {
    throw new WorkRepositoryIntegrityError("Work audit source head is missing");
  }
  await session.query({
    text: `
      INSERT INTO bpmn_platform.work_audit_outbox (
        ordinal, event_id, action_id, action_outcome, event_json, delivered
      ) VALUES ($1, $2, $3, $4, $5, false)
    `,
    values: [
      ordinal,
      text(exact.eventId, "eventId"),
      text(exact.action.actionId, "actionId"),
      exact.action.outcome,
      encoded,
    ],
  });
}

export async function retryIdentityRace<Result>(
  run: () => Promise<Result>,
): Promise<Result> {
  try {
    return await run();
  } catch (error: unknown) {
    if (postgresqlCode(error) !== "23505") throw error;
    return await run();
  }
}

function text(value: string, label: string): Buffer {
  return encodePostgresqlWorkText(value, label);
}

function postgresqlCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}
