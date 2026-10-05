import assert from "node:assert/strict";
import test from "node:test";
import { EffectExecutionResultKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { EffectRequest } from "@bpmn-lean/temporal-protocol";
import { createInvoiceEffectActivities, createInvoiceRecoveryEffectActivities } from "../../runner/examples/invoice-effect-activities.ts";

const request = (operation: string, value: string): EffectRequest => ({
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation,
  idempotencyKey: "committed-invoice-occurrence",
  arguments: [{ name: "payload", value: { kind: VariableValueKind.String, value } }],
});
const result = (value: string) => ({ kind: EffectExecutionResultKind.Success,
  localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value } }] });

test("invoice validation derives its result from current business input", async () => {
  const activities = createInvoiceEffectActivities();
  for (const [input, expected] of [["INV-42", "valid"], ["draft", "rework"], ["INV-7", "valid"]] as const) {
    assert.deepEqual(await activities.executeBpmnEffect(request("invoiceValidator", input)), result(expected));
  }
});

test("classification consumes validation output and rejects an unvalidated invoice", async () => {
  const activities = createInvoiceEffectActivities();
  assert.deepEqual(await activities.executeBpmnEffect(request("invoiceClassifier", "valid")), result("standard"));
  await assert.rejects(activities.executeBpmnEffect(request("invoiceClassifier", "rework")), /validated invoice/u);
});

test("invoice handlers read their named payload regardless of other mapped inputs or order", async () => {
  const activities = createInvoiceEffectActivities();
  for (const [operation, input, expected] of [["invoiceValidator", "INV-42", "valid"],
    ["invoiceClassifier", "valid", "standard"]] as const) {
    const original = request(operation, input);
    const extra = { name: "echo", value: { kind: VariableValueKind.String, value: "parent" } } as const;
    for (const args of [[extra, ...original.arguments], [...original.arguments, extra]]) {
      assert.deepEqual(await activities.executeBpmnEffect({ ...original, arguments: args }), result(expected));
    }
  }
});

test("unknown operation or protocol never receives a fallback result", async () => {
  const activities = createInvoiceEffectActivities();
  await assert.rejects(activities.executeBpmnEffect(request("unknown", "INV-42")), /operation/u);
  await assert.rejects(activities.executeBpmnEffect({ ...request("invoiceValidator", "INV-42"), protocol: "unknown" }), /protocol/u);
});

test("missing, null and ambiguous invoice payloads fail explicitly", async () => {
  const activities = createInvoiceEffectActivities();
  const original = request("invoiceValidator", "INV-42");
  for (const args of [[], [{ name: "payload", value: { kind: VariableValueKind.Null } }],
    [...original.arguments, ...original.arguments]] as const) {
    await assert.rejects(activities.executeBpmnEffect({ ...original, arguments: args }), /payload/u);
  }
});

test("a retried invoice Activity returns the same value without mutating its request", async () => {
  const activities = createInvoiceEffectActivities();
  const original = request("invoiceValidator", "INV-42");
  const before = structuredClone(original);
  const first = await activities.executeBpmnEffect(original);
  assert.deepEqual(await activities.executeBpmnEffect(original), first);
  assert.deepEqual(original, before);
});

test("invoice recovery handlers return modeled failures from business input", async () => {
  const activities = createInvoiceRecoveryEffectActivities();
  const review = { kind: EffectExecutionResultKind.BpmnError, code: "REVIEW_REQUIRED",
    message: "Invoice requires correction", localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "correct" } }] };
  for (const [operation, input, expected] of [
    ["invoiceValidator", "missing-reference", review], ["invoiceValidator", "policy-review", result("valid")],
    ["policyChecker", "policy-review", review], ["invoiceValidator", "INV-42", result("valid")],
    ["policyChecker", "INV-42", result("valid")],
  ] as const) {
    const inputRequest = request(operation, input);
    const saved = structuredClone(inputRequest);
    assert.deepEqual(await activities.executeBpmnEffect(inputRequest), expected);
    assert.deepEqual(await activities.executeBpmnEffect(inputRequest), expected);
    assert.deepEqual(inputRequest, saved);
  }
});

test("invoice recovery bindings distinguish malformed requests from modeled failures", async () => {
  const activities = createInvoiceRecoveryEffectActivities();
  await assert.rejects(activities.executeBpmnEffect(request("unknown", "policy-review")), /operation/u);
  await assert.rejects(activities.executeBpmnEffect({ ...request("invoiceValidator", "missing-reference"), protocol: "unknown" }), /protocol/u);
  for (const args of [[], [{ name: "payload", value: { kind: VariableValueKind.Null } }],
    [...request("invoiceValidator", "missing-reference").arguments, ...request("invoiceValidator", "missing-reference").arguments]] as const) {
    await assert.rejects(activities.executeBpmnEffect({ ...request("invoiceValidator", "missing-reference"), arguments: args }), /payload/u);
  }
});
