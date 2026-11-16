/**
 * Where the search for a catcher goes after a compensation handler's context under `propagatesFromHandler`
 * (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md, CIB-INT-0038, #159): through the handler's model scopes, not
 * the trigger's. The context stands for the completed subject's place and offers the subject's catchers only when the
 * subject encloses the handler; the search then goes on from the scope occurrence holding the subject's record. A
 * catcher at the context other than a non-interrupting boundary without catch variables is refused. Every handler here
 * raises the Escalation `UNDO` once its User Task `HR` completes; `R` is the process's Event Sub-Process catching it into
 * `RW`, and `BX`, a boundary of the subject `P`, catches it into `AtSubject`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Outcome } from "@bpmn-lean/kernel";

import {
  boundary, compensationTrigger, end, errorTrigger, escalationTrigger, eventSubProcess, flow, loop, scope, start, variable,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import type { Part } from "./compensation-support.ts";
import {
  chain, compensateAll, complete, drive, driveFrom, handlerScope, parts, raiseError, throwing, userTask, waiting,
} from "./compensation-support.ts";

const propagates: Json = { compensationHandlerFailure: "propagatesFromHandler" };
const undo = escalationTrigger({ code: "UNDO" });
const raiseUndo: Json = { escalation: { payload: { code: "UNDO" } } };

/** The Event Sub-Process `id` in `parent` that `trigger` starts into its User Task `<id>W`. */
const catching = (id: string, parent: string | null, trigger: Json = undo, interrupting = false): Part => ({
  elements: [
    scope(id, eventSubProcess(trigger, interrupting), {}, {}, parent), start(`${id}S`, trigger, [], id),
    userTask(`${id}W`, null, id), end(`${id}E`, "none", id),
  ],
  flows: [flow(`${id}0`, `${id}S`, `${id}W`), flow(`${id}1`, `${id}W`, `${id}E`)],
});

/** `P`'s Compensation Event Sub-Process `H`, running `HS -> HR -> HX`, where `HX` raises `UNDO`. */
const compensationEsp: Part = {
  elements: [
    scope("H", eventSubProcess(compensationTrigger, true), {}, { incoming: [], outgoing: [], forCompensation: true }, "P"),
    start("HS", compensationTrigger, [], "H"), userTask("HR", null, "H"), end("HX", raiseUndo, "H"),
  ],
  flows: [flow("h0", "HS", "HR"), flow("h1", "HR", "HX")],
};

/** `P`'s boundary handler `HB` beside it, running `HBS -> HR -> HBE`, where `HBE` raises `UNDO`. */
const besideHandler: Part = handlerScope("HB", [userTask("HR", null, "HB")], raiseUndo);

/** The process's catcher `R` and the boundary `BX`'s flow to `AtSubject`. */
const outer: Part = parts(catching("R", null), {
  elements: [userTask("AtSubject"), end("AtSubjectE")],
  flows: [flow("x0", "BX", "AtSubject"), flow("x1", "AtSubject", "AtSubjectE")],
});

type Subject = Readonly<{
  handler?: "eventSubProcess" | "beside"; bx?: Json; looping?: boolean; inside?: Part; options?: Json; within?: boolean;
}>;

/**
 * `S -> P -> C -> After -> E`, where `C` compensates everything it sees and `P` runs `PS -> W -> PE` with the
 * non-interrupting boundary `BX` (overridden by `bx`); `looping` runs `P` over `items`, and `within` puts `P` inside a
 * Sub-Process `U` without a handler.
 */
