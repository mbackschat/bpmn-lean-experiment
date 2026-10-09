import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyStimulusWithTrace, initialState, StimulusKind, CommandOutcome } from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";
import { parallelCommandInputs } from "../../bpmn-source/test/parallel-scope-command-fixture.ts";
import { compareCommandState, stateProjection, parallelDataCommandWitnesses } from "./parallel-scope-command-parity.ts";

const { program, start } = (await parallelCommandInputs()).find(input => input.count === 2)!;
const opened = applyStimulusWithTrace(program, initialState, start);
assert.equal(opened.result.outcome, CommandOutcome.Committed);
const review = opened.result.state.userTaskWaits[0]!;
const pending = applyStimulusWithTrace(program, opened.result.state, { kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "review", taskId: review.id, submittedValues: [] });
assert.equal(pending.result.outcome, CommandOutcome.Committed);
const state = pending.result.state;
const expected = stateProjection(initialState, state);

test("parallel command data witnesses retain ordered writes, cancellation and rollback discriminators", async () => {
  const witnesses = await parallelDataCommandWitnesses();
  assert.equal(witnesses.length, 4, "two write orders and two condition timings");
  for (const witness of witnesses) {
    const result = witness.result();
    assert.equal(result.finalState.status, "completed");
    assert.equal(result.publicShapeAdmitted, false);
    assert.ok(witness.stimuli.some(stimulus => stimulus.commandId === "protected-items"));
    assert.ok(witness.stimuli.some(stimulus => stimulus.commandId === "effect-type"));
    assert.ok(witness.stimuli.some(stimulus => stimulus.commandId === "effect-error"));
  }
});

const mutations: readonly (readonly [string, readonly (string | number)[], unknown])[] = [
  ["control instance", ["control", "instanceId"], "other"],
  ["initiation", ["initiationPending"], true],
  ["logical time", ["logicalTimeMs"], 1],
  ["controller total", ["parallelScopeControllers", 0, "total"], 3],
  ["controller completed", ["parallelScopeControllers", 0, "completed"], 1],
  ["controller identity", ["parallelScopeControllers", 0, "id", "activation"], 2],
  ["activity identity", ["activityOccurrences", 0, "id", "activation"], 2],
  ["activity owner", ["activityOccurrences", 0, "owner", "activation"], 2],
  ["activity operation", ["activityOccurrences", 0, "operationId"], "other"],
  ["body item", ["activityOccurrences", 0, "body", "iterations", 0, "item"], "other"],
  ["body index", ["activityOccurrences", 0, "body", "iterations", 0, "loopCounter"], 1],
  ["body scope", ["activityOccurrences", 0, "body", "iterations", 0, "scope", "activation"], 2],
  ["attached handler", ["activityOccurrences", 0, "attachedHandlers"], [{ kind: "timer", occurrence: review.id }]],
  ["human identity", ["userTaskWaits", 0, "id", "processInstanceId"], "other"],
  ["human name", ["userTaskWaits", 0, "name"], "other"],
  ["human metadata", ["userTaskWaits", 0, "metadata"], { assignment: { candidates: [] } }],
  ["effect identity", ["effectWaits", 0, "id", "processInstanceId"], "other"],
  ["effect descriptor", ["effectWaits", 0, "descriptor", "operation"], "other"],
  ["effect mappings", ["effectWaits", 0, "outputMappings"], []],
  ["effect error route", ["effectWaits", 0, "bpmnErrorRoute"], {}],
  ["effect retry", ["effectWaits", 0, "incidentAlreadyRetried"], true],
  ["non-effect frame", ["variables", "activities", 0, "owner", "kind"], "activityOccurrence"],
  ["Process interface", ["variables", "processInterfaces"], [{ owner: review.owner, inputs: [], outputs: [] }]],
  ...["scopeActivations", "activityActivations", "messageActivations", "timerActivations", "eventRaceActivations", "callActivations"].map(
    name => [name, [name], [{ elementId: "unexpected", count: 1 }]] as const),
  ...["messageWaits", "eventSubProcessMessageSubscriptions", "timerWaits", "effectIncidents", "selectedBranchSets", "eventRaces",
    "calledProcessOccurrences", "sequentialScopeControllers", "sequentialMultiInstanceControllers", "parallelMultiInstanceControllers",
    "compensationActivityRetentions", "compensationParentContextRetentions", "compensationTriggers", "compensationHandlerEffectWaits"].map(
    name => [name, [name], [{}]] as const),
];

for (const [label, keys, replacement] of mutations) test(`complete command comparison detects ${label}`, () => {
  const altered: RuntimeState = JSON.parse(JSON.stringify(state));
  let cursor = altered as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  cursor[keys.at(-1)!] = replacement;
  assert.notDeepEqual(altered, state, `${label}: mutation must change the state`);
  assert.throws(() => compareCommandState(stateProjection(initialState, altered), expected, label));
});

test("complete command comparison retains order and multiplicity", () => {
  for (const altered of [{ ...state, scopeOccurrences: [...state.scopeOccurrences].reverse() },
    { ...state, userTaskWaits: [...state.userTaskWaits, ...state.userTaskWaits] }]) {
    assert.throws(() => compareCommandState(stateProjection(initialState, altered), expected, "order or multiplicity"));
  }
  compareCommandState(expected, structuredClone(expected), "unchanged");
});

test("private command projection accounts for every Lean RuntimeState and scoped-data field", async () => {
  const fields = (source: string, name: string): string[] => source.split(`structure ${name} where`)[1]!.split("deriving")[0]!
    .split("\n").flatMap(line => /^  (\w+) :/u.exec(line)?.[1] ?? []);
  const lean = await readFile(new URL("../../../BpmnSemantics/SemanticProcess/RuntimeState.lean", import.meta.url), "utf8");
  const names: Record<string, string> = { tokens: "controlTokens", waits: "userTaskWaits", activations: "taskActivations" };
  const full = (expected as unknown as { fullState: Record<string, unknown> }).fullState;
  assert.ok(full, "command projection must carry the complete state");
  assert.deepEqual(fields(lean, "RuntimeState").map(name => names[name] ?? name).sort(), Object.keys(full).sort());
  const data = await readFile(new URL("../../../BpmnSemantics/SemanticProcess/Data.lean", import.meta.url), "utf8");
  assert.deepEqual(fields(data, "ScopedVariables").sort(), Object.keys(full.variables as object).sort());
});
