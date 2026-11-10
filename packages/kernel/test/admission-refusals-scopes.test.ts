/**
 * Refusal tests of `admission/scopes.ts`: a Scope the kernel can begin and run. A Scope without a none start Event
 * begins only Activities, a Transaction runs the compensate method, a Scope carries no loop, and a local variable
 * needs the input mapping that gives it its initial value.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, append, base, boundary, duration, elementId, end, eventSubProcess, flow, gateway, loop, mapping, receiveWork, refusalOf,
  refusalTests, replace, scope, start, task, userWork, variable, wired, withFlows,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` becomes an embedded Sub-Process holding `children`, which are given the parent `T`. */
const embedding = (...children: Json[]) => (program: Json): Json =>
  append(task(scope("T", "embedded", { children: children.map((child) => elementId(child)) }))(program), ...children);

/** A child with no incoming flow, which the Scope's implicit start begins. */
const unconnected = { incoming: [], outgoing: [] };
const noneStart = start("SS", null, [], "T");

const transaction = (method: Json | string) => task(scope("T", { transaction: { payload: { method } } }));

const compensate: Json = { compensation: { payload: { activity: null, waitForCompletion: true } } };

/** `T` becomes an Event Sub-Process started by a Timer, with the boundaries `env` names. */
const timerEventSubProcess = (env: Json = {}) => task(scope("T", eventSubProcess(duration("PT1S"), false), {}, env));

/**
 * `T` becomes a Sub-Process `XS -> U -> XE` whose User Task `U` is compensable by the unconnected handler `H` inside
 * it; `over` overrides the Sub-Process's own envelope.
 */
const retaining = (over: Json = {}) => (program: Json): Json =>
  withFlows(append(task(scope("T", "embedded", {}, over))(program),
    start("XS", null, [], "T"), activity("U", userWork(), { compensationHandler: "H" }, "T"), end("XE", "none", "T"),
    activity("H", "manual", {}, "T")), flow("xu", "XS", "U"), flow("ux", "U", "XE"));

/** `E` becomes a Compensation End beside the Sub-Process. */
const compensatingEnd = (program: Json): Json => replace(program, "E", end("E", compensate));

/** `T` hands its records to its handler `K`, a Sub-Process `KS -> KE` whose End throws `record`. */
const handledScope = (record: Json | string) => (program: Json): Json =>
  withFlows(append(retaining({ compensationHandler: "K" })(program),
    scope("K", "embedded", {}, {}), start("KS", null, [], "K"), end("KE", record, "K")), flow("kk", "KS", "KE"));

export const rows: readonly Row[] = [
  {
    code: "scope.implicitStart",
    description: "a Scope whose implicit start would begin a Gateway",
    mutate: embedding(gateway("G", "parallel", unconnected, "T")),
    control: embedding(gateway("G", "parallel", unconnected, "T"), noneStart),
  },
  {
    code: "scope.implicitStart",
    description: "a Scope whose implicit start would begin a Receive Task",
    mutate: embedding(activity("R", receiveWork(), unconnected, "T")),
    control: embedding(activity("R", "manual", unconnected, "T")),
  },
  {
    code: "scope.transaction.method",
    description: "a Transaction with the store method",
    mutate: transaction("store"),
    control: transaction("compensate"),
  },
  {
    code: "scope.transaction.method",
    description: "a Transaction with a method given by URI",
    mutate: transaction({ other: { uri: "urn:method" } }),
    control: transaction("compensate"),
  },
  {
    code: "scope.multiInstance",
    description: "a Transaction with a loop; an embedded Sub-Process may loop",
    mutate: task(scope("T", { transaction: { payload: { method: "compensate" } } }, {}, { multiInstance: loop({ outputDataItem: null }) })),
    control: task(scope("T", "embedded", {}, { multiInstance: loop({ outputDataItem: null }) })),
  },
  {
    code: "scope.localVariableWithoutInput",
    description: "a local variable no input mapping initializes",
    mutate: task(scope("T", "embedded", { localVariables: ["local"] })),
    control: task(scope("T", "embedded", { localVariables: ["local"] }, { inputs: [mapping("local", variable("y"))] })),
  },
  {
    code: "scope.eventSubProcess.boundary",
    description: "a boundary on an Event Sub-Process",
    mutate: timerEventSubProcess({ boundaries: [boundary("B", duration("PT1S"))] }),
    control: timerEventSubProcess(),
  },
  {
    code: "compensation.implicit",
    description: "a compensable Task in a Sub-Process without a handler, beside a Compensation throw",
    mutate: (program) => compensatingEnd(retaining()(program)),
    control: retaining(),
  },
  {
    code: "compensation.recursive",
    description: "a compensable Task in a Sub-Process whose handler throws Compensation",
    mutate: handledScope(compensate),
    control: handledScope("none"),
  },
];

refusalTests("scopes", rows);

test("scopes: an element its parent does not list, or a child naming another parent, is refused as il.reference", () => {
  const wiredScope = wired(append(task(scope("T", "embedded"))(base()), start("XS", null, [], "T")));
  const listing = (children: string[]): Json => replace(wiredScope, "T", (() => {
    const element = (wiredScope.elements as Json[]).find((entry) => elementId(entry) === "T") as Json;
    const body = element.scope as Json;
    return { scope: { ...body, payload: { ...(body.payload as Json), children } } };
  })());
  assert.equal(refusalOf(listing(["XS"]), true), null);
  assert.equal(refusalOf(listing([]), true), "il.reference");
  assert.equal(refusalOf(listing(["XS", "E"]), true), "il.reference");
  assert.equal(refusalOf(task(activity("T", userWork(), { compensationHandler: "Missing" }))(base())), "il.reference");
});
