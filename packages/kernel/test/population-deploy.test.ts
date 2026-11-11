/**
 * `Population.deploy` (population contract §2.3, PC-SCOPE-03): versions count registered deployments only, a copy of a
 * refused or later deployment's process is removed with its elements and flows, a copy of a registered one must match
 * that deployment's key, namespace and source (`population.callee.stamp`), and under Message name addressing a root
 * Message start name is unique across other keys' current deployments (`deployment.messageStartName`, CIB-LIM-0028).
 * The programs are hand-built stamped IL, as `bpmn-source`'s assembly will produce it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runPopulation } from "@bpmn-lean/kernel";

import { base, message, replace, start, text, wired, withOptions } from "./admission-refusal-support.ts";

type Json = Record<string, unknown>;

const fixture = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
const fixtureIdentity = fixture.identity as Json;
const rootKey = fixtureIdentity.processId as string;
const elementIds = (fixture.elements as Json[]).map((element) => (Object.values(element)[0] as { header: { id: string } }).header.id);
const flowIds = (fixture.flows as Json[]).map((flow) => flow.id as string);

/** `program` as the root of a document with `key` and source digest `sha256`. */
const rooted = (program: Json, key: string, sha256: string): Json =>
  ({ ...program, identity: { ...(program.identity as Json), processId: key, sourceSha256: sha256 } });

/** The fixture's elements and flows renamed under `prefix`, as a copy of another deployment's process. */
function copiedBody(prefix: string): { elements: Json[]; flows: Json[] } {
  let body = JSON.stringify({ elements: fixture.elements, flows: fixture.flows });
  for (const id of [...elementIds, ...flowIds]) body = body.replaceAll(`"${id}"`, `"${prefix}${id}"`);
  return JSON.parse(body) as { elements: Json[]; flows: Json[] };
}

/** The fixture as `Caller`, carrying one copy of `Callee` per stamp, each with the fixture's body renamed. */
function caller(stamps: readonly Json[]): Json {
  const copies = stamps.map((stamp, index) => ({ stamp, body: copiedBody(`copy${String(index)}_`) }));
  return {
    ...rooted(fixture, "Caller", "caller-sha"),
    elements: [...(fixture.elements as Json[]), ...copies.flatMap(({ body }) => body.elements)],
    flows: [...(fixture.flows as Json[]), ...copies.flatMap(({ body }) => body.flows)],
    processes: copies.map(({ stamp, body }) => ({
      definition: { key: "Callee", namespace: null, version: null, versionTag: null, deployment: null, tenant: null, sourceSha256: null, ...stamp },
      children: body.elements.map((element) => (Object.values(element)[0] as { header: { id: string } }).header.id),
      variables: [],
      executable: true,
    })),
  };
}

const callee = rooted(fixture, "Callee", "callee-sha");

const definition = (definitionRef: string, sha256: string): Json => ({
  definitionRef,
  bpmn: { id: definitionRef, relativePath: `scenarios/${definitionRef}.bpmn`, sha256, sourceOverlay: null },
});

/** Deploy `sources` in order, one definition each, and return the deployments. */
function deployments(sources: readonly Json[], profile = fixtureIdentity.profile): Json[] {
  const definitions = sources.map((source, index) =>
    definition(`d${String(index + 1)}`, "refused" in source ? `refused-sha-${String(index)}` : (source.identity as Json).sourceSha256 as string));
  const steps = definitions.map((entry) => ({ kind: "deploy", definitionRef: entry.definitionRef }));
  const scenario = { kind: "populationScenario", id: "population-deploy", profile, definitions, steps };
  return (runPopulation(sources, scenario, steps.map((_, index) => `digest-${String(index)}`)) as { deployments: Json[] }).deployments;
}

test("a refused deployment numbers no version, and the next deployment of its key takes the next registered one", () => {
  const result = deployments([callee, { refused: "reader.example" }, callee]);
  assert.deepEqual(result.map((entry) => [entry.deploymentId, entry.versions, entry.outcome]), [
    [1, [{ key: "Callee", version: 1 }], { kind: "deployed" }],
    [2, [], { kind: "deploymentRefused", code: "reader.example" }],
    [3, [{ key: "Callee", version: 2 }], { kind: "deployed" }],
  ]);
});

test("copies of a refused and of a later deployment are removed with their elements and flows", () => {
  const result = deployments([callee, { refused: "reader.example" }, caller([{ deployment: 2 }, { deployment: 4 }]), callee]);
  assert.deepEqual(result[2], { deploymentId: 3, definitionRef: "d3", versions: [{ key: "Caller", version: 1 }], outcome: { kind: "deployed" } });
});

test("a copy whose stamp names no registered deployment, another namespace or another source is refused", () => {
  const refusedAs = (stamp: Json) => deployments([callee, caller([stamp])])[1]?.outcome;
  const stampRefusal = { kind: "deploymentRefused", code: "population.callee.stamp" };
  assert.deepEqual(refusedAs({ deployment: 0 }), stampRefusal);
  assert.deepEqual(refusedAs({ deployment: 1, namespace: "urn:other" }), stampRefusal);
  assert.deepEqual(refusedAs({ deployment: 1, sourceSha256: "other-sha" }), stampRefusal);
  assert.deepEqual(refusedAs({ deployment: 1, key: "Missing" }), stampRefusal);
  assert.notDeepEqual(refusedAs({ deployment: 1, sourceSha256: "callee-sha" }), stampRefusal);
});

/** A program of `key` whose root start is a Message start named `name`, under Message name addressing. */
const messageStarting = (key: string, name: string): Json => rooted(wired(withOptions(
  replace(base(), "S", start("S", message({ messageRef: `M_${name}`, name: text(name) }))),
  { messageNames: "addresses", evaluator: "juel" })), key, `${key}-sha`);

test("a root Message start name another key's current deployment subscribes is refused; the same key may redeploy it", () => {
  const result = deployments([messageStarting("A", "Order"), messageStarting("B", "Order"), messageStarting("A", "Order")]);
  assert.deepEqual(result.map((entry) => entry.outcome), [
    { kind: "deployed" }, { kind: "deploymentRefused", code: "deployment.messageStartName" }, { kind: "deployed" },
  ]);
});
