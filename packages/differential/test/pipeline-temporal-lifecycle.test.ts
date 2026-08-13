import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProcessCommandResultKind,
} from "@bpmn-lean/temporal-testkit";

import {
  verifyTemporalPostTerminalLifecycle,
} from "./pipeline-temporal-lifecycle.ts";
import {
  TemporalCaseRelation,
} from "./pipeline-types.ts";

const scenario = {
  id: "terminal-lifecycle-probe",
  stimuli: [{ commandId: "cancel-1" }],
};
const receipt = {
  marker: "cancelled-receipt",
};

test("keeps exact semantic comparison free of adapter-only closure results", () => {
  assert.equal(verifyTemporalPostTerminalLifecycle(
    scenario,
    TemporalCaseRelation.ExactSemantic,
    execution(null, null),
  ), null);
  assert.throws(() => verifyTemporalPostTerminalLifecycle(
    scenario,
    TemporalCaseRelation.ExactSemantic,
    execution(closedResult("cancel-1", receipt), receipt),
  ), /unexpected post-terminal result/u);
});

test("requires the retained terminal receipt for cancellation closure evidence", () => {
  assert.equal(verifyTemporalPostTerminalLifecycle(
    scenario,
    TemporalCaseRelation.ExactSemanticWithClosedReceipt,
    execution(closedResult("cancel-1-after-close", receipt), receipt),
  ), ProcessCommandResultKind.ProcessClosed);
  assert.throws(() => verifyTemporalPostTerminalLifecycle(
    scenario,
    TemporalCaseRelation.ExactSemanticWithClosedReceipt,
    execution(
      closedResult("cancel-1-after-close", { marker: "drifted" }),
      receipt,
    ),
  ), /did not retain the terminal receipt/u);
});

function execution(
  postTerminalResult: ReturnType<typeof closedResult> | null,
  terminalReceipt: unknown,
) {
  return {
    interactionEvidence: { postTerminalResult },
    receipt: terminalReceipt,
  };
}

function closedResult(
  commandId: string,
  terminalReceipt: unknown,
) {
  return {
    kind: ProcessCommandResultKind.ProcessClosed,
    commandId,
    receipt: terminalReceipt,
  };
}
