import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type {
  PublicWorkTask,
  WorkAuditEvent,
  WorkCompletionRequest,
} from "@bpmn-lean/platform-contracts";
import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import {
  SqliteWorkRepository,
  WorkAuditOutboxService,
  WorkMutationService,
  WorkService,
  WorkTaskDetailService,
} from "../dist/index.js";

const definition = {
  processId: "Review_Process",
  version: 1,
  source: {
    kind: "bpmnSource" as const,
    id: "review.bpmn",
    sha256: "a".repeat(64),
    byteLength: 42,
    declaredEncoding: null,
    decodedAs: "UTF-8" as const,
  },
  semanticProfile: "profile-1",
  startCapabilities: { messageStarts: [], timerStarts: [] },
};

const task = {
  id: { processInstanceId: "called-1", elementId: "Review", activation: 1 },
  name: "Review",
  state: "active" as const,
  metadata: {
    assignment: { candidates: [{ kind: "group" as const, id: "reviewers" }] as const },
    form: { fields: [{ key: "approved", type: "boolean" as const }] as const },
  },
};

test("claim race has one winner while hidden mutations remain audit-silent", async () => {
  const harness = await createHarness();
  try {
    const first = await harness.service.claimTask(task.id, {
      actionId: "claim-1",
      expectedGeneration: 0,
    });
    const raced = await harness.service.claimTask(task.id, {
      actionId: "claim-2",
      expectedGeneration: 0,
    });
    assert.equal(first.kind, "claimed");
    assert.deepEqual(raced, { kind: "conflict" });

    const beforeForeign = harness.audit.length;
    const foreign = harness.serviceFor("foreign-user", ["reviewers"]);
    assert.deepEqual(
      await foreign.claimTask(task.id, {
        actionId: "claim-foreign",
        expectedGeneration: 1,
      }),
      { kind: "notFound" },
    );
    assert.equal(harness.audit.length, beforeForeign);
    assert.deepEqual(
      harness.audit.map((event) => event.action.outcome),
      ["claimed", "conflict"],
    );
  } finally {
    await harness.close();
  }
});

test("release retry survives task disappearance without another generation change", async () => {
  const harness = await createHarness();
  try {
    assert.equal((await harness.service.claimTask(task.id, {
      actionId: "claim-1",
      expectedGeneration: 0,
    })).kind, "claimed");
    const released = await harness.service.releaseTask(task.id, {
      actionId: "release-1",
      generation: 1,
    });
    assert.equal(released.kind, "released");
    harness.openTasks.length = 0;
    assert.deepEqual(
      await harness.service.releaseTask(task.id, {
        actionId: "release-1",
        generation: 1,
      }),
      { kind: "idempotent", result: released.kind === "released" ? released.result : null },
    );
    assert.deepEqual(harness.repository.getClaim(reference()), {
      claimGeneration: 2,
      claim: null,
    });
  } finally {
    await harness.close();
  }
});

test("committed completion is dispatched once and retained after task and claim disappear", async () => {
  const harness = await createHarness({
    complete: async () => {
      harness.openTasks.length = 0;
      return { kind: "semantic", commandId: "complete-1", outcome: "committed" };
    },
  });
  try {
    await claim(harness);
    const request = completionRequest();
    const first = await harness.service.completeTask("complete-1", request);
    const retry = await harness.service.completeTask("complete-1", request);
    assert.deepEqual(first, {
      kind: "result",
      result: { state: "committed", actionId: "complete-1", taskId: task.id },
    });
    assert.deepEqual(retry, first);
    assert.equal(harness.completionCalls, 1);
    assert.deepEqual(harness.repository.getClaim(reference()), {
      claimGeneration: 2,
      claim: null,
    });

    assert.deepEqual(
      await harness.service.completeTask("complete-1", {
        ...request,
        submittedValues: [{ key: "approved", value: { kind: "boolean", value: false } }],
      }),
      { kind: "conflict" },
    );
    assert.equal(harness.completionCalls, 1);

    const auditBeforeForeign = harness.audit.length;
    assert.deepEqual(
      await harness.serviceFor("foreign-user", ["reviewers"]).completeTask(
        "complete-1",
        request,
      ),
      { kind: "notFound" },
    );
    assert.equal(harness.completionCalls, 1);
    assert.equal(harness.audit.length, auditBeforeForeign);
  } finally {
    await harness.close();
  }
});