function subject({ handler = "eventSubProcess", bx = {}, looping = false, inside = parts(), options = {}, within = false }: Subject): Json {
  const env: Json = {
    compensationHandlers: [handler === "beside" ? "HB" : "H"],
    boundaries: [boundary("BX", undo, { interrupting: false, ...bx })],
    ...(looping ? { multiInstance: loop({ mode: "sequential", count: { collection: { items: variable("items") } }, outputDataItem: null }) } : {}),
  };
  const body: Part = {
    elements: [
      scope("P", "embedded", {}, env, within ? "U" : null), start("PS", null, [], "P"), userTask("W", null, "P"), end("PE", "none", "P"),
    ],
    flows: [flow("p0", "PS", "W"), flow("p1", "W", "PE")],
  };
  const wrapper: Part = within
    ? { elements: [start("US", null, [], "U"), end("UE", "none", "U")], flows: [flow("u0", "US", "P"), flow("u1", "P", "UE")] }
    : parts();
  const head = within ? scope("U", "embedded") : body.elements[0] as Json;
  return chain([head, throwing("C", compensateAll), userTask("After")], "none",
    parts(within ? body : { elements: body.elements.slice(1), flows: body.flows }, wrapper,
      handler === "beside" ? besideHandler : compensationEsp, inside, outer),
    { ...propagates, ...options });
}

const items: Json[] = [{ name: "items", value: { kind: "list", value: [{ kind: "string", value: "i0" }, { kind: "string", value: "i1" }] } }];

/** The failure of an outcome that did not commit. */
function failure(outcome: Outcome): unknown {
  assert.ok(!outcome.ok, JSON.stringify(outcome));
  return outcome.failure;
}

const unsupported = (code: string): Json => ({ tag: "unsupported", code });

test("a Compensation Event Sub-Process's Escalation is caught at its subject's own boundary, not at the process", () => {
  const program = subject({});
  assert.deepEqual(waiting(drive(program, complete("W"))), ["HR"]);
  assert.deepEqual(waiting(drive(program, complete("W"), complete("HR"))), ["After", "AtSubject"]);
});

test("under failsInstance the search stops at the handler's context, where an Escalation has no selected meaning", () => {
  assert.deepEqual(failure(drive(subject({ options: { compensationHandlerFailure: "failsInstance" } }), complete("W"), complete("HR"))),
    unsupported("compensation-handler-escalation"));
});

test("a subject's other Event Sub-Process that would catch at the handler's context is refused", () => {
  assert.deepEqual(failure(drive(subject({ inside: catching("PX", "P") }), complete("W"), complete("HR"))),
    unsupported("compensation-context-event-subprocess"));
});

test("a subject's interrupting boundary that would catch at the handler's context is refused", () => {
  assert.deepEqual(failure(drive(subject({ bx: { interrupting: true } }), complete("W"), complete("HR"))),
    unsupported("compensation-context-interrupting-boundary"));
});

test("a subject's boundary that would write catch variables at the handler's context is refused", () => {
  const bx = { subscription: { trigger: escalationTrigger({ code: "UNDO", codeVariable: "caught" }), outputs: [], alternatives: [], parallelMultiple: false } };
  assert.deepEqual(failure(drive(subject({ bx }), complete("W"), complete("HR"))), unsupported("compensation-context-catch-variables"));
});

test("a subject's boundary that would fire into a scope occurrence that no longer declares it is refused", () => {
  const program = subject({ within: true, options: { implicitCompensation: "refused" } });
  assert.deepEqual(failure(drive(program, complete("W"), complete("HR"))), unsupported("compensation-context-boundary-unplaced"));
});

test("a boundary handler beside its subject passes the subject's catchers to the process's", () => {
  assert.deepEqual(waiting(drive(subject({ handler: "beside" }), complete("W"), complete("HR"))), ["After", "RW"]);
});

test("a Multi-Instance instance's context offers no boundary; the body's group context offers the subject's", () => {
  const program = subject({ looping: true });
  const ran = [complete("W", 1), complete("W", 2)];
  assert.deepEqual(waiting(driveFrom(program, items, ...ran)), ["HR"]);
  assert.deepEqual(waiting(driveFrom(program, items, ...ran, complete("HR", 1))), ["AtSubject", "HR"]);
});

