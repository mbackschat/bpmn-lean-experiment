import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SemanticOperationKind,
  callOperationsArePaired,
} from "@bpmn-lean/semantic-core";
import type { SemanticOperation } from "@bpmn-lean/semantic-core";
import {
  callActivityProgram as program,
  calledScopeId,
  callerScopeId,
} from "./call-activity-fixture.ts";

function paired(operations: ReadonlyArray<SemanticOperation>): boolean {
  return callOperationsArePaired(
    program.processId,
    program.definitionScopes,
    operations,
    new Map([
      ...program.operationScopes.map(({ operationId, scopeId }) =>
        [operationId, scopeId] as const),
      ["operation:AliasedCall", callerScopeId],
      ["operation:UnclaimedReturn", calledScopeId],
    ]),
    new Map(program.controlPlaceScopes.map(({ controlPlaceId, scopeId }) =>
      [controlPlaceId, scopeId])),
  );
}

test("accepts the original one-to-one Call pair", () => {
  assert.equal(paired(program.operations), true);
});

for (const distinctInvokeId of [false, true]) {
  test(`rejects balanced many-to-one Call pairing with ${distinctInvokeId ? "distinct" : "duplicate"} invoke identity`, () => {
    const invoke = program.operations.find(({ kind }) =>
      kind === SemanticOperationKind.InvokeProcess);
    const returned = program.operations.find(({ kind }) =>
      kind === SemanticOperationKind.ReturnProcess);
    assert.ok(invoke?.kind === SemanticOperationKind.InvokeProcess);
    assert.ok(returned?.kind === SemanticOperationKind.ReturnProcess);
    assert.equal(paired([
      ...program.operations,
      { ...invoke, id: distinctInvokeId ? "operation:AliasedCall" : invoke.id },
      { ...returned, id: "operation:UnclaimedReturn" },
    ]), false);
  });
}