test("two completion actions racing one claim reserve once and call the host once", async () => {
  let releaseHost: (() => void) | undefined;
  const hostBlocked = new Promise<void>((resolve) => { releaseHost = resolve; });
  const harness = await createHarness({
    complete: async () => {
      await hostBlocked;
      return { kind: "semantic", commandId: "complete-1", outcome: "committed" };
    },
  });
  try {
    await claim(harness);
    const winner = harness.service.completeTask("complete-1", completionRequest());
    await new Promise<void>((resolve) => setImmediate(resolve));
    const loser = await harness.service.completeTask("complete-2", completionRequest());
    assert.deepEqual(loser, { kind: "conflict" });
    assert.equal(harness.completionCalls, 1);
    releaseHost?.();
    const winnerResult = await winner;
    assert.equal(
      winnerResult.kind === "result" ? winnerResult.result.state : "unexpected",
      "committed",
    );
  } finally {
    releaseHost?.();
    await harness.close();
  }
});

test("concurrent exact retries do not duplicate an in-flight host call", async () => {
  let releaseHost: (() => void) | undefined;
  const hostBlocked = new Promise<void>((resolve) => { releaseHost = resolve; });
  const harness = await createHarness({
    complete: async () => {
      await hostBlocked;
      return { kind: "semantic", commandId: "complete-1", outcome: "committed" };
    },
  });
  try {
    await claim(harness);
    const first = harness.service.completeTask("complete-1", completionRequest());
    await new Promise<void>((resolve) => setImmediate(resolve));
    const concurrent = await harness.service.completeTask("complete-1", completionRequest());
    assert.equal(
      concurrent.kind === "result" ? concurrent.result.state : concurrent.kind,
      "indeterminate",
    );
    assert.equal(harness.completionCalls, 1);
    releaseHost?.();
    const terminal = await first;
    assert.equal(terminal.kind === "result" ? terminal.result.state : terminal.kind, "committed");
  } finally {
    releaseHost?.();
    await harness.close();
  }
});

test("indeterminate exact retry resubmits the same command and can converge", async () => {
  let call = 0;
  const harness = await createHarness({
    complete: async () => {
      call += 1;
      if (call === 1) throw new Error("response lost");
      return { kind: "semantic", commandId: "complete-1", outcome: "committed" };
    },
  });
  try {
    await claim(harness);
    const first = await harness.service.completeTask("complete-1", completionRequest());
    const second = await harness.service.completeTask("complete-1", completionRequest());
    assert.equal(first.kind === "result" ? first.result.state : first.kind, "indeterminate");
    assert.equal(second.kind === "result" ? second.result.state : second.kind, "committed");
    assert.equal(harness.completionCalls, 2);
    assert.deepEqual(
      harness.audit.map((event) => event.action.outcome),
      ["claimed", "reserved", "indeterminate", "committed"],
    );
  } finally {
    await harness.close();
  }
});

test("a retained submitting action reconciles through the same host command", async () => {
  const harness = await createHarness();
  try {
    await claim(harness);
    const binding = {
      actionId: "complete-1",
      actorId: "demo-user",
      task: reference(),
      claimGeneration: 1,
      submittedField: {
        key: "approved",
        declaredType: "boolean" as const,
        value: { kind: "boolean" as const, value: true },
      },
    };
    assert.equal(harness.repository.reserveCompletion({
      binding,
      audit: completionAudit("reserved"),
    }).kind, "reserved");
    assert.equal(
      harness.repository.beginCompletionSubmission("complete-1", binding).kind,
      "acquired",
    );

    const result = await harness.service.completeTask("complete-1", completionRequest());
    assert.equal(result.kind === "result" ? result.result.state : result.kind, "committed");
    assert.equal(harness.completionCalls, 1);
  } finally {
    await harness.close();
  }
});

test("incompatible form and mismatched retained content never call the engine", async () => {
  const harness = await createHarness({
    detailVariables: [{ name: "approved", value: { kind: "string", value: "false" } }],
  });
  try {
    await claim(harness);
    const before = harness.audit.length;
    assert.deepEqual(
      await harness.service.completeTask("complete-1", completionRequest()),
      { kind: "formValueIncompatible" },
    );
    assert.equal(harness.completionCalls, 0);
    assert.equal(harness.audit.length, before);
  } finally {
    await harness.close();
  }
});

test("semantic rejection and exact process-closed receipt remain distinct results", async () => {
  const cases: readonly (readonly [CompletionResult, unknown])[] = [
    ...(["rolledBack", "rejected", "semanticFailure", "unsupported"] as const).map(
      (outcome) => [
        { kind: "semantic", commandId: "complete-1", outcome },
        { kind: "semantic", outcome },
      ] as const),
    [{
      kind: "processClosed",
      commandId: "complete-1",
      receipt: { processInstanceId: "host-1" },
    }, { kind: "processClosed" }],
  ];
  for (const [engineResult, expected] of cases) {
    const harness = await createHarness({ complete: async () => engineResult });
    try {
      await claim(harness);
      const result = await harness.service.completeTask("complete-1", completionRequest());
      assert.deepEqual(result, {
        kind: "result",
        result: {
          state: "rejected",
          actionId: "complete-1",
          taskId: task.id,
          engineResult: expected,
        },
      });
    } finally {
      await harness.close();
    }
  }
});

