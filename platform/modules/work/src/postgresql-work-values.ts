import type { PostgresqlRow } from "@bpmn-lean/platform-postgresql-runtime";

import { WorkRepositoryIntegrityError } from "./work-contracts.js";
import type {
  StoredWorkClaimReleaseAction,
  StoredWorkCompletionAction,
  WorkAuditOutboxItem,
  WorkClaimSnapshot,
  WorkProcessRegistration,
  WorkTaskReference,
} from "./work-contracts.js";
import {
  decodeStoredAuditEvent,
  decodeStoredClaimReleaseAction,
  decodeStoredCompletionAction,
  decodeStoredPublicInstance,
  requireNonnegativeSafeInteger,
  requireObservation,
  requirePositiveSafeInteger,
  requireString,
  sameJson,
} from "./work-repository-values.js";

export function encodePostgresqlWorkText(value: string, label: string): Buffer {
  return Buffer.from(requireString(value, label), "utf8");
}

export function decodePostgresqlWorkText(value: unknown, label: string): string {
  if (!Buffer.isBuffer(value)) throw new TypeError(`${label} must be PostgreSQL bytea`);
  const decoded = value.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(value)) {
    throw new TypeError(`${label} must contain exact well-formed UTF-8`);
  }
  return requireString(decoded, label);
}

export function taskSqlValues(task: WorkTaskReference): readonly unknown[] {
  return [
    encodePostgresqlWorkText(task.hostingProcessInstanceId, "hostingProcessInstanceId"),
    encodePostgresqlWorkText(task.taskId.processInstanceId, "task processInstanceId"),
    encodePostgresqlWorkText(task.taskId.elementId, "task elementId"),
    task.taskId.activation,
  ];
}

export function decodePostgresqlRegistration(row: PostgresqlRow): WorkProcessRegistration {
  const processInstanceId = decodePostgresqlWorkText(
    row.process_instance_id,
    "process_instance_id",
  );
  const instance = decodeStoredPublicInstance(row.public_instance_json);
  if (instance.processInstanceId !== processInstanceId) {
    throw new WorkRepositoryIntegrityError("stored Process identity disagrees with key");
  }
  return {
    instance,
    locator: decodePostgresqlWorkText(row.work_locator, "work_locator"),
    observation: requireObservation(row.observation),
  };
}

export function decodePostgresqlClaim(row: PostgresqlRow): WorkClaimSnapshot {
  const generation = requireNonnegativeSafeInteger(
    numeric(row.claim_generation),
    "claim_generation",
  );
  return {
    claimGeneration: generation,
    claim: row.actor_id === null
      ? null
      : {
        actorId: decodePostgresqlWorkText(row.actor_id, "actor_id"),
        generation,
      },
  };
}

export function decodePostgresqlAction(row: PostgresqlRow): StoredWorkClaimReleaseAction {
  return decodeStoredClaimReleaseAction(
    decodePostgresqlWorkText(row.action_id, "action_id"),
    row.action_kind,
    decodePostgresqlWorkText(row.actor_id, "actor_id"),
    decodePostgresqlWorkText(
      row.hosting_process_instance_id,
      "hosting_process_instance_id",
    ),
    decodePostgresqlWorkText(
      row.task_process_instance_id,
      "task_process_instance_id",
    ),
    decodePostgresqlWorkText(row.element_id, "element_id"),
    numeric(row.activation),
    numeric(row.input_generation),
    row.result_json,
  );
}

export function decodePostgresqlCompletion(row: PostgresqlRow): StoredWorkCompletionAction {
  const action = decodeStoredCompletionAction(
    row.binding_json,
    row.state,
    row.result_json,
  );
  const redundant = {
    actionId: decodePostgresqlWorkText(row.action_id, "action_id"),
    actorId: decodePostgresqlWorkText(row.actor_id, "actor_id"),
    task: {
      hostingProcessInstanceId: decodePostgresqlWorkText(
        row.hosting_process_instance_id,
        "hosting_process_instance_id",
      ),
      taskId: {
        processInstanceId: decodePostgresqlWorkText(
          row.task_process_instance_id,
          "task_process_instance_id",
        ),
        elementId: decodePostgresqlWorkText(row.element_id, "element_id"),
        activation: requirePositiveSafeInteger(numeric(row.activation), "activation"),
      },
    },
    claimGeneration: requirePositiveSafeInteger(
      numeric(row.claim_generation),
      "claim_generation",
    ),
  };
  const binding = action.binding;
  if (
    binding.actionId !== redundant.actionId ||
    binding.actorId !== redundant.actorId ||
    binding.claimGeneration !== redundant.claimGeneration ||
    !sameJson(binding.task, redundant.task)
  ) {
    throw new WorkRepositoryIntegrityError(
      "stored completion binding disagrees with redundant columns",
    );
  }
  return action;
}

export function decodePostgresqlOutbox(row: PostgresqlRow): WorkAuditOutboxItem {
  const ordinal = requirePositiveSafeInteger(numeric(row.ordinal), "outbox ordinal");
  const event = decodeStoredAuditEvent(row.event_json);
  if (
    event.eventId !== decodePostgresqlWorkText(row.event_id, "event_id") ||
    event.action.actionId !== decodePostgresqlWorkText(row.action_id, "action_id") ||
    event.action.outcome !== requireString(row.action_outcome, "action_outcome")
  ) {
    throw new WorkRepositoryIntegrityError(
      "stored audit event disagrees with redundant columns",
    );
  }
  return { ordinal, event };
}

export function numeric(value: unknown): unknown {
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)) {
    return Number(value);
  }
  return value;
}
