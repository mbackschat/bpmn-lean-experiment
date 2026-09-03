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
  CorrelatedMessageInteractionKind,
  EffectExecutionResultKind,
  MessageChannelKind,
  SemanticProcessCompilerId,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";

import {
  EffectActivityResultKind,
  WorkflowChainBudgetKind,
  validateHostEffectHandlers,
  validateHostInteractionPlan,
} from "@bpmn-lean/temporal-testkit";

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

const cancellation = {
  kind: StimulusKind.CancelIncidentProcess,
  delayMs: 250,
} as const;

const publication = {
  kind: CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage,
  commandId: "publish-settlement-confirmation",
  address: {
    definition: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "bpmn-2.0.2-message-key-correlation-draft",
      sourceId: "settlement-confirmation",
      sourceSha256: "a".repeat(64),
      sourceOverlay: null,
    },
    processId: "Process_SettlementConfirmation",
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: "Interface_Settlement",
      interfaceOperationId: "Operation_ConfirmSettlement",
      messageId: "Message_SettlementConfirmed",
    },
    correlationKeyId: "CorrelationKey_Settlement",
  },
  payload: { kind: VariableValueKind.String, value: "settlement-123" },
  delayMs: 1,
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

test("accepts every canonical response variant together", () => {
  assert.doesNotThrow(() =>
    validateHostInteractionPlan([completion, delivery, publication, cancellation])
  );
});

test("keeps a correlated publication target out of runnable configuration", () => {
  assert.throws(
    () => validateHostInteractionPlan([{ ...publication, target: "invented" }]),
    /unknown field target/u,
  );
});

test("keeps cancellation identity out of runnable configuration", () => {
  assert.throws(
    () => validateHostInteractionPlan([{
      ...cancellation,
      incidentId: {
        effectId: {
          processInstanceId: "Privately_Constructed",
          elementId: "ServiceTask_Record",
          activation: 1,
        },
        generation: 1,
      },
    }]),
    /unknown field incidentId/u,
  );
});

test("accepts a canonical Boolean User Task completion patch", () => {
  assert.doesNotThrow(() => validateHostInteractionPlan([{
    ...completion,
    submittedValues: [{
      name: "decision",
      value: { kind: VariableValueKind.Boolean, value: true },
    }],
  }]));
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
    /canonical typed patch/u,
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

test("keeps the Worker-only capacity outcome out of product configuration", () => {
  assert.throws(
    () => validateHostEffectHandlers([{
      ...handler,
      result: {
        kind: EffectActivityResultKind.CapacityExceeded,
        budget: WorkflowChainBudgetKind.EffectActivityResultBytes,
        configuredBound: 64 * 1_024,
        observedValue: 64 * 1_024 + 1,
      },
    }]),
    /effect execution result/u,
  );
});

test("rejects two handlers for one neutral descriptor", () => {
  assert.throws(
    () => validateHostEffectHandlers([handler, handler]),
    /exactly one handler/u,
  );
});
