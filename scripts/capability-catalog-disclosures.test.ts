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
  ["sequentialMultiInstanceUserTask", "restriction", [
    "written atomically only when every slot is filled",
    "No count or byte bound: the Multi-Instance refusal codes are the restrictions",
  ]],
  ["parallelMultiInstanceUserTask", "restriction", [
    "written only when every slot is filled",
    "No count or byte bound: the Multi-Instance refusal codes are the restrictions",
  ]],
  ["multiInstanceActivity", "restriction", [
    "the output collection is written only when every instance has filled its slot",
    "Boundaries belong to the whole Activity",
  ]],
  ["eventSubProcess", "restriction", [
    "A non-interrupting Error start, a Compensation Event Sub-Process at Process level, a looping Event Sub-Process and a boundary on one are refused",
    "under the standards reading so is every interrupting Event Sub-Process",
  ]],
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
  ["interruptingSequentialMultiInstanceBoundaryTimerEvent", "restriction", [
    "one deadline for the Activity, kept through task turnover rather than one per instance",
    "writes no output collection",
  ]],
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
    "such a Service Task without a BPMN Error route may merge several incoming flows in the Process root of a re-entry graph",
    "with one incoming flow, leave on two or more unconditioned flows outside every fork region, its completion taking all of them",
  ]],
  ["embeddedSubProcess", "restriction", [
    "at any depth and with any content the kernel admits",
    "a Sub-Process completes exactly when it owns no token, wait, begun occurrence or child scope, and then continues its parent once",
    "a command addressed to an earlier activation is rejected",
    "a Sub-Process without a start Event is refused (scope.withoutStart)",
  ]],
  ["transaction", "restriction", ["a protocol URI is refused (scope.transaction.method)"]],
  ["compensationEventSubProcess", "restriction", ["One at Process level and a second handler of one subject are refused"]],
  ["compensationHandlerServiceTask", "element", ["Compensation handler Service Task"]],
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
    "a scope completes only when its last branch has ended",
    "may reach its End without a User or Service Task whether or not a Sub-Process of the model declares locals",
  ]],
  ["abstractTask", "restriction", [
    "or on a Parallel branch of the Process root or a Sub-Process body",
    "and so may a branch that ends at its own None End, whether or not a Sub-Process of the model declares locals",
    "Several incoming flows are admitted in the Process root of a re-entry graph",
    "several unconditioned outgoing flows wherever a Parallel fork of that arity is admitted",
  ]],
  ["userTask", "restriction", [
    "may merge several incoming flows in the Process root of a re-entry graph, each arriving token starting a fresh occurrence",
    "With one incoming flow, it may instead leave on two or more unconditioned flows outside every fork region",
  ]],
  ["sendTask", "element", ["Send Task"]],
  ["sendTask", "restriction", [
    "Under the nested scope-data profile only",
    "its handler result must be empty",
    "no Message Flow, messageRef or operationRef is read",
    "or split onto several unconditioned outgoing flows",
  ]],
  ["process", "restriction", [
    "The nested scope-data profile also admits a Process without an embedded Sub-Process",
    "the embedded completion profile, the only other profile reaching these analyses, still requires a Sub-Process or a Call",
  ]],
  ["noneIntermediateThrowEvent", "element", ["None Intermediate Throw Event"]],
  ["noneIntermediateThrowEvent", "restriction", [
    "an Intermediate Throw Event without an EventDefinition",
    "wherever that profile admits a pass-through Abstract Task",
    "with several outgoing flows that one activation puts a token on each",
    "No Event that both merges and splits, asynchronous continuations, listeners, called Processes, Multi-Instance bodies or throw triggers",
  ]],
  ["linkIntermediateEventPair", "element", ["Link Intermediate Throw and Catch Event pair"]],
  ["linkIntermediateEventPair", "restriction", [
    "one throw and one catch of each Link name in one scope of the executed Process",
    "behaves exactly as the Sequence Flow it replaces and publishes no occurrence or wait",
    "Several throws of one name are admitted only where their catch leads to a merging User, Service or Send Task",
    "No other several throws of one name, chains, source or target references",
  ]],
  ["noneEndEvent", "restriction", [
    "each arriving token ends there on its own, never waiting for another flow",
    "Ends inside Sub-Process bodies or the called Process keep one incoming flow",
    "the scope completes only once no branch is live",
  ]],
  ["exclusiveGateway", "restriction", [
    "which passes each arriving token on its own",
    "Choices with one or more conditions and a default, tested in declaration order, and pass-through merges in the Process root body only",
    "never in a model that also forks",
    "a Choice may also omit its default when it has two or more conditional flows",
    "the Start or User Task completion whose closure reached it rolls back",
    "a Choice that a Service or Send Task's result could reach in the same command is refused",
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
