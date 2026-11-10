/**
 * Under `BranchSchedule.declarationDepthFirst` a parallel Multi-Instance body begins its instances in item order, each
 * running to its next wait, join or end before the next begins, and all of them before the work queued beneath the body:
 * CIB starts the instance executions from the last index down onto its LIFO operation queue, so instance 0 runs first
 * (CIB-OP-0016, `ParallelMultiInstanceActivityBehavior.java:56-61`), and skips the start of an execution a completion
 * condition ended meanwhile (`AtomicOperationInvocation.java:77-82`). The oracle is the open `Check` waits after the
 * start, with the `loopCounter` and the entry read each holds, and the root's `last`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
/** The options the CIB profiles select, on the fixture's relations. */
const options: Json = {
  ...(slice["options"] as Json), evaluator: "juel", submission: "installsVariables", undeclaredWrite: "atInstanceRoot",
  errorPathOutputs: "mapped", raisedCallOutputs: "atCalledRoot", technicalFailure: "incident", incidentProcessCancellation: true,
  conditionOrder: "beforeOutputs", multiInstanceFinalBody: "modeSpecific", abnormalScopeEnd: "completesNormally",
  unhandledError: "endsThrowingPath", errorCatchVariables: "eventScope", multiInstanceBinding: "loopReferences",
  effectResultValues: "activityLocals", outputContext: "activityScope", multiInstanceCounters: "cibLocals",
  multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt", businessRuleTask: "decisionTable",
  inclusiveJoinReach: "outgoingOnly", branchSchedule: "declarationDepthFirst",
};
const header = (id: string, sourceType: string, parent: string | null = null): Json =>
  ({ id, origin: { definition: null, sourceId: id }, sourceType, parent });
const read = (name: string): Json => ({ variable: { name } });
const io = (target: string, source: Json): Json => ({ target, source, dialect: "ioParameter" });
const envelope = (incoming: string[], outgoing: string[], over: Json = {}): Json => ({
  incoming, outgoing, inputs: [], outputs: [], boundaries: [], multiInstance: null, compensationHandler: null,
  defaultFlow: null, asyncBefore: false, asyncAfter: false, ...over,
});
const user = { user: { payload: { name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null,
  formFields: [], dueDate: null, followUpDate: null, priority: null } } };
const start = (id: string, outgoing: string, parent: string | null = null): Json =>
  ({ start: { header: header(id, "startEvent", parent), payload: { subscription: null, outgoing: [outgoing] } } });
const end = (id: string, incoming: string, parent: string | null = null): Json =>
  ({ event: { header: header(id, "endEvent", parent), payload: { role: { throw: { record: "none" } }, placement: "finish",
    incoming: [incoming], outgoing: [], alternativeThrows: [] } } });
const task = (id: string, incoming: string, outgoing: string, outputs: Json[], parent: string | null = null): Json =>
  ({ activity: { header: header(id, "task", parent), payload: { work: "none", envelope: envelope([incoming], [outgoing], { outputs }) } } });
const flow = (id: string, source: string, target: string): Json => ({ id, source, target, condition: null });
/** `nrOfCompletedInstances >= 1`. */
const firstCompletion: Json = { juel: { nodes: [{ identifier: { name: "nrOfCompletedInstances" } }, { integer: { digits: "1" } },
  { binary: { payload: { op: "ge", left: 0, right: 1 } } }] } };

/**
 * The parallel Sub-Process `Lot` over `items`, entered from `incoming`, reading `prior = ${entry}` on each instance's entry:
 * `Lot_Start → Mark → Check → Lot_End` with `Mark` writing `last = ${item}`, or `Lot_Start → Mark → Lot_End` when
 * `waits` is false.
 */
function lot(incoming: string, outgoing: string, entry: string, waits: boolean, completionCondition: Json | null = null): Json[] {
  const inner = waits ? ["Lot_Start", "Mark", "Check", "Lot_End"] : ["Lot_Start", "Mark", "Lot_End"];
  return [
    { scope: { header: header("Lot", "subProcess"), payload: { kind: "embedded", children: inner, localVariables: ["prior"],
      envelope: envelope([incoming], [outgoing], { inputs: [io("prior", read(entry))], multiInstance: {
        mode: "parallel", count: { collection: { items: read("items") } }, elementVariable: "item", completionCondition,
        inputDataItem: null, outputDataItem: null, outputCollection: null, mutableCollection: "entrySnapshot",
        asyncBefore: false, asyncAfter: false, loopDataInputRef: null, inputDataItemName: null,
      } }) } } },
    start("Lot_Start", "To_Mark", "Lot"),
    task("Mark", "To_Mark", waits ? "To_Check" : "To_LotEnd", [io("last", read("item"))], "Lot"),
    ...(waits ? [{ activity: { header: header("Check", "userTask", "Lot"), payload: { work: user, envelope: envelope(["To_Check"],
      ["To_LotEnd"], { inputs: [io("seenPrior", read("prior")), io("position", read("loopCounter"))] }) } } }] : []),
    end("Lot_End", "To_LotEnd", "Lot"),
  ];
}
const lotFlows = (waits: boolean): Json[] => waits
  ? [flow("To_Mark", "Lot_Start", "Mark"), flow("To_Check", "Mark", "Check"), flow("To_LotEnd", "Check", "Lot_End")]
  : [flow("To_Mark", "Lot_Start", "Mark"), flow("To_LotEnd", "Mark", "Lot_End")];