test("unknown, mismatched command, and mismatched closed receipt stay indeterminate", async () => {
  const results: readonly CompletionResult[] = [
    { kind: "processUnknown", commandId: "complete-1", processInstanceId: "host-1" },
    { kind: "semantic", commandId: "different", outcome: "committed" },
    {
      kind: "processClosed",
      commandId: "complete-1",
      receipt: { processInstanceId: "different" },
    },
  ];
  for (const engineResult of results) {
    const harness = await createHarness({ complete: async () => engineResult });
    try {
      await claim(harness);
      const result = await harness.service.completeTask("complete-1", completionRequest());
      assert.equal(result.kind === "result" ? result.result.state : result.kind, "indeterminate");
    } finally {
      await harness.close();
    }
  }
});

type CompletionResult =
  | Readonly<{ kind: "semantic"; commandId: string; outcome: "committed" | "rolledBack" | "rejected" | "semanticFailure" | "unsupported" }>
  | Readonly<{ kind: "processClosed"; commandId: string; receipt: Readonly<{ processInstanceId: string }> }>
  | Readonly<{ kind: "processUnknown"; commandId: string; processInstanceId: string }>;

type HarnessOptions = Readonly<{
  detailVariables?: readonly unknown[];
  complete?: () => Promise<CompletionResult>;
}>;

async function createHarness(options: HarnessOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-mutation-"));
  const repository = new SqliteWorkRepository(join(root, "work.sqlite"));
  await repository.recordConfirmedProcessInstance({
    instance: { processInstanceId: "host-1", definition },
    locator: "private:host-1",
  });
  const openTasks: PublicWorkTask["task"][] = [structuredClone(task)];
  const audit: WorkAuditEvent[] = [];
  let completionCalls = 0;
  let eventOrdinal = 0;
  const outbox = new WorkAuditOutboxService(repository, {
    record: (event) => {
      audit.push(structuredClone(event));
      return audit.length;
    },
  });
  const gateway = {
    observeOpenWork: async () => ({ status: "open" as const, openUserTasks: structuredClone(openTasks) }),
    readWorkDetail: async () => ({
      status: "found" as const,
      detail: {
        task: structuredClone(task),
        inputVariables: structuredClone(options.detailVariables ?? []),
      },
    }),
    completeWork: async () => {
      completionCalls += 1;
      return options.complete?.() ?? {
        kind: "semantic" as const,
        commandId: "complete-1",
        outcome: "committed" as const,
      };
    },
  };
  const auditFactory = {
    create: (input: Omit<WorkAuditEvent, "eventId" | "recordedAt">): WorkAuditEvent => ({
      eventId: `event-${++eventOrdinal}`,
      recordedAt: "2026-08-12T10:00:00.000Z",
      ...structuredClone(input),
    }),
  };
  function serviceFor(actorId: string, groups: readonly string[]) {
    const actors = new FakeActorResolver({ id: actorId, groups: [...groups] });
    const work = new WorkService({
      repository,
      gateway,
      actors,
      authorization: new TaskAuthorizationPolicy(),
      limits: { maxProcesses: 10, maxTasks: 10 },
    });
    const details = new WorkTaskDetailService({ work, gateway });
    return new WorkMutationService({
      work,
      details,
      actors,
      repository,
      gateway,
      outbox,
      auditEvents: auditFactory,
    });
  }
  return {
    repository,
    openTasks,
    audit,
    serviceFor,
    service: serviceFor("demo-user", ["reviewers"]),
    get completionCalls() { return completionCalls; },
    close: async () => {
      repository.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function claim(harness: Awaited<ReturnType<typeof createHarness>>): Promise<void> {
  const result = await harness.service.claimTask(task.id, {
    actionId: "claim-1",
    expectedGeneration: 0,
  });
  assert.equal(result.kind, "claimed");
}

function completionRequest(): WorkCompletionRequest {
  return {
    taskId: structuredClone(task.id),
    expectedClaimGeneration: 1,
    submittedValues: [{ key: "approved", value: { kind: "boolean", value: true } }],
  };
}

function reference() {
  return { hostingProcessInstanceId: "host-1", taskId: task.id };
}

function completionAudit(outcome: "reserved"): WorkAuditEvent {
  return {
    eventId: `preloaded-${outcome}`,
    actorId: "demo-user",
    recordedAt: "2026-08-12T10:00:00.000Z",
    hostingProcessInstanceId: "host-1",
    taskId: task.id,
    action: { kind: "completion", actionId: "complete-1", outcome },
  };
}
