import assert from "node:assert/strict";
import test from "node:test";

import {
  decodePublicFormValue,
  decodePublicTaskDetail,
  decodeWorkApiErrorResponse,
  decodeWorkCompletionRequest,
  parseStrictJson,
} from "@bpmn-lean/platform-contracts";

const definition = {
  processId: "ExpenseReview",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "expense.bpmn",
    sha256: "a".repeat(64),
    byteLength: 400,
    declaredEncoding: null,
    decodedAs: "UTF-8",
  },
  semanticProfile: "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

const taskDefinition = {
  elementId: "ReviewExpense",
  description: "Review the exception.",
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
      options: [{ value: "high", label: "High" }, { value: "low", label: "Low" }],
      maxItems: 2,
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
} as const;

const workTask = {
  task: {
    id: { processInstanceId: "expense-1", elementId: "ReviewExpense", activation: 1 },
    name: "Review expense",
    state: "active",
    metadata: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
    },
  },
  hostingInstance: { processInstanceId: "host-1", definition },
  claimGeneration: 1,
  claim: { actorId: "demo-user", generation: 1 },
  claimableByCurrentActor: false,
  catalogPresentation: { worklistPriority: 80 },
} as const;

test("decodes the structured request arm while preserving the exact legacy arm", () => {
  const legacy = {
    taskId: workTask.task.id,
    expectedClaimGeneration: 1,
    submittedValues: [{ key: "approved", value: { kind: "boolean", value: true } }],
  } as const;
  assert.deepEqual(decodeWorkCompletionRequest(legacy), legacy);
  assert.equal(
    JSON.stringify(decodeWorkCompletionRequest(legacy)),
    JSON.stringify(legacy),
  );

  const structured = {
    schemaVersion: "bpmn-lean-structured-work-completion/v1",
    taskId: workTask.task.id,
    expectedClaimGeneration: 1,
    resolutionActionId: "abort",
    fields: { riskFlags: ["low", "high"] },
  } as const;
  assert.deepEqual(decodeWorkCompletionRequest(structured), structured);
  assert.throws(
    () => decodeWorkCompletionRequest({ ...structured, privateLocator: "forbidden" }),
    /public fields/u,
  );
});

test("strict JSON rejects duplicate structured field keys before request decoding", () => {
  const bytes = new TextEncoder().encode(
    `{"schemaVersion":"bpmn-lean-structured-work-completion/v1","taskId":{"processInstanceId":"expense-1","elementId":"ReviewExpense","activation":1},"expectedClaimGeneration":1,"resolutionActionId":"approve","fields":{"riskFlags":["low"],"riskFlags":["high"]}}`,
  );
  assert.throws(() => decodeWorkCompletionRequest(parseStrictJson(bytes)), SyntaxError);
});

test("structured request decoding preserves __proto__ as an inert own field", () => {
  const bytes = new TextEncoder().encode(
    `{"schemaVersion":"bpmn-lean-structured-work-completion/v1","taskId":{"processInstanceId":"expense-1","elementId":"ReviewExpense","activation":1},"expectedClaimGeneration":1,"resolutionActionId":"approve","fields":{"__proto__":"declared value"}}`,
  );
  const decoded = decodeWorkCompletionRequest(parseStrictJson(bytes));
  assert.ok("fields" in decoded);
  assert.equal(Object.getPrototypeOf(decoded.fields), Object.prototype);
  assert.equal(Object.hasOwn(decoded.fields, "__proto__"), true);
  assert.deepEqual(Object.keys(decoded.fields), ["__proto__"]);
  assert.equal(decoded.fields.__proto__, "declared value");
});

test("decodes detached integer and string-list values with generic wire bounds", () => {
  const source = { kind: "stringList", value: ["high", "high"] };
  const decoded = decodePublicFormValue(source);
  source.value[0] = "changed";
  assert.deepEqual(decoded, { kind: "stringList", value: ["high", "high"] });
  assert.deepEqual(decodePublicFormValue({ kind: "integer", value: 0 }), {
    kind: "integer",
    value: 0,
  });
  assert.throws(() => decodePublicFormValue({ kind: "integer", value: -0 }), /negative zero/u);
  assert.throws(
    () => decodePublicFormValue({ kind: "stringList", value: Array(33).fill("x") }),
    /at most 32/u,
  );
});

test("decodes exact source-bound structured detail and refuses identity drift", () => {
  const detail = {
    workTask,
    form: {
      schemaVersion: "bpmn-lean-structured-task-form/v1",
      catalogIdentity: {
        processId: definition.processId,
        version: definition.version,
        sourceSha256: definition.source.sha256,
        semanticProfile: definition.semanticProfile,
      },
      taskDefinition,
      fields: [{
        key: "riskFlags",
        currentValue: { kind: "stringList", value: ["high", "low"] },
        compatibility: "compatible",
      }],
    },
  } as const;
  assert.deepEqual(decodePublicTaskDetail(detail), detail);
  assert.throws(() => decodePublicTaskDetail({
    ...detail,
    form: {
      ...detail.form,
      catalogIdentity: { ...detail.form.catalogIdentity, sourceSha256: "b".repeat(64) },
    },
  }), /exact catalog binding/u);
});

test("decodes only the issue-first form validation error envelope", () => {
  const response = {
    error: {
      code: "formValidationFailed",
      message: "The structured Work form submission is invalid.",
      issues: [{
        code: "requiredFieldMissing",
        target: { kind: "field", key: "resolutionReason" },
      }],
    },
  } as const;
  assert.deepEqual(decodeWorkApiErrorResponse(response), response);
  assert.throws(() => decodeWorkApiErrorResponse({
    error: {
      ...response.error,
      issues: [{ ...response.error.issues[0], value: "secret" }],
    },
  }), /exactly its public fields/u);
  assert.throws(() => decodeWorkApiErrorResponse({
    error: {
      ...response.error,
      issues: [{ code: "computedPatchTooLarge", target: { kind: "field", key: "secret" } }],
    },
  }), /does not match its issue code/u);
});
