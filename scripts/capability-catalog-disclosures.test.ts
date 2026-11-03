import assert from "node:assert/strict";
import { test } from "node:test";

import { mvpBpmnCapabilities } from "../model-corpus/mvp-capabilities.ts";
import type { MvpBpmnCapabilityId } from "../model-corpus/mvp-capabilities.ts";

// The boundaries each catalog row must disclose, checked against the catalog text itself so a wording change fails
// here, in the fast guards, rather than only in the Product 2 panel test that renders the row
// (`platform/apps/web/test/capabilities-panel.test.ts`, which now checks rendering only).
const requiredDisclosures: ReadonlyArray<readonly [MvpBpmnCapabilityId, "element" | "restriction", readonly string[]]> = [
  ["timerStartEvent", "element", ["Timer Start Event"]],
  ["timerStartEvent", "restriction", ["no recurrence or calendar form"]],
  ["sequentialMultiInstanceUserTask", "element", ["Sequential Multi-Instance User Task"]],
  ["sequentialMultiInstanceUserTask", "restriction", ["atomic index-ordered String-list output"]],
  ["messagePayloadCatchEvent", "element", ["Message Intermediate Catch Event with a direct Data Output"]],
  ["messagePayloadCatchEvent", "restriction", [
    "absent payload is refused and leaves the subscription live",
    "The portable Message-payload profile instead admits one structured item",
    "never a root List",
    "writes a copy of it to the Property",
    "Process Start and User Task completion carry no values there",
    "a hosted Start is refused when the reserved payload delivery cannot fit the capacity envelope",
    "the browser offers no delivery form for these values",
    "earlier profiles refuse structured payloads",
  ]],
  ["messageKeyCorrelation", "element", ["Definition-scoped Message key correlation"]],
  ["messageKeyCorrelation", "restriction", [
    "exactly one matching Process instance and preserves every instance on zero or ambiguous matches",
  ]],
  ["interruptingSequentialMultiInstanceBoundaryTimerEvent", "element", [
    "Interrupting Timer Boundary Event on sequential Multi-Instance User Task",
  ]],
  ["interruptingSequentialMultiInstanceBoundaryTimerEvent", "restriction", ["publishes no partial output"]],
  ["interruptingUserTaskBoundaryMessageEvent", "element", ["Interrupting Message Boundary Event on User Task"]],
  ["interruptingUserTaskBoundaryMessageEvent", "restriction", [
    "payload-free withdrawal Message withdraws the active User Task",
  ]],
  ["directDataInputOutputUserTask", "restriction", [
    "The portable handoff profile instead carries one structured item",
    "through exactly two serial User Tasks",
    "an exact Decimal with a signed 64-bit coefficient and scale 0..6",
    "an Integer in 0..2^53−1",
    "never a root List",
    "A hosted Start whose successful journey cannot fit the capacity envelope is refused",
    "the browser offers no form editor for these values",
    "Message, effect, Call, Multi-Instance and expression use of them is excluded",
  ]],
  ["serviceTask", "restriction", [
    "The portable effect-data profile instead admits a serial chain of Service Tasks without Human Tasks",
    "never a root List",
    "a handler changes Process data only through its result",
    "A hosted Start is refused when the reserved result of a task or the successful journey cannot fit the capacity envelope",
    "earlier profiles refuse structured results",
  ]],
  ["embeddedSubProcess", "restriction", [
    "The embedded completion profile also admits ordinary Sub-Processes nested to depth three whose bodies hold only User Tasks",
    "a Sub-Process completes exactly when it owns no token, User Task, open effect or child scope",
    "continues once at its own parent without touching concurrent work outside it",
    "a Start or completion closure of more than eight steps or a hosting instance identity above 256 UTF-8 bytes is refused before Workflow start",
    "CIB agreement is retained only for the one-level fixture",
    "every arriving branch starts its own concurrent activation of that Sub-Process, which completes alone and continues once",
    "counting such a target and its successors once per branch",
    "The nested scope-data profile instead admits ordinary Sub-Processes nested to depth three in one serial path",
    "a read resolves to the nearest enclosing declaring frame, otherwise the Process",
    "a write updates that owner and never creates a local",
    "every local retires with its Sub-Process",
    "A User Task completion may name only declared locals, within 16,384 canonical bytes",
    "a hosted Start whose structured values cannot fit the capacity envelope is refused",
    "an effect's arguments are fixed when it is armed, so a sibling's later write never reaches an open effect",
    "a run with Parallel branches or root-body Exclusive Gateways whose data outgrows a hosted budget ends with a typed capacity failure",
    "iterations being bounded only by the hosted continuation and Run bounds",
    "only the retained models are measured clear of the untyped retained Run trace path",
    "each re-entry is a fresh activation whose locals initialize afresh from the enclosing values",
    "a completion addressed to an earlier activation is rejected unchanged",
    "A model with root-body Exclusive Gateways whose automatic burst from Start or any resumption exceeds eight steps is refused at admission",
    "a serial model of the profile has no such rule, so one whose completion closure exceeds eight steps is admitted and that completion rolls back on every attempt",
    "Exclusive Gateways inside a Sub-Process body or the called Process",
  ]],
  ["callActivityVariableMappings", "restriction", [
    "up to two Calls of one in-document Process of one to three serial User Tasks",
    "on the serial path of an embedded Sub-Process body at depth one or two",
    "an absent source becoming a present null",
    "called tasks read and write only their own Call's copied names and never reach caller data",
    "a target that an enclosing Sub-Process declares lands in that Sub-Process's local",
    "a second Call of the same Process gets its own called instance and task activations",
    "a third Call, nested Calls, called Service Tasks",
    "Both Calls may also sit on concurrent Parallel branches inside a Sub-Process body",
    "each copying structured values into and out of its own called instance in either completion order",
    "a hosted Start whose copied values cannot fit the capacity envelope is refused",
    "each call reads its inputs and writes its outputs through its own caller occurrence, whatever the completion order",
    "one Process is never called both with and without mappings",
    "each invocation gets a fresh called instance holding only its own copied inputs",
  ]],
  ["parallelGateway", "restriction", [
    "paired forks and joins of two or more branches inside Sub-Process bodies",
    "a fork whose task branches all end at one Exclusive merge into a Sub-Process",
    "The nested scope-data profile admits the same paired forks and joins inside Sub-Process bodies and in the Process root body, never into a merge",
    "a model whose root body forks holds no Call in it",
  ]],
  ["abstractTask", "restriction", [
    "or on a Parallel branch of the Process root or a Sub-Process body",
    "a branch that ends at its own None End must reach a User or Service Task before it",
  ]],
  ["process", "restriction", [
    "The nested scope-data profile also admits a Process without an embedded Sub-Process",
    "the embedded completion profile, the only other profile reaching these analyses, still requires a Sub-Process or a Call",
  ]],
  ["noneIntermediateThrowEvent", "element", ["None Intermediate Throw Event"]],
  ["noneIntermediateThrowEvent", "restriction", [
    "an Intermediate Throw Event without an EventDefinition",
    "wherever that profile admits a pass-through Abstract Task",
    "No several flows, asynchronous continuations, listeners, called Processes, Multi-Instance bodies or throw triggers",
  ]],
  ["noneEndEvent", "restriction", [
    "each arriving token ends there on its own, never waiting for another flow",
    "Ends inside Sub-Process bodies or the called Process keep one incoming flow",
  ]],
  ["exclusiveGateway", "restriction", [
    "which passes each arriving token on its own",
    "Choices with one or more conditions and a default, tested in declaration order, and pass-through merges in the Process root body only",
    "never in a model that also forks",
  ]],
];

test("every catalog row discloses its required boundaries in its own text", () => {
  for (const [id, field, phrases] of requiredDisclosures) {
    const row = mvpBpmnCapabilities.find((capability) => capability.id === id);
    assert.ok(row !== undefined, `catalog row ${id} must exist`);
    for (const phrase of phrases) {
      assert.ok(row[field].includes(phrase), `${id} ${field} must disclose: ${phrase}`);
    }
  }
});
