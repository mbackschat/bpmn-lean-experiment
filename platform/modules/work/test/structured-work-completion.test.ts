import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  HumanTaskCatalogV1,
  StructuredWorkCompletionRequestV1,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
import {
  decodeWorkCompletionRequest,
  parseStrictJson,
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
} from "@bpmn-lean/platform-work";

const definition = {
  processId: "ExpenseReview",
  version: 3,
  source: {
    kind: "bpmnSource" as const,
    id: "expense-review.bpmn",
    sha256: "a".repeat(64),
    byteLength: 512,
    declaredEncoding: null,
    decodedAs: "UTF-8" as const,
  },
  semanticProfile: "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
  startCapabilities: { messageStarts: [], timerStarts: [] },
};

const task = {
  id: { processInstanceId: "expense-1", elementId: "ReviewExpense", activation: 1 },
  name: "Review expense",
  state: "active" as const,
  metadata: {
    assignment: { candidates: [{ kind: "group" as const, id: "reviewers" }] as const },
  },
};

const catalog = {
  schemaVersion: "bpmn-lean-human-task-catalog/v1",
  processId: definition.processId,
  semanticProfile: definition.semanticProfile,
  sourceSha256: definition.source.sha256,
  tasks: [{
    elementId: task.id.elementId,
    description: "Review the exception and select a resolution.",
    worklistPriority: 80,
    form: {
      schemaVersion: "bpmn-lean-structured-form/v1",
      fields: [{
        key: "riskFlags",
        label: "Risk flags",
        helpText: null,
        defaultValue: null,
        visibleForActions: "all",
        requiredForActions: [],
        kind: "multipleChoice",
        options: [
          { value: "high", label: "High" },
          { value: "low", label: "Low" },
        ],
        maxItems: 2,
      }, {
        key: "resolutionReason",
        label: "Resolution reason",
        helpText: null,
        defaultValue: null,
        visibleForActions: ["abort"],
        requiredForActions: ["abort"],
        kind: "text",
        multiline: true,
        minLength: 1,
        maxLength: 1_000,
      }],
      actions: [{
        id: "approve",
        label: "Approve",
        intent: "primary",
        resolutionValue: "approved",
      }, {
        id: "abort",
        label: "Abort",
        intent: "destructive",
        resolutionValue: "aborted",
      }],
      resolutionVariable: "resolution",
    },
  }],
} as const;

test("Abort without resolutionReason is rejected before engine dispatch", async () => {
  const harness = await createHarness();
  try {
    await claim(harness);
    const before = harness.audit.length;
    const result = await harness.service.completeTask(
      "abort-1",
      structuredRequest("abort", { riskFlags: [] }),
    );
    assert.deepEqual(result, {
      kind: "formValidationFailed",
      issues: [{
        code: "requiredFieldMissing",
        target: { kind: "field", key: "resolutionReason" },
      }],
    });
    assert.equal(harness.completionCalls, 0);
    assert.equal(harness.audit.length, before);
  } finally {
    await harness.close();
  }
});

test("multiple-choice permutations share one canonical retained identity", async () => {
  const harness = await createHarness();
  try {
    await claim(harness);
    const first = await harness.service.completeTask(
      "approve-1",
      structuredRequest("approve", { riskFlags: ["low", "high"] }),
    );
    const retry = await harness.service.completeTask(
      "approve-1",
      structuredRequest("approve", { riskFlags: ["high", "low"] }),
    );
    assert.deepEqual(retry, first);
    assert.equal(harness.completionCalls, 1);
    assert.deepEqual(harness.lastSubmittedValues, [{
      name: "resolution",
      value: { kind: "string", value: "approved" },
    }, {
      name: "riskFlags",
      value: { kind: "stringList", value: ["high", "low"] },
    }]);
  } finally {
    await harness.close();
  }
});

test("invalid structured input reserves nothing and calls the gateway zero times", async () => {
  const harness = await createHarness();
  try {
    await claim(harness);
    const beforeAudit = structuredClone(harness.audit);
    const result = await harness.service.completeTask(
      "invalid-1",
      structuredRequest("approve", { unexpected: "secret" }),
    );
    assert.deepEqual(result, {
      kind: "formValidationFailed",
      issues: [{
        code: "unknownField",
        target: { kind: "field", key: "unexpected" },
      }],
    });
    assert.equal(harness.completionCalls, 0);
    assert.equal(await harness.repository.getCompletionAction("invalid-1"), null);
    assert.deepEqual(harness.audit, beforeAudit);
  } finally {
    await harness.close();
  }
});

test("hidden incompatible current data rejects before reservation, dispatch, or audit", async () => {
  const harness = await createHarness({
    inputVariables: [{
      name: "resolutionReason",
      value: { kind: "integer", value: 7 },
    }],
  });
  try {
    await claim(harness);
    const beforeAudit = structuredClone(harness.audit);
    const result = await harness.service.completeTask(
      "hidden-incompatible-1",
      structuredRequest("approve", { riskFlags: [] }),
    );
    assert.deepEqual(result, {
      kind: "formValidationFailed",
      issues: [{
        code: "currentValueIncompatible",
        target: { kind: "field", key: "resolutionReason" },
      }],
    });
    assert.equal(harness.completionCalls, 0);
    assert.equal(await harness.repository.getCompletionAction("hidden-incompatible-1"), null);
    assert.deepEqual(harness.audit, beforeAudit);
  } finally {
    await harness.close();
  }
});

