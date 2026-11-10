/**
 * PC-BASIC-03: renaming and permuting a model changes nothing the kernel observes beyond the renaming. Every
 * single-instance witness whose source the reader reads and the kernel admits runs twice: as retained, and as a variant
 * whose flow elements are renamed and reordered. The variant's result, with the new identifiers mapped back, must equal
 * the original's exactly.
 *
 * The variant renames the identifier of every flow node and Sequence Flow of a Process or Sub-Process, and every
 * reference to one, to a fresh name whose lexical order is the reverse of the original's, so a reading that depends on
 * identifier order is caught. It reverses the declaration order of the flow nodes in each container and reorders the
 * Sequence Flows by source, keeping only the declaration orders that choose among candidates: the flows leaving one
 * source, a gateway's or an Activity's candidate order (BPMN 2.0.2 §13.4.2: "the conditions are evaluated in order";
 * CIB-INT-0001 reads it as XML Sequence Flow declaration order); the Boundary Events of one host and the Event
 * Sub-Processes of one scope, among which a thrown Error, Escalation or Message picks its catcher in declaration order
 * where several match. Names, data items, Messages, Signals and Errors keep their identifiers: they are values a
 * schedule or expression names, not references the reader resolves. A called instance's identifier embeds its Call
 * Activity's (`calledInstanceId`), so it is renamed through that encoding.
 *
 * The check is generic over the cohort and grows by no per-model case; a witness it does not cover is one the reader
 * refuses, the kernel refuses to deploy, or a population schedule (several instances), each counted below.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { runScenario } from "@bpmn-lean/kernel";

import { differentialDiscoveryRoots } from "../../../scripts/pipeline-budget.ts";
import { readSourceFor } from "./scenario-discovery.ts";
import type { ScenarioDocument } from "./scenario-discovery.ts";
import { projectRoot } from "./pipeline-target-support.ts";

type Json = any;

const containers = new Set(["process", "subProcess", "transaction", "adHocSubProcess"]);
const flowNodes = new Set([
  "startEvent", "endEvent", "intermediateCatchEvent", "intermediateThrowEvent", "boundaryEvent", "task", "userTask",
  "serviceTask", "sendTask", "receiveTask", "scriptTask", "businessRuleTask", "manualTask", "callActivity",
  "subProcess", "transaction", "adHocSubProcess", "exclusiveGateway", "inclusiveGateway", "parallelGateway",
  "eventBasedGateway", "complexGateway",
]);
/** The attributes and element texts that refer to a flow node or Sequence Flow by identifier. */
const referenceAttributes = new Set(["id", "sourceRef", "targetRef", "default", "attachedToRef", "activityRef", "bpmnElement"]);
const referenceTexts = new Set(["incoming", "outgoing", "flowNodeRef"]);
/** The schedule fields that name an element; a process instance field may name a called instance. */
const elementFields = new Set(["elementId", "startEvent"]);
const instanceFields = new Set(["processInstanceId", "instanceId"]);

type XmlNode = { kind: "raw"; text: string } | { kind: "element"; local: string; open: string; children: XmlNode[]; close: string };

const tokenPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/[^>]+>|<[^\s/>!?](?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/gu;
const attributePattern = /(\s)([\w.:-]+)(\s*=\s*)(["'])(.*?)\4/gsu;

const localName = (qualified: string): string => qualified.slice(qualified.indexOf(":") + 1);

/** A well-formed document as a tree whose raw tokens serialize back byte for byte. */
function parse(xml: string): XmlNode[] {
  const root: XmlNode[] = [];
  const stack: Array<Extract<XmlNode, { kind: "element" }>> = [];
  const add = (node: XmlNode) => (stack.at(-1)?.children ?? root).push(node);
  for (const [token] of xml.matchAll(tokenPattern)) {
    if (token.startsWith("</")) {
      const element = stack.pop();
      assert.ok(element !== undefined, `unbalanced ${token}`);
      element.close = token;
    } else if (token.startsWith("<") && !/^<[!?]/u.test(token)) {
      const element: XmlNode = { kind: "element", local: localName(/^<([^\s/>]+)/u.exec(token)![1]!), open: token, children: [], close: "" };
      add(element);
      if (!token.endsWith("/>")) stack.push(element);
    } else {
      add({ kind: "raw", text: token });
    }
  }
  assert.equal(stack.length, 0, "unclosed element");
  return root;
}

const serialize = (nodes: readonly XmlNode[]): string =>
  nodes.map((node) => (node.kind === "raw" ? node.text : node.open + serialize(node.children) + node.close)).join("");

const attribute = (element: Extract<XmlNode, { kind: "element" }>, name: string): string | undefined =>
  [...element.open.matchAll(attributePattern)].find((match) => match[2] === name)?.[5];

function* elements(nodes: readonly XmlNode[], parent: string | null = null): Generator<[Extract<XmlNode, { kind: "element" }>, string | null]> {
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    yield [node, parent];
    yield* elements(node.children, node.local);
  }
}

/** Old identifier to new, reversing the lexical order of the renamed identifiers. */
function renaming(tree: readonly XmlNode[]): Map<string, string> {
  const ids = [...elements(tree)]
    .filter(([element, parent]) => parent !== null && containers.has(parent) && (flowNodes.has(element.local) || element.local === "sequenceFlow"))
    .map(([element]) => attribute(element, "id"))
    .filter((id): id is string => id !== undefined)
    .sort();
  const width = String(ids.length).length;
  return new Map(ids.map((id, index) => [id, `renamed_${String(ids.length - 1 - index).padStart(width, "0")}`]));
}

const renamedReference = (value: string, names: ReadonlyMap<string, string>): string => {
  const colon = value.indexOf(":");
  const local = value.slice(colon + 1);
  const renamed = names.get(local);
  return renamed === undefined ? value : value.slice(0, colon + 1) + renamed;
};

function rename(nodes: XmlNode[], names: ReadonlyMap<string, string>): void {
  for (const [element] of elements(nodes)) {
    element.open = element.open.replace(attributePattern, (whole, space, name, equals, quote, value) =>
      referenceAttributes.has(localName(name)) ? `${space}${name}${equals}${quote}${renamedReference(value, names)}${quote}` : whole);
    if (!referenceTexts.has(element.local)) continue;
    for (const child of element.children) {
      if (child.kind !== "raw") continue;
      const text = child.text.trim();
      if (text.length > 0) child.text = child.text.replace(text, renamedReference(text, names));
    }
  }
}

/** Fill the slots `select` picks among `children` with the picked nodes in `reorder`'s order. */
function permuteSlots(children: XmlNode[], select: (local: string) => boolean, reorder: (picked: XmlNode[]) => XmlNode[]): void {
  const slots = children.flatMap((node, index) => (node.kind === "element" && select(node.local) ? [index] : []));
  const reordered = reorder(slots.map((index) => children[index]!));
  slots.forEach((slot, position) => { children[slot] = reordered[position]!; });
}

/** The candidates among which declaration order is semantic share a group; any other node is its own. */
function candidateGroup(node: XmlNode): string | null {
  if (node.kind !== "element") return null;
  if (node.local === "boundaryEvent") return `boundary:${attribute(node, "attachedToRef") ?? ""}`;
  return node.local === "subProcess" && attribute(node, "triggeredByEvent") === "true" ? "eventSubProcess" : null;
}

/** `picked` reversed, except that the members of one candidate group keep their declared order among themselves. */
function reverseKeepingGroups(picked: XmlNode[]): XmlNode[] {
  const reversed = [...picked].reverse();
  const groups = new Map<string, XmlNode[]>();
  for (const node of picked) {
    const group = candidateGroup(node);
    if (group !== null) groups.set(group, [...(groups.get(group) ?? []), node]);
  }
  return reversed.map((node) => {
    const group = candidateGroup(node);
    return group === null ? node : groups.get(group)!.shift()!;
  });
}

function permute(nodes: readonly XmlNode[]): void {
  for (const [element] of elements(nodes)) {
    if (!containers.has(element.local)) continue;
    permuteSlots(element.children, (local) => flowNodes.has(local), reverseKeepingGroups);
    // Stable, so the flows leaving one source keep their declared order.
    const source = (node: XmlNode): string => (node.kind === "element" ? attribute(node, "sourceRef") ?? "" : "");
    permuteSlots(element.children, (local) => local === "sequenceFlow",
      (picked) => picked.sort((left, right) => (source(left) < source(right) ? 1 : source(left) > source(right) ? -1 : 0)));
  }
}

/** The variant source and the identifier map it applied. */
export function variant(xml: string): { xml: string; names: ReadonlyMap<string, string> } {
  const tree = parse(xml);
  assert.equal(serialize(tree), xml, "the tokenizer round-trips the source");
  const names = renaming(tree);
  rename(tree, names);
  permute(tree);
  return { xml: serialize(tree), names };
}

/** A called instance's identifier with its Call Activity renamed, nested callers included (`calledInstanceId`). */
function renamedInstance(id: string, names: ReadonlyMap<string, string>): string {
  const parsed = /^call:(\d+):/u.exec(id);
  if (parsed === null) return id;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(id);
  const callerStart = parsed[0].length;
  const callerEnd = callerStart + Number(parsed[1]);
  const decoder = new TextDecoder();
  const caller = decoder.decode(bytes.slice(callerStart, callerEnd));
  const rest = /^:(\d+):/u.exec(decoder.decode(bytes.slice(callerEnd)));
  if (rest === null) return id;
  const callStart = callerEnd + rest[0].length;
  const callEnd = callStart + Number(rest[1]);
  const call = decoder.decode(bytes.slice(callStart, callEnd));
  const activation = decoder.decode(bytes.slice(callEnd));
  const renamedCaller = renamedInstance(caller, names);
  const renamedCall = names.get(call) ?? call;
  return `call:${encoder.encode(renamedCaller).length}:${renamedCaller}:${encoder.encode(renamedCall).length}:${renamedCall}${activation}`;
}

/** `json` with every string at a field `selects` picks renamed through `names`, as an element or an instance. */
function mapStrings(json: Json, names: ReadonlyMap<string, string>, selects: (field: string) => boolean, field = ""): Json {
  if (typeof json === "string") {
    if (instanceFields.has(field)) return renamedInstance(json, names);
    return selects(field) ? names.get(json) ?? json : json;
  }
  if (Array.isArray(json)) return json.map((item) => mapStrings(item, names, selects, field));
  if (json !== null && typeof json === "object") {
    return Object.fromEntries(Object.entries(json).map(([key, value]) => [key, mapStrings(value, names, selects, key)]));
  }
  return json;
}

/**
 * `result` with each state's scopes in one order. The kernel publishes them sorted by public identifier (`publish.ts`
 * `scopes`), an order a renaming permutes and no semantic claim, like the open waits the comparator sorts.
 */
const scopesSorted = (result: Json): Json => ({
  ...result,
  trace: result.trace.map((entry: Json) => (Array.isArray(entry.scopes)
    ? { ...entry, scopes: [...entry.scopes].sort((left, right) => (JSON.stringify(left) < JSON.stringify(right) ? -1 : 1)) }
    : entry)),
});

async function scenarioFiles(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(projectRoot, directory), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return scenarioFiles(relativePath);
    return entry.name.endsWith("scenario.json") ? [relativePath] : [];
  }));
  return nested.flat();
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

