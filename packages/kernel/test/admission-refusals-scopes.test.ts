/**
 * Refusal tests of `admission/scopes.ts`: a Scope the kernel can begin and run. A Scope without a none start Event
 * begins only Activities, a Transaction runs the compensate method, a Scope carries no loop, and a local variable
 * needs the input mapping that gives it its initial value.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, append, base, boundary, duration, elementId, end, eventSubProcess, flow, gateway, loop, mapping, receiveWork, refusalOf,
  refusalTests, replace, scope, start, task, userWork, variable, wired, withFlows, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` becomes an embedded Sub-Process holding `children`, which are given the parent `T`. */
const embedding = (...children: Json[]) => (program: Json): Json =>
  append(task(scope("T", "embedded", { children: children.map((child) => elementId(child)) }))(program), ...children);

/** A child with no incoming flow, which the Scope's implicit start begins. */
const unconnected = { incoming: [], outgoing: [] };
const noneStart = start("SS", null, [], "T");

const transaction = (method: Json | string) => task(scope("T", { transaction: { payload: { method } } }));
const compatibility: Json = { transactionMethods: "compatibilityAsCompensate" };

const compensate: Json = { compensation: { payload: { activity: null, waitForCompletion: true } } };

/** `T` becomes an Event Sub-Process started by a Timer, with the boundaries `env` names. */
const timerEventSubProcess = (env: Json = {}) => task(scope("T", eventSubProcess(duration("PT1S"), false), {}, env));

/**
 * `T` becomes a Sub-Process `XS -> U -> XE` whose User Task `U` is compensable by the unconnected handler `H` inside
 * it; `over` overrides the Sub-Process's own envelope.
 */
const retaining = (over: Json = {}) => (program: Json): Json =>
  withFlows(append(task(scope("T", "embedded", {}, over))(program),
    start("XS", null, [], "T"), activity("U", userWork(), { compensationHandlers: ["H"] }, "T"), end("XE", "none", "T"),
    activity("H", "manual", {}, "T")), flow("xu", "XS", "U"), flow("ux", "U", "XE"));

/** `E` becomes a Compensation End beside the Sub-Process. */
const compensatingEnd = (program: Json): Json => replace(program, "E", end("E", compensate));

/** `T` hands its records to its handler `K`, a Sub-Process `KS -> KE` whose End throws `record`. */
const handledScope = (record: Json | string) => (program: Json): Json =>
  withFlows(append(retaining({ compensationHandlers: ["K"] })(program),
    scope("K", "embedded", {}, {}), start("KS", null, [], "K"), end("KE", record, "K")), flow("kk", "KS", "KE"));

/**
 * `T` becomes a User Task compensable by `HT`, whose Timer boundary `BT` leads to `B`, a User Task compensable by `HB`
 * that leads to `E`; `alsoFromTask` adds a flow from `T` itself to `B`.
 */
const boundaryConnected = (alsoFromTask: boolean) => (program: Json): Json =>
  withFlows(append(task(activity("T", userWork(), { compensationHandlers: ["HT"], boundaries: [boundary("BT", duration("PT1S"))] }))(program),
    activity("B", userWork(), { compensationHandlers: ["HB"] }), activity("HT", "manual"), activity("HB", "manual")),
  flow("bb", "BT", "B"), flow("be", "B", "E"), ...(alsoFromTask ? [flow("tb", "T", "B")] : []));

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
    // BPMN 2.0.2 §10.7.1: an Activity marked `isForCompensation` is outside the normal flow, named by an Association or not.
    code: "scope.implicitStart",
    description: "a Scope whose implicit start would begin a Receive Task not marked for compensation",
    mutate: embedding(activity("R", receiveWork(), unconnected, "T")),
    control: embedding(activity("R", receiveWork(), { ...unconnected, forCompensation: true }, "T")),
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
    // CIB-INT-0039: the compatibility methods run as `##Compensate`; a protocol URI stays refused (PC-TX-01).
    code: "scope.transaction.method",
    description: "a Transaction with a method given by URI, under the compatibility methods",
    mutate: (program) => withOptions(transaction({ other: { uri: "urn:method" } })(program), compatibility),
    control: (program) => withOptions(transaction("store")(program), compatibility),
  },
  {
    code: "scope.transaction.method",
    description: "a Transaction with the image method, unless the compatibility methods run",
    mutate: transaction("image"),
    control: (program) => withOptions(transaction("image")(program), compatibility),
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
  {
    // BPMN 2.0.2 §13.5.5: B's record shows that the boundary Event occurred only when B has no other way in.
    code: "compensation.dependency.boundary",
    description: "a compensable Task reached from a compensable Task's boundary and from another flow",
    mutate: boundaryConnected(true),
    control: boundaryConnected(false),
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
  assert.equal(refusalOf(task(activity("T", userWork(), { compensationHandlers: ["Missing"] }))(base())), "il.reference");
});