test("a Multi-Instance instance's context offers the subject's other Event Sub-Processes", () => {
  const program = subject({ looping: true, inside: catching("PX", "P") });
  assert.deepEqual(failure(driveFrom(program, items, complete("W", 1), complete("W", 2), complete("HR", 1))),
    unsupported("compensation-context-event-subprocess"));
});

test("a Multi-Instance body's group context offers no boundary for an instance handler beside the subject", () => {
  const program = subject({ looping: true, handler: "beside" });
  assert.deepEqual(waiting(driveFrom(program, items, complete("W", 1), complete("W", 2), complete("HR", 1))), ["HR", "RW"]);
});

test("a group's context offers the completed Sub-Process's boundary to a handler inside it", () => {
  const group: Part = {
    elements: [
      scope("G", "embedded", {}, { boundaries: [boundary("BX", undo, { interrupting: false })] }), start("GS", null, [], "G"),
      userTask("T", "HT", "G"), end("GE", "none", "G"),
      ...handlerScope("HT", [userTask("HR", null, "HT")], raiseUndo, "G").elements,
    ],
    flows: [flow("g0", "GS", "T"), flow("g1", "T", "GE"), ...handlerScope("HT", [userTask("HR", null, "HT")], raiseUndo, "G").flows],
  };
  const program = chain([group.elements[0] as Json, throwing("C", compensateAll), userTask("After")], "none",
    parts({ elements: group.elements.slice(1), flows: group.flows }, outer), { ...propagates, implicitCompensation: "everySubProcess" });
  assert.deepEqual(waiting(drive(program, complete("T"), complete("HR"))), ["After", "AtSubject"]);
});

/** `S -> A -> G -> Hold -> E`, where `G` throws the Escalation `GO` that the process's Event Sub-Process `TE` catches. */
function triggeredInEventSubProcess(): Json {
  const trigger: Part = {
    elements: [
      scope("TE", eventSubProcess(escalationTrigger({ code: "GO" }), false)), start("TES", escalationTrigger({ code: "GO" }), [], "TE"),
      throwing("TC", compensateAll, "TE"), userTask("TW", null, "TE"), end("TEE", "none", "TE"),
    ],
    flows: [flow("t0", "TES", "TC"), flow("t1", "TC", "TW"), flow("t2", "TW", "TEE")],
  };
  return chain([userTask("A", "HA"), throwing("G", { escalation: { payload: { code: "GO" } } }), userTask("Hold")], "none",
    parts(handlerScope("HA", [userTask("HR", null, "HA")], raiseUndo), trigger, catching("TX", "TE"), catching("R", null)), propagates);
}

test("a handler compensated from an Event Sub-Process raises past the trigger's Event Sub-Processes to its own scopes", () => {
  const program = triggeredInEventSubProcess();
  assert.deepEqual(waiting(drive(program, complete("A"))), ["HR", "Hold"]);
  assert.deepEqual(waiting(drive(program, complete("A"), complete("HR"))), ["Hold", "RW", "TW"]);
});

test("a handler's raise that an Event Sub-Process of a scope an interrupting one runs in would catch is refused", () => {
  const program = chain([userTask("A", "HA")], raiseError("BOOM"), parts(
    handlerScope("HA", [userTask("HR", null, "HA")], raiseUndo), catching("R", null),
    {
      elements: [
        scope("IE", eventSubProcess(errorTrigger({ code: "BOOM" }), true)), start("IES", errorTrigger({ code: "BOOM" }), [], "IE"),
        throwing("IC", compensateAll, "IE"), end("IEE", "none", "IE"),
      ],
      flows: [flow("i0", "IES", "IC"), flow("i1", "IC", "IEE")],
    },
  ), propagates);
  assert.deepEqual(waiting(drive(program, complete("A"))), ["HR"]);
  assert.deepEqual(failure(drive(program, complete("A"), complete("HR"))), unsupported("compensation-raise-in-interrupted-scope"));
});
