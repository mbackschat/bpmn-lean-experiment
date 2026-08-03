/**
 * Locks the declared product interaction plan against the canonical contracts it may name.
 *
 * The oracle is the semantic core's own well-formedness: a plan may only carry a canonical
 * completion patch, a real Message channel, and an effect result the core would accept, so no
 * product-local shape can reach a semantic command.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EffectExecutionResultKind,
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";

import {
  validateHostEffectHandlers,
  validateHostInteractionPlan,
} from "@bpmn-lean/temporal-adapter";

const completion = {
  kind: StimulusKind.CompleteUserTaskInstance,
  elementId: "UserTask_Approve",
  delayMs: 3_000,
  inputVariableNames: ["requestTitle"],
  submittedValues: [
    {
      name: "decision",
      value: { kind: VariableValueKind.String, value: "approved" },
    },
  ],
} as const;

const delivery = {
  kind: StimulusKind.DeliverMessage,
  channel: { kind: MessageChannelKind.DirectMessage, messageId: "invoice" },
  delayMs: 1_000,
} as const;

const handler = {
  protocol: "activity",
  operation: "probe",
  result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
} as const;

test("accepts an empty plan, which a pure timer model requires", () => {
  assert.doesNotThrow(() => validateHostInteractionPlan([]));
  assert.doesNotThrow(() => validateHostEffectHandlers([]));
});

test("accepts both canonical response variants together", () => {
  assert.doesNotThrow(() =>
    validateHostInteractionPlan([completion, delivery])
  );
});

test("rejects an unknown response field", () => {
  assert.throws(
    () => validateHostInteractionPlan([{ ...completion, formKey: "x" }]),
    /unknown field formKey/u,
  );
});

test("rejects a product-local response discriminator", () => {
  assert.throws(
    () =>
      validateHostInteractionPlan([{ ...completion, kind: "completeUserTask" }]),
    /canonical stimulus kind/u,
  );
});

test("rejects a non-canonical completion patch", () => {
  assert.throws(
    () =>
      validateHostInteractionPlan([
        {
          ...completion,
          submittedValues: [{ name: "decision", value: { kind: "number", value: 1 } }],
        },
      ]),
    /canonical string\/null patch/u,
  );
});

test("rejects unordered or repeated input variable names", () => {
  assert.throws(
    () =>
      validateHostInteractionPlan([
        { ...completion, inputVariableNames: ["b", "a"] },
      ]),
    /unique and canonically ordered/u,
  );
});

test("rejects a non-positive delay", () => {
  assert.throws(
    () => validateHostInteractionPlan([{ ...completion, delayMs: 0 }]),
    /positive safe integer/u,
  );
});

test("rejects an invented Message channel shape", () => {
  assert.throws(
    () =>
      validateHostInteractionPlan([
        { ...delivery, channel: { kind: "queue", queueId: "invoice" } },
      ]),
    /Message channel/u,
  );
});

test("accepts a bpmnError effect result, which the boundary Error profile requires", () => {
  assert.doesNotThrow(() =>
    validateHostEffectHandlers([
      {
        protocol: "activity",
        operation: "mappedSuccess",
        result: {
          kind: EffectExecutionResultKind.BpmnError,
          code: "DOCUMENT_REJECTED",
          message: null,
          localPatch: [],
        },
      },
    ])
  );
});

test("rejects an effect result the semantic core would not accept", () => {
  assert.throws(
    () =>
      validateHostEffectHandlers([
        { ...handler, result: { kind: "retryLater" } },
      ]),
    /effect execution result/u,
  );
});

test("rejects two handlers for one neutral descriptor", () => {
  assert.throws(
    () => validateHostEffectHandlers([handler, handler]),
    /exactly one handler/u,
  );
});
