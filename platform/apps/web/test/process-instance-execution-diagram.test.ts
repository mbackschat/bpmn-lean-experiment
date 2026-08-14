import assert from "node:assert/strict";
import test from "node:test";

import {
  executionScopeKey,
  executionTokenKey,
} from "../src/process-instance-position-identity.ts";

test("position React keys stay collision-free when identity components contain delimiters", () => {
  const ownerA = {
    processInstanceId: "instance:scope",
    definitionScopeId: "child/one",
    activation: 1,
  } as const;
  const ownerB = {
    processInstanceId: "instance",
    definitionScopeId: "scope:child/one",
    activation: 1,
  } as const;

  assert.notEqual(
    executionTokenKey({ sequenceFlowId: "flow", owner: ownerA, multiplicity: 1 }),
    executionTokenKey({ sequenceFlowId: "flow", owner: ownerB, multiplicity: 1 }),
  );
  assert.notEqual(
    executionScopeKey({ id: ownerA, parent: null, bpmnElementId: "Process" }),
    executionScopeKey({ id: ownerB, parent: null, bpmnElementId: "Process" }),
  );
});