test("unknown __proto__ input remains visible to validation and mutates nothing", async () => {
  const harness = await createHarness();
  try {
    await claim(harness);
    const beforeAudit = structuredClone(harness.audit);
    const result = await harness.service.completeTask(
      "unknown-proto-1",
      decodedStructuredRequest("approve", `{"__proto__":"secret"}`),
    );
    assert.deepEqual(result, {
      kind: "formValidationFailed",
      issues: [{
        code: "unknownField",
        target: { kind: "field", key: "__proto__" },
      }],
    });
    assert.equal(harness.completionCalls, 0);
    assert.equal(await harness.repository.getCompletionAction("unknown-proto-1"), null);
    assert.deepEqual(harness.audit, beforeAudit);
  } finally {
    await harness.close();
  }
});

test("catalog-bound __proto__ input reaches the canonical engine patch as data", async () => {
  const protoCatalog: HumanTaskCatalogV1 = {
    ...catalog,
    tasks: [{
      ...catalog.tasks[0],
      form: {
        ...catalog.tasks[0].form,
        fields: [{
          key: "__proto__",
          label: "Prototype review",
          helpText: null,
          defaultValue: null,
          visibleForActions: "all",
          requiredForActions: ["approve"],
          kind: "text",
          multiline: false,
          minLength: 1,
          maxLength: 100,
        }],
      },
    }],
  };
  const harness = await createHarness({ catalog: protoCatalog });
  try {
    await claim(harness);
    const result = await harness.service.completeTask(
      "valid-proto-1",
      decodedStructuredRequest("approve", `{"__proto__":"reviewed"}`),
    );
    assert.equal(result.kind, "result");
    assert.equal(harness.completionCalls, 1);
    assert.deepEqual(harness.lastSubmittedValues, [{
      name: "__proto__",
      value: { kind: "string", value: "reviewed" },
    }, {
      name: "resolution",
      value: { kind: "string", value: "approved" },
    }]);
  } finally {
    await harness.close();
  }
});

async function createHarness(options: Readonly<{
  catalog?: HumanTaskCatalogV1;
  inputVariables?: readonly unknown[];
}> = {}) {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-structured-work-red-"));
  const repository = new SqliteWorkRepository(join(root, "work.sqlite"));
  await repository.recordConfirmedProcessInstance({
    instance: { processInstanceId: "host-1", definition },
    locator: "private:host-1",
  });
  const audit: WorkAuditEvent[] = [];
  let completionCalls = 0;
  let lastSubmittedValues: readonly unknown[] = [];
  let eventOrdinal = 0;
  const actors = new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] });
  const outbox = new WorkAuditOutboxService(repository, {
    record: async (event) => {
      audit.push(structuredClone(event));
      return audit.length;
    },
  });
  const gateway = {
    observeOpenWork: async () => ({
      status: "open" as const,
      openUserTasks: [structuredClone(task)],
    }),
    readWorkDetail: async () => ({
      status: "found" as const,
      detail: {
        task: structuredClone(task),
        inputVariables: structuredClone(options.inputVariables ?? []),
      },
    }),
    completeWork: async (request: Readonly<{
      stimulus: Readonly<{ commandId: string; submittedValues: readonly unknown[] }>;
    }>) => {
      completionCalls += 1;
      lastSubmittedValues = structuredClone(request.stimulus.submittedValues);
      return {
        kind: "semantic" as const,
        commandId: request.stimulus.commandId,
        outcome: "committed" as const,
      };
    },
  };
  const work = new WorkService({
    repository,
    gateway,
    actors,
    authorization: new TaskAuthorizationPolicy(),
    limits: { maxProcesses: 10, maxTasks: 10 },
    catalogs: {
      readHumanTaskCatalog: async () => structuredClone(options.catalog ?? catalog),
    },
  });
  const details = new WorkTaskDetailService({ work, gateway });
  const service = new WorkMutationService({
    work,
    details,
    actors,
    repository,
    gateway,
    outbox,
    auditEvents: {
      create: (input: Omit<WorkAuditEvent, "eventId" | "recordedAt">): WorkAuditEvent => ({
        eventId: `structured-event-${++eventOrdinal}`,
        recordedAt: "2026-08-16T10:00:00.000Z",
        ...structuredClone(input),
      }),
    },
  });
  return {
    repository,
    audit,
    service,
    get completionCalls() { return completionCalls; },
    get lastSubmittedValues() { return lastSubmittedValues; },
    close: async () => {
      await repository.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function claim(harness: Awaited<ReturnType<typeof createHarness>>): Promise<void> {
  assert.equal((await harness.service.claimTask(task.id, {
    actionId: "claim-1",
    expectedGeneration: 0,
  })).kind, "claimed");
}

function structuredRequest(
  resolutionActionId: string,
  fields: Readonly<Record<string, unknown>>,
): StructuredWorkCompletionRequestV1 {
  return {
    schemaVersion: "bpmn-lean-structured-work-completion/v1",
    taskId: structuredClone(task.id),
    expectedClaimGeneration: 1,
    resolutionActionId,
    fields: structuredClone(fields),
  };
}

function decodedStructuredRequest(
  resolutionActionId: string,
  fieldsJson: string,
): StructuredWorkCompletionRequestV1 {
  const bytes = new TextEncoder().encode(
    `{"schemaVersion":"bpmn-lean-structured-work-completion/v1","taskId":{"processInstanceId":"${task.id.processInstanceId}","elementId":"${task.id.elementId}","activation":${task.id.activation}},"expectedClaimGeneration":1,"resolutionActionId":"${resolutionActionId}","fields":${fieldsJson}}`,
  );
  const decoded = decodeWorkCompletionRequest(parseStrictJson(bytes));
  if (!("fields" in decoded)) throw new TypeError("structured request expected");
  return decoded;
}