const program = (elements: Json[], flows: Json[]): Json => ({ ...slice, options, elements, flows });

const text = (value: string): Json => ({ kind: "string", value });
const begin = (variables: Array<readonly [string, string]>): Json => ({ kind: "start", commandId: "start", instanceId: "I",
  variables: [{ name: "items", value: { kind: "stringList", value: ["a", "b", "c"] } },
    ...variables.map(([name, value]) => ({ name, value: text(value) }))] });

/** After the start: each open wait as `element#activation`, with its inputs as `name=value`, and the root's `last`. */
function afterStart(json: Json, stimulus: Json): [string[], unknown] {
  const trace = (runScenario(json, { kind: "scenario", id: "mi", profile: "p", stimuli: [stimulus] }) as { trace: Json[] }).trace;
  const state = trace.find((entry) => entry["kind"] === "state");
  assert.ok(state !== undefined, JSON.stringify(trace));
  const waits = (state["openWaits"] as Json[]).map((wait) => {
    const id = wait["id"] as Json;
    const inputs = (((wait["detail"] as Json | undefined)?.["inputs"] ?? []) as Json[])
      .map((binding) => `${String(binding["name"])}=${String((binding["value"] as Json)["value"])}`);
    return `${String(id["elementId"])}#${String(id["activation"])} ${inputs.join(" ")}`.trim();
  });
  const last = (state["variables"] as Json[]).find((binding) => binding["name"] === "last")?.["value"];
  return [waits, (last as Json | undefined)?.["value"]];
}

test("each instance runs to its next wait before the next begins, so an entry read sees the earlier instances' writes", () => {
  const json = program([start("Start", "To_Lot"), ...lot("To_Lot", "To_End", "last", true), end("End", "To_End")],
    [flow("To_Lot", "Start", "Lot"), ...lotFlows(true), flow("To_End", "Lot", "End")]);
  assert.deepEqual(afterStart(json, begin([["last", "none"]])), [
    ["Check#1 position=0 seenPrior=none", "Check#2 position=1 seenPrior=a", "Check#3 position=2 seenPrior=b"], "c",
  ]);
});

test("an instance a completion condition removes before its turn never begins", () => {
  const json = program([start("Start", "To_Lot"), ...lot("To_Lot", "To_After", "last", false, firstCompletion),
    { activity: { header: header("After", "userTask"), payload: { work: user,
      envelope: envelope(["To_After"], ["To_End"], { inputs: [io("seenLast", read("last"))] }) } } }, end("End", "To_End")],
  [flow("To_Lot", "Start", "Lot"), ...lotFlows(false), flow("To_After", "Lot", "After"), flow("To_End", "After", "End")]);
  assert.deepEqual(afterStart(json, begin([["last", "none"]])), [["After#1 seenLast=a"], "a"]);
});

test("the instances still to begin sit above a sibling branch's token, so none of them reads that branch's write", () => {
  const json = program([
    start("Start", "To_Fork"),
    { gateway: { header: header("Fork", "parallelGateway"), payload: { kind: "parallel", incoming: ["To_Fork"], outgoing: ["To_Lot", "To_Flag"] } } },
    ...lot("To_Lot", "To_End", "flag", true), end("End", "To_End"),
    task("Flag", "To_Flag", "To_FlagEnd", [io("flag", read("fresh"))]), end("FlagEnd", "To_FlagEnd"),
  ], [flow("To_Fork", "Start", "Fork"), flow("To_Lot", "Fork", "Lot"), flow("To_Flag", "Fork", "Flag"), ...lotFlows(true),
    flow("To_End", "Lot", "End"), flow("To_FlagEnd", "Flag", "FlagEnd")]);
  assert.deepEqual(afterStart(json, begin([["last", "none"], ["flag", "old"], ["fresh", "new"]])), [
    ["Check#1 position=0 seenPrior=old", "Check#2 position=1 seenPrior=old", "Check#3 position=2 seenPrior=old"], "c",
  ]);
});
