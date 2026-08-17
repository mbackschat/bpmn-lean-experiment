import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";

import { WorkRepositoryIntegrityError } from "./work-contracts.js";
import type {
  ConfirmedProcessWorkPublication,
  StoredWorkClaimReleaseAction,
  StoredWorkCompletionAction,
  WorkAuditOutboxItem,
  WorkClaimSnapshot,
  WorkClaimTransitionInput,
  WorkClaimTransitionResult,
  WorkCompletionBinding,
  WorkCompletionOutcomeInput,
  WorkCompletionOutcomeResult,
  WorkCompletionReservationInput,
  WorkCompletionReservationResult,
  WorkCompletionSubmissionResult,
  WorkProcessObservation,
  WorkProcessRegistration,
  WorkReleaseTransitionInput,
  WorkReleaseTransitionResult,
  WorkTaskReference,
} from "./work-contracts.js";
import {
  decodePostgresqlClaim,
  decodePostgresqlOutbox,
  decodePostgresqlRegistration,
  encodePostgresqlWorkText,
  taskSqlValues,
} from "./postgresql-work-values.js";
import {
  applyRetainedClaim,
  applyRetainedRelease,
  claimSelectSql,
  insertAction,
  lockClaim,
  readAction,
  readCompletion,
  readRegistration,
  retryIdentityRace,
  taskPredicate,
  writeClaim,
  writeOutbox,
} from "./postgresql-work-storage.js";
import {
  completionResult,
  requireObservation,
  requireString,
  sameJson,
  snapshotCompletionBinding,
  snapshotPublication,
  snapshotTaskReference,
} from "./work-repository-values.js";
import {
  requireCompletionAudit,
  validateClaimInput,
  validateReleaseInput,
} from "./work-transition-values.js";

/** Shared PostgreSQL Work persistence over a runtime owned by its composition root. */
export class PostgresqlWorkRepository {
  constructor(private readonly runtime: PostgresqlRuntime) {}

  async recordConfirmedProcessInstance(
    publication: ConfirmedProcessWorkPublication,
  ): Promise<void> {
    const exact = snapshotPublication(publication);
    await this.runtime.transaction(async (session) => {
      await session.query({
        text: `
          INSERT INTO bpmn_platform.work_processes (
            process_instance_id, public_instance_json, work_locator, observation
          ) VALUES ($1, $2, $3, 'indeterminate')
          ON CONFLICT (process_instance_id) DO NOTHING
        `,
        values: [
          text(exact.instance.processInstanceId, "processInstanceId"),
          JSON.stringify(exact.instance),
          text(exact.locator, "locator"),
        ],
      });
      const row = await readRegistration(session, exact.instance.processInstanceId, true);
      if (row === null ||
          !sameJson(row.instance, exact.instance) ||
          row.locator !== exact.locator) {
        throw new WorkRepositoryIntegrityError(
          `confirmed Work registration ${exact.instance.processInstanceId} conflicts`,
        );
      }
    });
  }

  async listProcessRegistrations(): Promise<ReadonlyArray<WorkProcessRegistration>> {
    const result = await this.runtime.query({
      text: `
        SELECT * FROM bpmn_platform.work_processes
        ORDER BY process_instance_id ASC
      `,
    });
    return result.rows.map(decodePostgresqlRegistration);
  }

  async recordObservation(
    processInstanceId: string,
    observation: WorkProcessObservation,
  ): Promise<void> {
    const exactId = requireString(processInstanceId, "processInstanceId");
    const exactObservation = requireObservation(observation);
    const result = await this.runtime.query({
      text: `
        UPDATE bpmn_platform.work_processes
        SET observation = CASE
          WHEN observation = 'closed' THEN 'closed'
          ELSE $1
        END
        WHERE process_instance_id = $2
        RETURNING observation
      `,
      values: [exactObservation, text(exactId, "processInstanceId")],
    });
    if (result.rowCount !== 1) {
      throw new WorkRepositoryIntegrityError(`unknown Work registration ${exactId}`);
    }
  }

  async getClaim(task: WorkTaskReference): Promise<WorkClaimSnapshot> {
    const exact = snapshotTaskReference(task);
    const result = await this.runtime.query({
      text: `${claimSelectSql} WHERE ${taskPredicate(1)}`,
      values: taskSqlValues(exact),
    });
    const row = result.rows[0];
    return row === undefined
      ? { claimGeneration: 0, claim: null }
      : decodePostgresqlClaim(row);
  }

