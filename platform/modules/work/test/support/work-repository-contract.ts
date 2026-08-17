import assert from "node:assert/strict";
import { test } from "node:test";

import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";
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
} from "@bpmn-lean/platform-work";

export type ContractWorkRepository = Readonly<{
  recordConfirmedProcessInstance(publication: ConfirmedProcessWorkPublication): Promise<void>;
  listProcessRegistrations(): Promise<ReadonlyArray<WorkProcessRegistration>>;
  recordObservation(processInstanceId: string, observation: WorkProcessObservation): Promise<void>;
  getClaim(task: WorkTaskReference): Promise<WorkClaimSnapshot>;
  getClaimReleaseAction(actionId: string): Promise<StoredWorkClaimReleaseAction | null>;
  claimTask(input: WorkClaimTransitionInput): Promise<WorkClaimTransitionResult>;
  releaseTask(input: WorkReleaseTransitionInput): Promise<WorkReleaseTransitionResult>;
  getCompletionAction(actionId: string): Promise<StoredWorkCompletionAction | null>;
  reserveCompletion(input: WorkCompletionReservationInput): Promise<WorkCompletionReservationResult>;
  beginCompletionSubmission(
    actionId: string,
    binding: WorkCompletionBinding,
  ): Promise<WorkCompletionSubmissionResult>;
  recordCompletionOutcome(input: WorkCompletionOutcomeInput): Promise<WorkCompletionOutcomeResult>;
  listUndeliveredAuditEvents(): Promise<ReadonlyArray<WorkAuditOutboxItem>>;
  acknowledgeAuditEvent(eventId: string): Promise<void>;
}>;

type ContractHarness = Readonly<{
  first: ContractWorkRepository;
  second: ContractWorkRepository;
  dispose(): Promise<void>;
}>;

export const task: WorkTaskReference = {
  hostingProcessInstanceId: "host\u0000one",
  taskId: {
    processInstanceId: "task\u0000process",
    elementId: "review\u0000task",
    activation: 1,
  },
};

