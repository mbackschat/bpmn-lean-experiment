import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SemanticOperationKind,
  SemanticProfileId,
  isWellFormedSemanticProcessProgram,
  profileAllowsCheckedProcessShape,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import {
  terminateCheckedNodes,
  terminateProgram,
  terminateRootScopeId,
} from "./terminate-end-event-fixture.ts";

test("admits the exact registered checked and IL multisets", () => {
  assert.equal(
    profileAllowsCheckedProcessShape(
      SemanticProfileId.TerminateEnd,
      terminateCheckedNodes,
      2,
    ),
    true,
  );
  assert.equal(isWellFormedSemanticProcessProgram(terminateProgram), true);
  assert.equal(terminateOperation().origin.elementId, "EndEvent_Terminate");
  assert.equal(
    new Set<string>(Object.values(SemanticProfileId)).has(
      "bpmn-2.0.2-terminate-end-event-draft",
    ),
    true,
  );
});

test("generic admission rejects malformed termination identity, scope, input, and output", () => {
  const operation = terminateOperation();
  const mutations: ReadonlyArray<(value: TerminateOperation) => unknown> = [
    (value) => ({ ...value, id: "" }),
    (value) => ({ ...value, origin: { ...value.origin, elementId: "" } }),
    (value) => ({ ...value, input: "place:missing" }),
    (value) => ({ ...value, scopeId: "scope:missing" }),
    (value) => ({ ...value, output: "place:Flow_ScopeToOuter" }),
  ];
  for (const mutate of mutations) {
    assert.equal(
      isWellFormedSemanticProcessProgram(replaceTerminate(mutate(operation))),
      false,
    );
  }

  assert.equal(isWellFormedSemanticProcessProgram({
    ...terminateProgram,
    operationScopes: terminateProgram.operationScopes.map((ownership) =>
      ownership.operationId === operation.id
        ? { ...ownership, scopeId: terminateRootScopeId }
        : ownership
    ),
  }), false);
});

function replaceTerminate(value: unknown): unknown {
  return {
    ...terminateProgram,
    operations: terminateProgram.operations.map((operation) =>
      operation.kind === SemanticOperationKind.TerminateScope ? value : operation
    ),
  };
}

function terminateOperation(): TerminateOperation {
  const found = terminateProgram.operations.find(
    (candidate) => candidate.kind === SemanticOperationKind.TerminateScope,
  );
  assert.ok(found?.kind === SemanticOperationKind.TerminateScope);
  return found;
}

type TerminateOperation = Extract<
  SemanticProcessProgram["operations"][number],
  { kind: SemanticOperationKind.TerminateScope }
>;
