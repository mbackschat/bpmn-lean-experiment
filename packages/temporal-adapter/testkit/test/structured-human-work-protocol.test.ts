import assert from "node:assert/strict";
import { test } from "node:test";

import {
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  EffectTransportMaterial,
  Stimulus,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import {
  canonicalEffectTransportEncoding,
  canonicalStimulusEncoding,
  contentBoundUpdateId,
} from "@bpmn-lean/temporal-protocol";

const taskId = {
  processInstanceId: "Instance_ExpenseExceptionReview",
  elementId: "ReviewException",
  activation: 1,
} as const;

function completion(
  commandId: string,
  submittedValues: ReadonlyArray<VariableBinding>,
): Stimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId,
    submittedValues: [...submittedValues],
  };
}

test("content-binds integer and ordered string-list values without normalization", () => {
  const exact = completion("complete-expense", [
    {
      name: "approvedAmount",
      value: { kind: VariableValueKind.Integer, value: 4250 },
    },
    {
      name: "riskFlags",
      value: {
        kind: VariableValueKind.StringList,
        value: ["policy", "policy"],
      },
    },
  ]);
  assert.equal(
    canonicalStimulusEncoding(exact),
    '["completeUserTaskInstance","complete-expense",["Instance_ExpenseExceptionReview","ReviewException",1],[["approvedAmount",["integer",4250]],["riskFlags",["stringList",["policy","policy"]]]]]',
  );
  assert.notEqual(
    contentBoundUpdateId(exact),
    contentBoundUpdateId(completion("complete-expense", [
      {
        name: "approvedAmount",
        value: { kind: VariableValueKind.Integer, value: 4250 },
      },
      {
        name: "riskFlags",
        value: {
          kind: VariableValueKind.StringList,
          value: ["receipt", "policy"],
        },
      },
    ])),
  );
});

test("enforces binding, completion-patch, and complete-command byte ceilings", () => {
  assert.throws(
    () => canonicalStimulusEncoding(completion("binding-overflow", [{
      name: "value",
      value: { kind: VariableValueKind.String, value: "x".repeat(20_500) },
    }])),
    /binding.*20,?480/u,
  );
  assert.throws(
    () => canonicalStimulusEncoding(completion("patch-overflow", [
      ...["a", "b", "c", "d"].map((name): VariableBinding => ({
        name,
        value: { kind: VariableValueKind.String, value: "x".repeat(18_000) },
      })),
    ])),
    /patch.*65,?536/u,
  );
  assert.throws(
    () => canonicalStimulusEncoding(completion("x".repeat(132_000), [])),
    /command.*131,?072/u,
  );
});

test("keeps the new value arms outside effect transport", () => {
  const material: EffectTransportMaterial = {
    definition: {
      semanticProfile: "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
      sourceId: "expense-exception-review",
      sourceSha256: "a".repeat(64),
      sourceOverlay: null,
      processId: "Process_ExpenseExceptionReview",
    },
    occurrence: {
      processInstanceId: taskId.processInstanceId,
      elementId: "Effect_Forbidden",
      activation: 1,
    },
    descriptor: {
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
    },
    arguments: [{
      name: "value",
      value: { kind: VariableValueKind.Integer, value: 1 },
    }],
  };
  assert.throws(
    () => canonicalEffectTransportEncoding(material),
    /unsupported effect transport variant/iu,
  );
});