export const publication: ConfirmedProcessWorkPublication = {
  instance: {
    processInstanceId: task.hostingProcessInstanceId,
    definition: {
      processId: "Review\u0000Process",
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "review\u0000.bpmn",
        sha256: "a".repeat(64),
        byteLength: 42,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "profile\u0000one",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  },
  locator: "bpmn-process-work-v1:private\u0000address",
};

export function registerWorkRepositoryContract(
  label: string,
  create: () => Promise<ContractHarness>,
): void {
  test(`${label}: registration is exact, deterministic, and detached`, async () => {
    const harness = await create();
    try {
      const later = withProcessId("z-process");
      await harness.first.recordConfirmedProcessInstance(later);
      await harness.first.recordConfirmedProcessInstance(publication);
      await harness.second.recordConfirmedProcessInstance(structuredClone(publication));
      const listed = await harness.second.listProcessRegistrations();
      assert.deepEqual(listed.map(({ instance }) => instance.processInstanceId), [
        task.hostingProcessInstanceId,
        later.instance.processInstanceId,
      ]);
      assert.deepEqual(listed[0], { ...publication, observation: "indeterminate" });
      (listed[0]!.instance.definition.startCapabilities.messageStarts as unknown[]).push("drift");
      assert.deepEqual((await harness.first.listProcessRegistrations())[0], {
        ...publication,
        observation: "indeterminate",
      });
      await assert.rejects(
        harness.first.recordConfirmedProcessInstance({
          ...publication,
          locator: `${publication.locator}-changed`,
        }),
      );
      await harness.first.recordObservation(task.hostingProcessInstanceId, "active");
      assert.equal((await harness.second.listProcessRegistrations())[0]!.observation, "active");
      await harness.first.recordObservation(task.hostingProcessInstanceId, "closed");
      await harness.second.recordObservation(task.hostingProcessInstanceId, "active");
      await harness.second.recordObservation(task.hostingProcessInstanceId, "indeterminate");
      assert.equal((await harness.first.listProcessRegistrations())[0]!.observation, "closed");
      await assert.rejects(
        harness.first.recordObservation("missing-process", "active"),
      );
    } finally {
      await harness.dispose();
    }
  });

  test(`${label}: claim generations reject stale ABA transitions`, async () => {
    const harness = await create();
    try {
      await harness.first.recordConfirmedProcessInstance(publication);
      const first = claimInput("claim\u0000one", "actor\u0000a", 0, "c1");
      assert.equal((await harness.first.claimTask(first)).kind, "claimed");
      const release = releaseInput("release\u0000one", "actor\u0000a", 1, "r1");
      assert.equal((await harness.second.releaseTask(release)).kind, "released");
      assert.equal(
        (await harness.first.claimTask(claimInput("claim-two", "actor-b", 2, "c2"))).kind,
        "claimed",
      );
      assert.deepEqual(await harness.second.claimTask(first), { kind: "conflict" });
      assert.equal((await harness.second.releaseTask(release)).kind, "idempotent");
      assert.deepEqual(await harness.first.getClaim(task), {
        claimGeneration: 3,
        claim: { actorId: "actor-b", generation: 3 },
      });
      assert.equal((await harness.first.getClaimReleaseAction(release.actionId))?.binding.kind, "release");
      const outbox = await harness.first.listUndeliveredAuditEvents();
      assert.deepEqual(outbox.map(({ ordinal }) => ordinal), [1, 2, 3, 4]);
      await harness.second.acknowledgeAuditEvent(outbox[0]!.event.eventId);
      await harness.second.acknowledgeAuditEvent(outbox[0]!.event.eventId);
      assert.deepEqual(
        (await harness.first.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
        [2, 3, 4],
      );
    } finally {
      await harness.dispose();
    }
  });

  test(`${label}: concurrent claims produce one exact winner`, async () => {
    const harness = await create();
    try {
      await harness.first.recordConfirmedProcessInstance(publication);
      const results = await Promise.all([
        harness.first.claimTask(claimInput("race-a", "actor-a", 0, "race-a")),
        harness.second.claimTask(claimInput("race-b", "actor-b", 0, "race-b")),
      ]);
      assert.deepEqual(
        results.map(({ kind }) => kind).sort(),
        ["claimed", "conflict"],
      );
      const winner = results.find((result) => result.kind === "claimed");
      assert.ok(winner !== undefined && winner.kind === "claimed");
      assert.deepEqual(await harness.first.getClaim(task), {
        claimGeneration: 1,
        claim: winner.result.claim,
      });
      assert.deepEqual(
        (await harness.first.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
        [1, 2],
      );
    } finally {
      await harness.dispose();
    }
  });

  test(`${label}: completion has one active slot and one submission winner`, async () => {
    const harness = await create();
    const binding = completionBinding("completion\u0000one");
    try {
      await harness.first.recordConfirmedProcessInstance(publication);
      await harness.first.claimTask(claimInput("claim", "actor\u0000a", 0, "claim"));
      assert.equal((await harness.first.reserveCompletion({
        binding,
        audit: completionAudit(binding, "reserved"),
      })).kind, "reserved");
      assert.equal((await harness.second.reserveCompletion({
        binding: { ...binding, actionId: "completion-two" },
        audit: completionAudit({ ...binding, actionId: "completion-two" }, "reserved"),
      })).kind, "conflict");
      const submissions = await Promise.all([
        harness.first.beginCompletionSubmission(binding.actionId, binding),
        harness.second.beginCompletionSubmission(binding.actionId, binding),
      ]);
      assert.deepEqual(
        submissions.map(({ kind }) => kind).sort(),
        ["acquired", "retained"],
      );
      const outcome: WorkCompletionOutcomeInput = {
        binding,
        outcome: { kind: "committed" },
        audit: completionAudit(binding, "committed"),
      };
      assert.equal((await harness.first.recordCompletionOutcome(outcome)).kind, "recorded");
      assert.equal((await harness.second.recordCompletionOutcome(outcome)).kind, "retained");
      assert.deepEqual(await harness.first.getClaim(task), {
        claimGeneration: 2,
        claim: null,
      });
      assert.deepEqual(
        (await harness.first.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
        [1, 2, 3],
      );
    } finally {
      await harness.dispose();
    }
  });
}

export function claimInput(
  actionId: string,
  actorId: string,
  expectedGeneration: number,
  prefix: string,
): WorkClaimTransitionInput {
  return {
    actionId,
    actorId,
    task,
    expectedGeneration,
    audit: {
      claimed: audit(`${prefix}-claimed`, actorId, "claim", actionId, "claimed"),
      idempotent: audit(`${prefix}-idempotent`, actorId, "claim", actionId, "idempotent"),
      conflict: audit(`${prefix}-conflict`, actorId, "claim", actionId, "conflict"),
    },
  };
}

export function releaseInput(
  actionId: string,
  actorId: string,
  generation: number,
  prefix: string,
): WorkReleaseTransitionInput {
  return {
    actionId,
    actorId,
    task,
    generation,
    audit: {
      released: audit(`${prefix}-released`, actorId, "release", actionId, "released"),
      idempotent: audit(`${prefix}-idempotent`, actorId, "release", actionId, "idempotent"),
      conflict: audit(`${prefix}-conflict`, actorId, "release", actionId, "conflict"),
    },
  };
}

export function completionBinding(actionId: string): WorkCompletionBinding {
  return {
    actionId,
    actorId: "actor\u0000a",
    task,
    claimGeneration: 1,
    submittedField: {
      key: "approved",
      declaredType: "boolean",
      value: { kind: "boolean", value: true },
    },
  };
}

export function completionAudit(
  binding: WorkCompletionBinding,
  outcome: "reserved" | "committed" | "rejected" | "indeterminate",
): WorkAuditEvent {
  return {
    eventId: `${binding.actionId}-${outcome}`,
    actorId: binding.actorId,
    recordedAt: "2026-08-12T10:00:00.000Z",
    hostingProcessInstanceId: binding.task.hostingProcessInstanceId,
    taskId: binding.task.taskId,
    action: { kind: "completion", actionId: binding.actionId, outcome },
  };
}

function audit(
  eventId: string,
  actorId: string,
  kind: "claim" | "release",
  actionId: string,
  outcome: "claimed" | "idempotent" | "conflict" | "released",
): WorkAuditEvent {
  return {
    eventId,
    actorId,
    recordedAt: "2026-08-12T10:00:00.000Z",
    hostingProcessInstanceId: task.hostingProcessInstanceId,
    taskId: task.taskId,
    action: kind === "claim"
      ? { kind, actionId, outcome: outcome as "claimed" | "idempotent" | "conflict" }
      : { kind, actionId, outcome: outcome as "released" | "idempotent" | "conflict" },
  };
}

function withProcessId(processInstanceId: string): ConfirmedProcessWorkPublication {
  return {
    instance: { ...publication.instance, processInstanceId },
    locator: `${publication.locator}-${processInstanceId}`,
  };
}
