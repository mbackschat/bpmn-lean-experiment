/**
 * The population runner's contract: deployments in deploy order, each taking the next deployment source, with versions
 * per process key; a program admission refuses or a source the reader refused as a `deploymentRefused` deployment; an
 * instance input addressing nothing deployed as `definition-not-deployed`; each command at its given or inherited logical
 * time; and the three harness refusals of a malformed scenario.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runPopulation } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const program = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
const identity = program.identity as Json;
/** The same source under an option admission refuses. */
const refused: Json = { ...program, options: { ...(program.options as Json), messageCorrelation: "apiCriteria" } };

const definition = (definitionRef: string): Json => ({
  definitionRef,
  bpmn: { id: definitionRef, relativePath: `scenarios/${definitionRef}.bpmn`, sha256: identity.sourceSha256, sourceOverlay: null },
});

const start = (instanceId: string, extra: Json = {}): Json =>
  ({ kind: "start", commandId: `start-${instanceId}`, instanceId, variables: [], ...extra });
const instance = (definitionRef: string, instanceId: string, extra: Json = {}, stimulus: Json = {}): Json =>
  ({ kind: "instance", definitionRef, instanceId, stimulus: start(instanceId, stimulus), ...extra });
const channel = { kind: "directMessage", messageId: "M" };
const criterion = { target: { kind: "processVariable", name: "k" }, expected: { kind: "string", value: "v" } };
const publish = (commandId: string, extra: Json = {}): Json => ({
  kind: "publish", commandId, address: { definition: { deploymentId: 1 }, channel }, criteria: [criterion], variables: [],
  mode: "executionsOnly", ...extra,
});

function run(programs: readonly Json[], refs: readonly string[], steps: readonly Json[]): Json {
  const scenario = { kind: "populationScenario", id: "population-contract", profile: identity.profile, definitions: refs.map(definition), steps };
  return runPopulation(programs, scenario, steps.map((_, index) => `digest-${index}`)) as Json;
}

test("deploys undeployed definitions at 0 in list order and numbers each key's versions in deploy order", () => {
  const result = run([program, program], ["a", "b"], [{ kind: "deploy", definitionRef: "a", at: 7 }]);
  const key = identity.processId;
  assert.deepEqual(result.deployments, [
    { deploymentId: 1, definitionRef: "b", versions: [{ key, version: 1 }], outcome: { kind: "deployed" } },
    { deploymentId: 2, definitionRef: "a", versions: [{ key, version: 2 }], outcome: { kind: "deployed" } },
  ]);
});

test("a program admission refuses is a refused deployment, and an instance of it is not deployed", () => {
  const result = run([refused], ["a"], [instance("a", "I")]);
  assert.deepEqual(result.deployments, [{
    deploymentId: 1, definitionRef: "a", versions: [], outcome: { kind: "deploymentRefused", code: "profile.messageCorrelation.apiCriteria" },
  }]);
  assert.deepEqual(result.inputFailures, [{ commandId: "start-I", outcome: "rejected", code: "definition-not-deployed" }]);
  assert.deepEqual(result.processStates, []);
});

test("each deployment takes the next source in deploy order, and a source the reader refused deploys refused", () => {
  const result = run([program, { refused: "reader.factNotCarried" }, program], ["a", "b"], [
    { kind: "deploy", definitionRef: "a" }, { kind: "deploy", definitionRef: "b" }, { kind: "deploy", definitionRef: "a" }, instance("b", "I"),
  ]);
  const key = identity.processId;
  assert.deepEqual(result.deployments, [
    { deploymentId: 1, definitionRef: "a", versions: [{ key, version: 1 }], outcome: { kind: "deployed" } },
    { deploymentId: 2, definitionRef: "b", versions: [], outcome: { kind: "deploymentRefused", code: "reader.factNotCarried" } },
    { deploymentId: 3, definitionRef: "a", versions: [{ key, version: 2 }], outcome: { kind: "deployed" } },
  ]);
  assert.deepEqual(result.inputFailures, [{ commandId: "start-I", outcome: "rejected", code: "definition-not-deployed" }]);
});

test("the sources match the deployments one to one, and a refused source names only its code", () => {
  assert.throws(() => run([program], ["a", "b"], []), /no source for a deployment of b/u);
  assert.throws(() => run([program, program], ["a"], []), /2 deployment sources, 1 deployments/u);
  assert.throws(() => run([{ refused: "x", extra: true }], ["a"], []), /names only its code/u);
});

test("an instance step before its definition's deploy step is not deployed", () => {
  const result = run([program], ["a"], [instance("a", "I"), { kind: "deploy", definitionRef: "a" }, instance("a", "J")]);
  assert.deepEqual(result.inputFailures, [{ commandId: "start-I", outcome: "rejected", code: "definition-not-deployed" }]);
  assert.deepEqual((result.processStates as Json[]).map((state) => state.instanceId), ["J"]);
});

test("answers each command at its given or inherited time", () => {
  const result = run([program], ["a"], [
    { kind: "broadcast", commandId: "broadcast", address: { name: "S" }, variables: [], at: 9 },
    { kind: "broadcast", commandId: "again", address: { name: "S" }, variables: [] },
  ]);
  const unreceived = { kind: "fanOut", entries: [] };
  assert.deepEqual(result.steps, [
    { commandId: "broadcast", ordinal: 1, at: 9, resolution: unreceived },
    { commandId: "again", ordinal: 2, at: 9, resolution: unreceived },
  ]);
});

test("a publication to a deployment that does not exist is rejected, and one without candidates matches nothing", () => {
  const result = run([program], ["a"], [publish("missing", { address: { definition: { deploymentId: 2 }, channel } }), publish("none")]);
  assert.deepEqual((result.steps as Json[]).map((step) => step.resolution), [
    { kind: "rejected", code: "definition-not-deployed" }, { kind: "noMatch" },
  ]);
});

test("a step time the stimulus also gives must agree, and a step time it lacks becomes its time", () => {
  const timed = run([program], ["a"], [instance("a", "I", { at: 40 })]);
  assert.equal(((timed.processStates as Json[])[0] as Json).logicalTimeMs, 40);
  const agreeing = run([program], ["a"], [instance("a", "I", { at: 40 }, { at: 40 })]);
  assert.equal(((agreeing.processStates as Json[])[0] as Json).logicalTimeMs, 40);
});

test("a malformed population scenario is a harness refusal with its stable code", () => {
  const refusals: ReadonlyArray<readonly [string, readonly Json[]]> = [
    ["population-time-backward", [{ kind: "deploy", definitionRef: "a", at: 10 }, publish("early", { at: 9 })]],
    ["population-time-mismatch", [instance("a", "I", { at: 40 }, { at: 41 })]],
    ["population-unknown-definition", [instance("undeclared", "I")]],
    ["population-unknown-definition", [{ kind: "deploy", definitionRef: "undeclared" }]],
  ];
  for (const [code, steps] of refusals) {
    assert.throws(() => run([program], ["a"], steps), new RegExp(code, "u"), code);
  }
});
