import assert from "node:assert/strict";
import { test } from "node:test";
import { isWellFormedSemanticProcessProgram, isWellFormedSemanticProcessGraph } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import { program, rootScopeId as owner, handlerScopeId as child } from "./interrupting-message-event-subprocess-fixture.ts";

test("standalone Program admits declaration-owned handler entry without a normal entry operation", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
});

const declaration = program.interruptingMessageEventSubProcesses![0]!;
const declarations = (entries: unknown) => ({ ...program, interruptingMessageEventSubProcesses: entries });
const changeOperation = (id: string, patch: object) => ({ ...program, operations: program.operations.map((operation) => operation.id === id ? { ...operation, ...patch } : operation) });
for (const [label, value] of [
  ["missing declaration", { ...program, interruptingMessageEventSubProcesses: undefined }],
  ["empty declaration", declarations([])],
  ["duplicate declaration", declarations([declaration, declaration])],
  ["unknown declaration field", declarations([{ ...declaration, normalOutput: "p:a" }])],
  ["wrong parent", declarations([{ ...declaration, parentScopeId: child }])],
  ["wrong handler", declarations([{ ...declaration, handlerScopeId: owner }])],
  ["parent-owned entry", declarations([{ ...declaration, childEntry: "p:a" }])],
  ["undeclared entry", declarations([{ ...declaration, childEntry: "missing" }])],
  ["aliased start", declarations([{ ...declaration, startEventId: "A" }])],
  ["direct Message channel", declarations([{ ...declaration, channel: { kind: "directMessage", messageId: "Message" } }])],
  ["duplicate producer for child entry", changeOperation("op:fork", { outputs: ["p:a", "p:b", "p:handler"] })],
  ["ordinary continuation substituted", changeOperation("op:handler-done", { kind: "completeScope", parentOutput: "p:a" })],
  ["root handler completion", changeOperation("op:done", { kind: "completeEventSubProcess" })],
  ["cross-branch consumer", changeOperation("op:b", { input: "p:a" })],
  ["cross-branch continuation", changeOperation("op:a", { output: "p:b" })],
  ["handler output escapes", changeOperation("op:handler", { output: "p:end-a" })],
  ["wrong handler task owner", { ...program, operationScopes: program.operationScopes.map((entry) => entry.operationId === "op:handler" ? { ...entry, scopeId: owner } : entry) }],
  ["other profile", { ...program, identity: { ...program.identity, semanticProfile: "bpmn-2.0.2-parallel-fork-join-draft" } }],
  ["other family declaration", { ...program, compensationExecution: {} }],
] as const) {
  test(`standalone Message handler Program refuses ${label}`, () => assert.equal(isWellFormedSemanticProcessProgram(value), false));
}

test("the exported plain graph checker cannot invent a declaration-owned producer", () => {
  assert.equal(isWellFormedSemanticProcessGraph({ semanticProfile: program.identity.semanticProfile,
    processId: program.processId, definitionScopes: program.definitionScopes, operationScopes: program.operationScopes,
    controlPlaceScopes: program.controlPlaceScopes, controlPlaceIds: program.controlPlaces.map(({ id }) => id),
    operations: program.operations as SemanticProcessProgram["operations"],
  }), false);
});


test("standalone Message handler Program permits an explicit eligible-order schedule", () => {
  assert.equal(isWellFormedSemanticProcessProgram({ ...program, internalSchedulingMode: "requireChoiceSchedule" }), true);
});
