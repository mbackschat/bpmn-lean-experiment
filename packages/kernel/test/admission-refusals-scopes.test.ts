/**
 * Refusal tests of `admission/scopes.ts`: a Scope the kernel can begin and run. A Scope without a none start Event
 * begins only Activities, a Transaction runs the compensate method, a Scope carries no loop, and a local variable
 * needs the input mapping that gives it its initial value.
 */
import {
  activity, append, elementId, gateway, loop, mapping, receiveWork, refusalTests, scope, start, task, variable,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` becomes an embedded Sub-Process holding `children`, which are given the parent `T`. */
const embedding = (...children: Json[]) => (program: Json): Json =>
  append(task(scope("T", "embedded", { children: children.map((child) => elementId(child)) }))(program), ...children);

/** A child with no incoming flow, which the Scope's implicit start begins. */
const unconnected = { incoming: [], outgoing: [] };
const noneStart = start("SS", null, [], "T");

const transaction = (method: Json | string) => task(scope("T", { transaction: { payload: { method } } }));

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
    description: "a Sub-Process with a loop",
    mutate: task(scope("T", "embedded", {}, { multiInstance: loop() })),
  },
  {
    code: "scope.localVariableWithoutInput",
    description: "a local variable no input mapping initializes",
    mutate: task(scope("T", "embedded", { localVariables: ["local"] })),
    control: task(scope("T", "embedded", { localVariables: ["local"] }, { inputs: [mapping("local", variable("y"))] })),
  },
];

refusalTests("scopes", rows);