test("renaming and permuting every admitted witness changes nothing the kernel observes beyond the renaming", async () => {
  const files = (await Promise.all(differentialDiscoveryRoots.map(scenarioFiles))).flat().sort();
  const counts = { covered: 0, readerRefused: 0, notDeployed: 0, population: 0 };
  const findings: string[] = [];
  for (const scenarioPath of files) {
    const document = JSON.parse(await readFile(path.join(projectRoot, scenarioPath), "utf8")) as ScenarioDocument | { kind: string };
    if (document.kind !== "scenario") {
      counts.population += 1;
      continue;
    }
    const scenario = document as ScenarioDocument;
    const original = await readSourceFor(scenarioPath, scenario.bpmn, scenario.profile);
    if (original.kind !== "read") {
      counts.readerRefused += 1;
      continue;
    }
    const expected = JSON.parse(JSON.stringify(runScenario(original.program, scenario)));
    if (expected.trace[0]?.kind === "deployment" && expected.trace[0].outcome !== "committed") {
      counts.notDeployed += 1;
      continue;
    }
    counts.covered += 1;
    const xml = await readFile(path.join(projectRoot, scenario.bpmn.relativePath), "utf8");
    const changed = variant(xml);
    const bytes = new TextEncoder().encode(changed.xml);
    const read = await readSourceFor(scenarioPath, { ...scenario.bpmn, sha256: sha256(bytes) }, scenario.profile, bytes);
    if (read.kind !== "read") {
      findings.push(`${scenarioPath}: the variant is refused (${JSON.stringify(read)})`);
      continue;
    }
    const back = new Map([...changed.names].map(([old, renamed]) => [renamed, old]));
    const schedule = mapStrings(scenario, changed.names, (field) => elementFields.has(field));
    const actual = mapStrings(JSON.parse(JSON.stringify(runScenario(read.program, schedule))), back, () => true);
    // Both results are the kernel's, so its codes and scopes count; open waits are compared in their canonical order.
    const comparison = compareTargetResults({ target: DifferentialTarget.KernelTs, result: scopesSorted(expected) },
      [{ target: DifferentialTarget.Kernel, result: scopesSorted(actual) }]);
    if (comparison.kind === ComparisonKind.Disagreement) findings.push(`${scenarioPath}: ${JSON.stringify(comparison.disagreement)}`);
  }
  assert.deepEqual(findings, [], JSON.stringify(counts));
  // The cohort is the retained witnesses; an empty or shrunken run would pass vacuously.
  assert.ok(counts.covered > counts.readerRefused + counts.notDeployed, JSON.stringify(counts));
});
