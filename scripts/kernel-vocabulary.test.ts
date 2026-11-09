/**
 * Locks the kernel vocabulary (`contracts/schemas/vocabulary.schema.json`) to its generator, the TypeScript kernel's
 * enumerations to the Lean constructors the vocabulary reads, and the scenario and canonical-result schemas' kinds to
 * the vocabulary, so a kernel constructor and the contract that names it cannot drift apart.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { loadTree, typeScriptEnums } from "./kernel-guard-scan.ts";
import { codecCodes } from "./kernel-guards-refusal.ts";
import { enumerations, renderVocabulary, vocabularyPath } from "./kernel-vocabulary.ts";

const tree = loadTree();
type Schema = Readonly<Record<string, unknown>>;
const schema = (name: string): Schema =>
  JSON.parse(readFileSync(path.join(tree.root, "contracts/schemas", name), "utf8")) as Schema;
const vocabulary = JSON.parse(renderVocabulary(tree)) as Readonly<{ $defs: Readonly<Record<string, Schema>> }>;
const values = (name: string): string[] => {
  const entry = vocabulary.$defs[name];
  assert.ok(entry !== undefined && Array.isArray(entry["enum"]), `vocabulary has no enumeration ${name}`);
  return entry["enum"] as string[];
};
const sorted = (items: Iterable<string>): string[] => [...items].sort();

/** Every `kind` constant of a `oneOf` of object schemas, following local `$ref`s. */
function kindsOf(document: Schema, alternatives: Schema): string[] {
  const resolve = (entry: Schema): Schema => {
    const reference = entry["$ref"];
    if (typeof reference !== "string") return entry;
    const name = reference.replace(/^#\/\$defs\//u, "");
    return (document["$defs"] as Record<string, Schema>)[name] ?? assert.fail(`unresolved ${reference}`);
  };
  return (alternatives["oneOf"] as Schema[]).map((entry) => {
    const kind = ((resolve(entry)["properties"] as Record<string, Schema>)["kind"] ?? {})["const"];
    assert.equal(typeof kind, "string");
    return kind as string;
  });
}

test("the committed vocabulary is the generator's output", () => {
  assert.equal(readFileSync(path.join(tree.root, vocabularyPath), "utf8"), renderVocabulary(tree),
    "run node scripts/kernel-vocabulary.ts --write");
});

test("each TypeScript transcription of a vocabulary enumeration has exactly the Lean constructors", () => {
  const enums = typeScriptEnums(tree.typeScript);
  const options = (vocabulary.$defs["profileOptions"]?.["properties"] ?? {}) as Record<string, Schema>;
  const leanOptionTypes = new Map(Object.keys(options).map((field) => [field, field[0]?.toUpperCase() + field.slice(1)]));
  const pairs: Array<readonly [string, string[]]> = [
    ...enumerations.map(([name, , inductive]) => [inductive, values(name)] as const),
    ...[...leanOptionTypes].map(([field, inductive]) => [inductive, options[field]?.["enum"] as string[]] as const),
  ];
  let compared = 0;
  for (const [inductive, constructors] of pairs) {
    const transcription = enums.get(`${inductive}Tag`) ?? enums.get(inductive);
    if (transcription === undefined) continue;
    compared += 1;
    assert.deepEqual(sorted(transcription.members.values()), sorted(constructors), `${transcription.name} transcribes ${inductive}`);
  }
  assert.ok(compared >= enumerations.length, "the scan found the TypeScript enumerations");
});

test("the scenario schema's stimulus kinds are the vocabulary's", () => {
  const scenario = schema("scenario.schema.json");
  const defs = scenario["$defs"] as Record<string, Schema>;
  assert.deepEqual(sorted(kindsOf(scenario, defs["stimulus"]!)), sorted(values("inputKind")));
  assert.deepEqual(sorted(kindsOf(scenario, defs["startTrigger"]!)), sorted(values("startTrigger")));
  assert.deepEqual(sorted(kindsOf(scenario, defs["commandAction"]!)), sorted(values("commandAction")));
  assert.deepEqual(sorted(kindsOf(scenario, defs["deliveryTrigger"]!)), sorted(values("deliveryTrigger")));
  assert.deepEqual(sorted(kindsOf(scenario, defs["effectOutcome"]!)), sorted(values("effectOutcome")));
  const target = (defs["correlationMatch"]?.["properties"] as Record<string, Schema>)["target"]!;
  assert.deepEqual(sorted(kindsOf(scenario, target)), sorted(values("criterionTarget")));
});

test("the canonical result's outcomes, statuses, open-wait kinds and scope roles are the vocabulary's", () => {
  const result = schema("canonical-result.schema.json");
  const defs = result["$defs"] as Record<string, Schema>;
  assert.deepEqual(sorted(defs["outcome"]?.["enum"] as string[]), sorted(values("outcome")));
  const state = defs["state"]?.["properties"] as Record<string, Schema>;
  assert.deepEqual(sorted(state["status"]?.["enum"] as string[]), sorted(values("instanceStatus")));
  const waits = (defs["openWait"]?.["oneOf"] as Schema[]).map((wait) => wait["properties"] as Record<string, Schema>);
  const detailKind = (wait: Record<string, Schema>): string => {
    const name = String(wait["detail"]?.["$ref"]).replace(/^#\/\$defs\//u, "");
    return String((defs[name]?.["properties"] as Record<string, Schema>)["kind"]?.["const"]);
  };
  assert.deepEqual(sorted(waits.map(detailKind)), sorted(values("waitKind")));
  const roles = (defs["variableScope"]?.["oneOf"] as Schema[]).flatMap((form) => {
    const role = (form["properties"] as Record<string, Schema>)["role"] ?? {};
    return role["const"] === undefined ? (role["enum"] as string[]) : [role["const"] as string];
  });
  assert.deepEqual(sorted(roles), sorted(values("scopeRole")));
  for (const wait of waits) {
    const input = wait["input"]?.["const"];
    assert.ok(input === null || values("inputKind").includes(String(input)), `open-wait input ${String(input)}`);
  }
});

test("the Lean and TypeScript codecs declare the same strict-decoding codes", () => {
  const codes = codecCodes(tree);
  const declared = (language: string): string[] =>
    sorted(new Set(codes.filter(({ source }) => source.file.endsWith(language)).map(({ code }) => code)));
  assert.ok(declared(".lean").length > 0, "the scan found the Lean codes");
  assert.deepEqual(declared(".ts"), declared(".lean"));
});