  async getClaimReleaseAction(
    actionId: string,
  ): Promise<StoredWorkClaimReleaseAction | null> {
    return await readAction(this.runtime, requireString(actionId, "actionId"), false);
  }

  async claimTask(input: WorkClaimTransitionInput): Promise<WorkClaimTransitionResult> {
    const task = snapshotTaskReference(input.task);
    validateClaimInput(input, task);
    return await retryIdentityRace(async () =>
      await this.runtime.transaction(async (session) => {
        const retained = await readAction(session, input.actionId, true);
        if (retained !== null) {
          return await applyRetainedClaim(session, input, task, retained);
        }
        const current = await lockClaim(session, task);
        const concurrent = await readAction(session, input.actionId, true);
        if (concurrent !== null) {
          return await applyRetainedClaim(session, input, task, concurrent, current);
        }
        if (current.claim !== null || current.claimGeneration !== input.expectedGeneration) {
          await writeOutbox(session, input.audit.conflict);
          return { kind: "conflict" };
        }
        const generation = current.claimGeneration + 1;
        const result = {
          taskId: task.taskId,
          claim: { actorId: input.actorId, generation },
        };
        await writeClaim(session, task, generation, input.actorId);
        await insertAction(
          session,
          input.actionId,
          "claim",
          input.actorId,
          task,
          input.expectedGeneration,
          result,
        );
        await writeOutbox(session, input.audit.claimed);
        return { kind: "claimed", result };
      }),
    );
  }

  async releaseTask(input: WorkReleaseTransitionInput): Promise<WorkReleaseTransitionResult> {
    const task = snapshotTaskReference(input.task);
    validateReleaseInput(input, task);
    return await retryIdentityRace(async () =>
      await this.runtime.transaction(async (session) => {
        const retained = await readAction(session, input.actionId, true);
        if (retained !== null) {
          return await applyRetainedRelease(session, input, task, retained);
        }
        const current = await lockClaim(session, task);
        const concurrent = await readAction(session, input.actionId, true);
        if (concurrent !== null) {
          return await applyRetainedRelease(session, input, task, concurrent);
        }
        if (current.claim === null) return { kind: "notFound" };
        if (current.claim.actorId !== input.actorId ||
            current.claim.generation !== input.generation) {
          await writeOutbox(session, input.audit.conflict);
          return { kind: "conflict" };
        }
        const generation = current.claimGeneration + 1;
        const result = { taskId: task.taskId, claimGeneration: generation, released: true as const };
        await writeClaim(session, task, generation, null);
        await insertAction(
          session,
          input.actionId,
          "release",
          input.actorId,
          task,
          input.generation,
          result,
        );
        await writeOutbox(session, input.audit.released);
        return { kind: "released", result };
      }),
    );
  }

  async getCompletionAction(actionId: string): Promise<StoredWorkCompletionAction | null> {
    return await readCompletion(
      this.runtime,
      requireString(actionId, "actionId"),
      false,
    );
  }

  async reserveCompletion(
    input: WorkCompletionReservationInput,
  ): Promise<WorkCompletionReservationResult> {
    const binding = snapshotCompletionBinding(input.binding);
    requireCompletionAudit(input.audit, binding, "reserved");
    return await retryIdentityRace(async () =>
      await this.runtime.transaction(async (session) => {
        const retained = await readCompletion(session, binding.actionId, true);
        if (retained !== null) {
          return sameJson(retained.binding, binding)
            ? { kind: "retained", action: retained }
            : { kind: "conflict" };
        }
        const claim = await lockClaim(session, binding.task);
        const concurrent = await readCompletion(session, binding.actionId, true);
        if (concurrent !== null) {
          return sameJson(concurrent.binding, binding)
            ? { kind: "retained", action: concurrent }
            : { kind: "conflict" };
        }
        if (claim.claim?.actorId !== binding.actorId ||
            claim.claim.generation !== binding.claimGeneration) {
          return { kind: "notFound" };
        }
        const active = await session.query({
          text: `
            SELECT action_id FROM bpmn_platform.work_completions
            WHERE ${taskPredicate(1)} AND claim_generation = $5
              AND state IN ('reserved', 'submitting', 'indeterminate')
            FOR UPDATE
          `,
          values: [...taskSqlValues(binding.task), binding.claimGeneration],
        });
        if (active.rows.length !== 0) return { kind: "conflict" };
        await session.query({
          text: `
            INSERT INTO bpmn_platform.work_completions (
              action_id, actor_id, hosting_process_instance_id,
              task_process_instance_id, element_id, activation,
              claim_generation, binding_json, state, result_json
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved', NULL)
          `,
          values: [
            text(binding.actionId, "actionId"),
            text(binding.actorId, "actorId"),
            ...taskSqlValues(binding.task),
            binding.claimGeneration,
            JSON.stringify(binding),
          ],
        });
        await writeOutbox(session, input.audit);
        return {
          kind: "reserved",
          action: { binding, state: "reserved", result: null },
        };
      }),
    );
  }

