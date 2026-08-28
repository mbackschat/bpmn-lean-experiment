import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const proposalOwner = "docs/INTERNAL-COMMUTATION-PROPOSAL.md";
const typescriptOperationOwner = "packages/semantic-core/src/semantic-process-contract.ts";
const typescriptStateOwner = "packages/semantic-core/src/semantic-process-state.ts";
const typescriptCensusOwner = "packages/semantic-core/src/internal-commutation-census.ts";
const leanOperationOwner = "BpmnSemantics/SemanticProcessContract.lean";
const leanStateOwner = "BpmnSemantics/SemanticProcess/RuntimeState.lean";
const leanCensusOwner = "BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean";

type CensusSources = Readonly<{
  proposal: string;
  typescriptOperations: string;
  typescriptState: string;
  typescriptCensus: string;
  leanOperations: string;
  leanState: string;
  leanCensus: string;
}>;

function read(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function liveSources(): CensusSources {
  return {
    proposal: read(proposalOwner),
    typescriptOperations: read(typescriptOperationOwner),
    typescriptState: read(typescriptStateOwner),
    typescriptCensus: read(typescriptCensusOwner),
    leanOperations: read(leanOperationOwner),
    leanState: read(leanStateOwner),
    leanCensus: read(leanCensusOwner),
  };
}

function braceSpan(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `absent: ${marker}`);
  const markerOpenOffset = marker.lastIndexOf("{");
  const openIndex = markerOpenOffset === -1
    ? source.indexOf("{", markerIndex + marker.length)
    : markerIndex + markerOpenOffset;
  assert.notEqual(openIndex, -1, `no opening brace after: ${marker}`);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return assert.fail(`unbalanced: ${marker}`);
}