  async beginCompletionSubmission(
    actionId: string,
    expectedBinding: WorkCompletionBinding,
  ): Promise<WorkCompletionSubmissionResult> {
    const binding = snapshotCompletionBinding(expectedBinding);
    if (binding.actionId !== actionId) return { kind: "conflict" };
    return await this.runtime.transaction(async (session) => {
      const action = await readCompletion(session, actionId, true);
      if (action === null || !sameJson(action.binding, binding)) return { kind: "conflict" };
      switch (action.state) {
        case "reserved":
        case "indeterminate":
          await session.query({
            text: `
              UPDATE bpmn_platform.work_completions
              SET state = 'submitting'
              WHERE action_id = $1
            `,
            values: [text(actionId, "actionId")],
          });
          return { kind: "acquired", action: { ...action, state: "submitting" } };
        case "submitting":
        case "committed":
        case "rejected":
          return { kind: "retained", action };
      }
    });
  }

  async recordCompletionOutcome(
    input: WorkCompletionOutcomeInput,
  ): Promise<WorkCompletionOutcomeResult> {
    const binding = snapshotCompletionBinding(input.binding);
    const result = completionResult(binding, input.outcome);
    requireCompletionAudit(input.audit, binding, result.state);
    return await this.runtime.transaction(async (session) => {
      const observed = await readCompletion(session, binding.actionId, false);
      if (observed === null || !sameJson(observed.binding, binding)) return { kind: "conflict" };
      const claim = await lockClaim(session, binding.task);
      const current = await readCompletion(session, binding.actionId, true);
      if (current === null || !sameJson(current.binding, binding)) return { kind: "conflict" };
      if (current.state === "committed" || current.state === "rejected") {
        return sameJson(current.result, result)
          ? { kind: "retained", action: current }
          : { kind: "conflict" };
      }
      if (current.state === "indeterminate" && result.state === "indeterminate") {
        await writeOutbox(session, input.audit);
        return { kind: "retained", action: current };
      }
      if (current.state !== "submitting") return { kind: "conflict" };
      await session.query({
        text: `
          UPDATE bpmn_platform.work_completions
          SET state = $1, result_json = $2
          WHERE action_id = $3
        `,
        values: [result.state, JSON.stringify(result), text(binding.actionId, "actionId")],
      });
      if (result.state === "committed" ||
          (result.state === "rejected" && result.engineResult.kind === "processClosed")) {
        if (claim.claim !== null) {
          await writeClaim(session, binding.task, claim.claimGeneration + 1, null);
        }
      }
      if (result.state === "rejected" && result.engineResult.kind === "processClosed") {
        const changed = await session.query({
          text: `
            UPDATE bpmn_platform.work_processes SET observation = 'closed'
            WHERE process_instance_id = $1
          `,
          values: [text(binding.task.hostingProcessInstanceId, "processInstanceId")],
        });
        if (changed.rowCount !== 1) {
          throw new WorkRepositoryIntegrityError("completion refers to an unknown registration");
        }
      }
      await writeOutbox(session, input.audit);
      return { kind: "recorded", action: { binding, state: result.state, result } };
    });
  }

  async listUndeliveredAuditEvents(): Promise<ReadonlyArray<WorkAuditOutboxItem>> {
    const result = await this.runtime.query({
      text: `
        SELECT * FROM bpmn_platform.work_audit_outbox
        WHERE delivered = false ORDER BY ordinal ASC
      `,
    });
    return result.rows.map(decodePostgresqlOutbox);
  }

  async acknowledgeAuditEvent(eventId: string): Promise<void> {
    const result = await this.runtime.query({
      text: `
        UPDATE bpmn_platform.work_audit_outbox
        SET delivered = true WHERE event_id = $1
      `,
      values: [text(eventId, "eventId")],
    });
    if (result.rowCount !== null && result.rowCount > 1) {
      throw new WorkRepositoryIntegrityError("audit acknowledgement changed multiple rows");
    }
  }
}

function text(value: string, label: string): Buffer {
  return encodePostgresqlWorkText(value, label);
}