function headingSection(source: string, heading: string): string {
  const marker = `### ${heading}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `absent heading: ${heading}`);
  const bodyStart = start + marker.length;
  const next = source.indexOf("\n### ", bodyStart);
  return source.slice(bodyStart, next === -1 ? source.length : next);
}

function tableCells(line: string): ReadonlyArray<string> {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function addUnique(map: Map<string, string>, key: string, value: string, owner: string): void {
  assert.equal(map.has(key), false, `${owner} duplicates ${key}`);
  map.set(key, value);
}

function proposalOperationFamilies(source: string): Map<string, string> {
  const families = new Map<string, string>();
  for (const line of headingSection(source, "Complete operation-family census").split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const [family, variants] = tableCells(line);
    if (family === "Operation family" || variants === undefined) continue;
    for (const match of variants.matchAll(/`([a-z][A-Za-z0-9]+)`/gu)) {
      assert.ok(match[1] !== undefined);
      addUnique(families, match[1], familyIdentifier(family ?? ""), "operation census");
    }
  }
  assert.ok(families.size > 0, "operation census is empty");
  return families;
}

function familyIdentifier(label: string): string {
  const words = label.match(/[A-Za-z]+/gu) ?? [];
  assert.ok(words.length > 0, `operation family has no words: ${label}`);
  return words.map((word, index) =>
    index === 0
      ? word[0]?.toLowerCase() + word.slice(1)
      : word[0]?.toUpperCase() + word.slice(1)
  ).join("");
}

function proposalStateFields(source: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of headingSection(source, "Prepared transition and region footprints").split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const [typescriptCell, leanCell] = tableCells(line);
    const typescript = /^`([A-Za-z][A-Za-z0-9]+)\??`$/u.exec(typescriptCell ?? "")?.[1];
    const lean = /^`([A-Za-z][A-Za-z0-9]+)`$/u.exec(leanCell ?? "")?.[1];
    if (typescript === undefined || lean === undefined) continue;
    addUnique(fields, typescript, lean, "RuntimeState census");
  }
  assert.ok(fields.size > 0, "RuntimeState census is empty");
  return fields;
}

function typescriptEnum(source: string, marker: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of braceSpan(source, marker).matchAll(/^\s*([A-Z][A-Za-z0-9]+)\s*=\s*"([A-Za-z][A-Za-z0-9]+)",?$/gmu)) {
    assert.ok(match[1] !== undefined && match[2] !== undefined);
    addUnique(values, match[1], match[2], marker);
  }
  assert.ok(values.size > 0, `${marker} is empty`);
  return values;
}

function leanInductive(source: string, name: string): ReadonlySet<string> {
  const marker = `inductive ${name} where`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `absent: ${marker}`);
  const end = source.indexOf("\n  deriving", start + marker.length);
  assert.notEqual(end, -1, `absent deriving clause for: ${marker}`);
  const constructors = new Set<string>();
  for (const match of source.slice(start + marker.length, end).matchAll(/^\s*\|\s+([a-z][A-Za-z0-9]+)/gmu)) {
    assert.ok(match[1] !== undefined);
    constructors.add(match[1]);
  }
  assert.ok(constructors.size > 0, `${marker} is empty`);
  return constructors;
}

function topLevelTypeFields(source: string, marker: string): ReadonlySet<string> {
  const fields = new Set<string>();
  let depth = 0;
  for (const line of braceSpan(source, marker).split("\n")) {
    if (depth === 0) {
      const field = /^\s*([a-z][A-Za-z0-9]+)\??:/.exec(line)?.[1];
      if (field !== undefined) fields.add(field);
    }
    for (const character of line) {
      if (character === "{" || character === "(" || character === "[") depth += 1;
      if (character === "}" || character === ")" || character === "]") depth -= 1;
    }
  }
  assert.ok(fields.size > 0, `${marker} is empty`);
  return fields;
}

function leanStructureFields(source: string, name: string): ReadonlySet<string> {
  const marker = `structure ${name} where`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `absent: ${marker}`);
  const end = source.indexOf("\n  deriving", start + marker.length);
  assert.notEqual(end, -1, `absent deriving clause for: ${marker}`);
  const fields = new Set<string>();
  for (const match of source.slice(start + marker.length, end).matchAll(/^\s{2}([a-z][A-Za-z0-9]+)\s*:/gmu)) {
    assert.ok(match[1] !== undefined);
    fields.add(match[1]);
  }
  assert.ok(fields.size > 0, `${marker} is empty`);
  return fields;
}

function typescriptOperationClassifications(source: string): Map<string, string> {
  const kindValues = typescriptEnum(source, "export enum InternalOperationFamily");
  const classifications = new Map<string, string>();
  const pending: string[] = [];
  for (const line of braceSpan(source, "switch (operation.kind)").split("\n")) {
    const operation = /^\s*case SemanticOperationKind\.([A-Z][A-Za-z0-9]+):/u.exec(line)?.[1];
    if (operation !== undefined) pending.push(operation);
    const familyMember = /^\s*return InternalOperationFamily\.([A-Z][A-Za-z0-9]+);/u.exec(line)?.[1];
    if (familyMember === undefined) continue;
    const family = kindValues.get(familyMember);
    assert.ok(family !== undefined, `unknown TypeScript operation family: ${familyMember}`);
    for (const member of pending.splice(0)) addUnique(classifications, member, family, "TypeScript operation classifier");
  }
  assert.deepEqual(pending, [], "TypeScript operation cases have no classification");
  return classifications;
}

function leanOperationClassifications(source: string): Map<string, string> {
  const marker = "def semanticOperationInternalFamily";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `absent: ${marker}`);
  const end = source.indexOf("\n\n", start);
  const classifications = new Map<string, string>();
  const pending: string[] = [];
  for (const line of source.slice(start, end === -1 ? source.length : end).split("\n")) {
    const operation = /^\s*\| \.([a-z][A-Za-z0-9]+)/u.exec(line)?.[1];
    if (operation !== undefined) pending.push(operation);
    const family = /=> \.([a-z][A-Za-z0-9]+)$/u.exec(line)?.[1];
    if (family === undefined) continue;
    for (const member of pending.splice(0)) addUnique(classifications, member, family, "Lean operation classifier");
  }
  assert.deepEqual(pending, [], "Lean operation cases have no classification");
  return classifications;
}

type StateMapping = Readonly<{ leanField: string; atomDomain: string }>;

function typescriptStateMappings(source: string): Map<string, StateMapping> {
  const domainValues = typescriptEnum(source, "export enum InternalRuntimeStateAtomDomain");
  const mappings = new Map<string, StateMapping>();
  for (const match of braceSpan(source, "export const internalRuntimeStateFieldCensus").matchAll(/^\s{2}([a-z][A-Za-z0-9]+): \{ leanField: "([a-z][A-Za-z0-9]+)", atomDomain: InternalRuntimeStateAtomDomain\.([A-Z][A-Za-z0-9]+) \},$/gmu)) {
    assert.ok(match[1] !== undefined && match[2] !== undefined && match[3] !== undefined);
    assert.equal(mappings.has(match[1]), false, `TypeScript RuntimeState census duplicates ${match[1]}`);
    const atomDomain = domainValues.get(match[3]);
    assert.ok(atomDomain !== undefined, `unknown TypeScript atom domain: ${match[3]}`);
    mappings.set(match[1], { leanField: match[2], atomDomain });
  }
  return mappings;
}

function leanStateClassifications(source: string): Map<string, string> {
  const marker = "def internalRuntimeStateFieldAtomDomain";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `absent: ${marker}`);
  const classifications = new Map<string, string>();
  for (const line of source.slice(start).split("\n")) {
    const match = /^\s*\| \.([a-z][A-Za-z0-9]+) => \.([a-z][A-Za-z0-9]+)$/u.exec(line);
    if (match === null) {
      if (classifications.size > 0 && line.trim() === "") break;
      continue;
    }
    assert.ok(match[1] !== undefined && match[2] !== undefined);
    addUnique(classifications, match[1], match[2], "Lean RuntimeState census");
  }
  return classifications;
}

function setDifference(left: Iterable<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function censusFindings(sources: CensusSources): string[] {
  const findings: string[] = [];
  const proposalOperations = proposalOperationFamilies(sources.proposal);
  const proposalOperationSet = new Set(proposalOperations.keys());
  const typescriptKinds = typescriptEnum(sources.typescriptOperations, "export enum SemanticOperationKind");
  const typescriptKindSet = new Set(typescriptKinds.values());
  const leanOperations = leanInductive(sources.leanOperations, "SemanticOperation");
  const typescriptClassifications = typescriptOperationClassifications(sources.typescriptCensus);
  const classifiedTypescriptKinds = new Set([...typescriptClassifications.keys()].map((member) => typescriptKinds.get(member)).filter((value): value is string => value !== undefined));
  const leanClassifications = leanOperationClassifications(sources.leanCensus);

  for (const value of setDifference(typescriptKindSet, proposalOperationSet)) findings.push(`TypeScript operation absent from proposal census: ${value}`);
  for (const value of setDifference(proposalOperationSet, typescriptKindSet)) findings.push(`proposal operation absent from TypeScript: ${value}`);
  for (const value of setDifference(leanOperations, proposalOperationSet)) findings.push(`Lean operation absent from proposal census: ${value}`);
  for (const value of setDifference(proposalOperationSet, leanOperations)) findings.push(`proposal operation absent from Lean: ${value}`);
  for (const value of setDifference(typescriptKindSet, classifiedTypescriptKinds)) findings.push(`TypeScript operation is unclassified: ${value}`);
  for (const value of setDifference(leanOperations, new Set(leanClassifications.keys()))) findings.push(`Lean operation is unclassified: ${value}`);
  for (const [member, value] of typescriptKinds) {
    const expected = proposalOperations.get(value);
    const actual = typescriptClassifications.get(member);
    if (expected !== undefined && actual !== expected) findings.push(`TypeScript operation family drift: ${value} -> ${expected}`);
  }
  for (const [value, expected] of proposalOperations) {
    const actual = leanClassifications.get(value);
    if (leanOperations.has(value) && actual !== expected) findings.push(`Lean operation family drift: ${value} -> ${expected}`);
  }

  const proposalStates = proposalStateFields(sources.proposal);
  const typescriptStates = topLevelTypeFields(sources.typescriptState, "export type RuntimeState = DeepReadonly<{");
  const leanStates = leanStructureFields(sources.leanState, "RuntimeState");
  const typescriptMappings = typescriptStateMappings(sources.typescriptCensus);
  const leanCensusFields = leanInductive(sources.leanCensus, "InternalRuntimeStateField");
  const leanStateDomains = leanStateClassifications(sources.leanCensus);
  for (const value of setDifference(typescriptStates, new Set(proposalStates.keys()))) findings.push(`TypeScript RuntimeState field absent from proposal census: ${value}`);
  for (const value of setDifference(proposalStates.keys(), typescriptStates)) findings.push(`proposal field absent from TypeScript RuntimeState: ${value}`);
  for (const value of setDifference(leanStates, new Set(proposalStates.values()))) findings.push(`Lean RuntimeState field absent from proposal census: ${value}`);
  for (const value of setDifference(proposalStates.values(), leanStates)) findings.push(`proposal field absent from Lean RuntimeState: ${value}`);
  for (const value of setDifference(typescriptStates, new Set(typescriptMappings.keys()))) findings.push(`TypeScript RuntimeState field is unclassified: ${value}`);
  for (const value of setDifference(leanStates, leanCensusFields)) findings.push(`Lean RuntimeState field is unclassified: ${value}`);
  for (const [typescriptField, leanField] of proposalStates) {
    const mapping = typescriptMappings.get(typescriptField);
    if (mapping?.leanField !== leanField) findings.push(`cross-language RuntimeState mapping drift: ${typescriptField} -> ${leanField}`);
    if (mapping !== undefined && leanStateDomains.get(leanField) !== mapping.atomDomain) findings.push(`cross-language RuntimeState atom-domain drift: ${typescriptField} -> ${leanField}`);
  }
  return findings.sort();
}

test("classifies every operation and RuntimeState field across both semantic accounts", () => {
  assert.deepEqual(censusFindings(liveSources()), []);
});

test("rejects an operation variant added independently to either language", () => {
  const sources = liveSources();
  const typescriptMutation = sources.typescriptOperations.replace(
    "export enum SemanticOperationKind {",
    'export enum SemanticOperationKind {\n  SyntheticOperation = "syntheticOperation",',
  );
  assert.ok(censusFindings({ ...sources, typescriptOperations: typescriptMutation }).includes("TypeScript operation absent from proposal census: syntheticOperation"));
  const leanMutation = sources.leanOperations.replace(
    "inductive SemanticOperation where",
    "inductive SemanticOperation where\n  | syntheticOperation",
  );
  assert.ok(censusFindings({ ...sources, leanOperations: leanMutation }).includes("Lean operation absent from proposal census: syntheticOperation"));
});

test("rejects a RuntimeState field added independently to either language", () => {
  const sources = liveSources();
  const typescriptMutation = sources.typescriptState.replace(
    "export type RuntimeState = DeepReadonly<{",
    "export type RuntimeState = DeepReadonly<{\n  syntheticState: boolean;",
  );
  assert.ok(censusFindings({ ...sources, typescriptState: typescriptMutation }).includes("TypeScript RuntimeState field absent from proposal census: syntheticState"));
  const leanMutation = sources.leanState.replace(
    "structure RuntimeState where",
    "structure RuntimeState where\n  syntheticState : Bool",
  );
  assert.ok(censusFindings({ ...sources, leanState: leanMutation }).includes("Lean RuntimeState field absent from proposal census: syntheticState"));
});

test("rejects a cross-language operation or state mapping mismatch", () => {
  const sources = liveSources();
  const operationMutation = sources.leanOperations.replace("| awaitTimer", "| awaitTimerRenamed");
  const operationFindings = censusFindings({ ...sources, leanOperations: operationMutation });
  assert.ok(operationFindings.includes("Lean operation absent from proposal census: awaitTimerRenamed"));
  assert.ok(operationFindings.includes("proposal operation absent from Lean: awaitTimer"));
  const stateMutation = sources.typescriptCensus.replace('timerWaits: { leanField: "timerWaits",', 'timerWaits: { leanField: "messageWaits",');
  assert.ok(censusFindings({ ...sources, typescriptCensus: stateMutation }).includes("cross-language RuntimeState mapping drift: timerWaits -> timerWaits"));
});
