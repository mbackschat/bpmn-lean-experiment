/**
 * PC-BASIC-03: renaming and permuting a model changes nothing the kernel observes beyond the renaming. Every
 * single-instance witness whose source the reader reads and the kernel admits runs twice: as retained, and as a variant
 * whose flow elements are renamed and reordered. The variant's result, with the new identifiers mapped back, must equal
 * the original's exactly.
 *
 * The variant renames the identifier of every flow node and Sequence Flow of a Process or Sub-Process and of every
 * Message, Signal, Error and Escalation, and every reference to one, to a fresh name whose lexical order is the reverse
 * of the original's, so a reading that depends on identifier order is caught. It reverses the declaration order of the flow nodes in each container and reorders the
 * Sequence Flows by source, keeping only the declaration orders that choose among candidates: the flows leaving one
 * source, a gateway's or an Activity's candidate order (BPMN 2.0.2 §13.4.2: "the conditions are evaluated in order";
 * CIB-INT-0001 reads it as XML Sequence Flow declaration order); the Boundary Events of one host and the Event
 * Sub-Processes of one scope, among which a thrown Error, Escalation or Message picks its catcher in declaration order
 * where several match; and the root start Events of one Process, which a population reaches in document order when
 * one command fires several of them. Names, Error and Escalation codes, Process identifiers and data items keep their
 * identifiers: a name or a code is a value a schedule, a catch or an expression matches, a Process identifier is the
 * definition key a deployment registers and a Call Activity's `calledElement` names, and a data item is named by
 * expressions the reader does not resolve. A schedule that addresses a Message by identifier (`messageId`) or a Signal by reference
 * (`signalRef.id`) is renamed with the model. A derived instance identifier embeds
 * element identifiers (a called instance's its Call Activity's, a started one's its start Event's, a cascade-started
 * one's its emitter's), so it is renamed through its encoding.
 *
 * Keeping those declaration orders hides an identifier dependence inside them, so the check runs twice per witness: on
 * the retained source and on its declaration-reversed twin, whose flow nodes and Sequence Flows are all reversed. The
 * twin may legitimately end differently from the retained source, since declaration order decides a split's branch order
 * and a catcher tie (PC-BASIC-03); it is compared only with its own renamed variant, so a difference there is one that
 * identifiers, not document order, decide.
 *
 * The check is generic over the cohort and grows by no per-model case; a witness it does not cover is one the reader
 * refuses, the kernel refuses to deploy, or a population schedule (several instances), each counted below.
 *
 * A population schedule runs the same check over all its documents at once (R-CALL-1): one renaming spans every
 * document, so a deployment's program assembles renamed copies of the other deployments' processes, and the result must
 * still show only the identifiers the documents' authors wrote, called instances' included.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { runPopulation, runScenario } from "@bpmn-lean/kernel";

import { differentialDiscoveryRoots } from "../../../scripts/pipeline-budget.ts";
import { populationStepDigests } from "./population-digest.ts";
import { populationPrograms } from "./population-programs.ts";
import { readSourceFor } from "./scenario-discovery.ts";
import type { PopulationScenarioDocument, ScenarioDocument } from "./scenario-discovery.ts";
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
const referenceAttributes = new Set([
  "id", "sourceRef", "targetRef", "default", "attachedToRef", "activityRef", "bpmnElement", "messageRef", "signalRef",
  "errorRef", "escalationRef",
]);
/** The root elements a trigger or a result refers to by identifier. */
const rootReferences = new Set(["message", "signal", "error", "escalation"]);
const referenceTexts = new Set(["incoming", "outgoing", "flowNodeRef", "inMessageRef", "outMessageRef", "errorRef"]);
/** The schedule fields that name an element or a Message; a process instance field may name a called instance. */
const elementFields = new Set(["elementId", "startEvent", "messageId"]);
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

/** Old identifier to new over every document of `trees`, reversing the lexical order of the renamed identifiers. */
function renaming(trees: readonly (readonly XmlNode[])[]): Map<string, string> {
  const ids = [...new Set(trees.flatMap((tree) => [...elements(tree)]
    .filter(([element, parent]) => (parent !== null && containers.has(parent) && (flowNodes.has(element.local) || element.local === "sequenceFlow"))
      || (parent === "definitions" && rootReferences.has(element.local)))
    .map(([element]) => attribute(element, "id"))
    .filter((id): id is string => id !== undefined)))]
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

/**
 * The candidates among which declaration order is semantic share a group; any other node is its own. The root start
 * Events of one Process form a group: a broadcast or a Conditional start evaluation that fires several of them reaches
 * them in document order (POPULATION-SEMANTICS-SPEC.md, "Conditional start evaluations" and "Signal broadcasts"), so
 * their order is observable in which instance starts first and in the fan-out it reports.
 */
function candidateGroup(node: XmlNode, container: string): string | null {
  if (node.kind !== "element") return null;
  if (node.local === "boundaryEvent") return `boundary:${attribute(node, "attachedToRef") ?? ""}`;
  if (node.local === "startEvent" && container === "process") return "rootStart";
  return node.local === "subProcess" && attribute(node, "triggeredByEvent") === "true" ? "eventSubProcess" : null;
}

/** `picked` reversed, except that the members of one candidate group keep their declared order among themselves. */
function reverseKeepingGroups(picked: XmlNode[], container: string): XmlNode[] {
  const reversed = [...picked].reverse();
  const groups = new Map<string, XmlNode[]>();
  for (const node of picked) {
    const group = candidateGroup(node, container);
    if (group !== null) groups.set(group, [...(groups.get(group) ?? []), node]);
  }
  return reversed.map((node) => {
    const group = candidateGroup(node, container);
    return group === null ? node : groups.get(group)!.shift()!;
  });
}

function permute(nodes: readonly XmlNode[]): void {
  for (const [element] of elements(nodes)) {
    if (!containers.has(element.local)) continue;
    permuteSlots(element.children, (local) => flowNodes.has(local), (picked) => reverseKeepingGroups(picked, element.local));
    // Stable, so the flows leaving one source keep their declared order.
    const source = (node: XmlNode): string => (node.kind === "element" ? attribute(node, "sourceRef") ?? "" : "");
    permuteSlots(element.children, (local) => local === "sequenceFlow",
      (picked) => picked.sort((left, right) => (source(left) < source(right) ? 1 : source(left) > source(right) ? -1 : 0)));
  }
}

/** The variant sources of the documents `xmls` and the one identifier map applied to all of them. */
export function variants(xmls: readonly string[]): { xmls: string[]; names: ReadonlyMap<string, string> } {
  const trees = xmls.map((xml) => {
    const tree = parse(xml);
    assert.equal(serialize(tree), xml, "the tokenizer round-trips the source");
    return tree;
  });
  const names = renaming(trees);
  for (const tree of trees) {
    rename(tree, names);
    permute(tree);
  }
  return { xmls: trees.map(serialize), names };
}

/** The variant source and the identifier map it applied. */
export function variant(xml: string): { xml: string; names: ReadonlyMap<string, string> } {
  const { xmls: [changed], names } = variants([xml]);
  return { xml: changed!, names };
}

/** The source with the flow nodes and the Sequence Flows of every container in reverse declaration order. */
export function declarationReversed(xml: string): string {
  const tree = parse(xml);
  for (const [element] of elements(tree)) {
    if (!containers.has(element.local)) continue;
    permuteSlots(element.children, (local) => flowNodes.has(local), (picked) => [...picked].reverse());
    permuteSlots(element.children, (local) => local === "sequenceFlow", (picked) => [...picked].reverse());
  }
  return serialize(tree);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** A cursor over an identifier's UTF-8 bytes that reads literal text and `<len>:<bytes>` segments. */
function segments(id: string) {
  const bytes = encoder.encode(id);
  let at = 0;
  return {
    literal(text: string): boolean {
      const expected = encoder.encode(text);
      if (expected.some((byte, index) => bytes[at + index] !== byte)) return false;
      at += expected.length;
      return true;
    },
    segment(): string | null {
      let digits = at;
      while (digits < bytes.length && bytes[digits]! >= 0x30 && bytes[digits]! <= 0x39) digits += 1;
      if (digits === at || bytes[digits] !== 0x3a) return null;
      const length = Number(decoder.decode(bytes.slice(at, digits)));
      if (digits + 1 + length > bytes.length) return null;
      try {
        const text = decoder.decode(bytes.slice(digits + 1, digits + 1 + length));
        at = digits + 1 + length;
        return text;
      } catch {
        return null;
      }
    },
    rest(): string {
      const text = decoder.decode(bytes.slice(at));
      at = bytes.length;
      return text;
    },
  };
}

const prefixed = (text: string): string => `${encoder.encode(text).length}:${text}`;

/**
 * An emitter key `<len>:<instanceId>:<len>:<elementId>:<activation>` with its element and instance renamed; null when
 * `key` is not one.
 */
function renamedEmitter(key: string, names: ReadonlyMap<string, string>): string | null {
  const cursor = segments(key);
  const instance = cursor.segment();
  const element = instance !== null && cursor.literal(":") ? cursor.segment() : null;
  const activation = cursor.rest();
  if (instance === null || element === null || !/^:\d+$/u.test(activation)) return null;
  return `${prefixed(renamedInstance(instance, names))}:${prefixed(names.get(element) ?? element)}${activation}`;
}

/**
 * A derived instance identifier with the element identifiers it embeds renamed, each length prefix recomputed: a
 * called instance's Call Activity, nested callers included (`calledInstanceId`); a started instance's start Event,
 * with a cascade's emitter key (`startedInstanceId`, `cascadeInstanceId`); a Timer-started one's start Event
 * (`timerInstanceId`). Any other identifier, a scenario's own among them, is returned as it is.
 */
function renamedInstance(id: string, names: ReadonlyMap<string, string>): string {
  const cursor = segments(id);
  if (cursor.literal("call:")) {
    const caller = cursor.segment();
    const call = caller !== null && cursor.literal(":") ? cursor.segment() : null;
    if (caller === null || call === null) return id;
    return `call:${prefixed(renamedInstance(caller, names))}:${prefixed(names.get(call) ?? call)}${cursor.rest()}`;
  }
  if (cursor.literal("start:")) {
    const command = cursor.segment();
    const deployment = command !== null && cursor.literal(":") ? cursor.segment() : null;
    const start = deployment !== null && cursor.literal(":") ? cursor.segment() : null;
    if (command === null || deployment === null || start === null) return id;
    const base = `start:${prefixed(command)}:${prefixed(deployment)}:${prefixed(names.get(start) ?? start)}`;
    if (cursor.literal(":")) {
      const key = cursor.segment();
      const emitter = key === null ? null : renamedEmitter(key, names);
      return emitter === null || cursor.rest() !== "" ? id : `${base}:${prefixed(emitter)}`;
    }
    return cursor.rest() === "" ? base : id;
  }
  if (cursor.literal("timer:")) {
    const deployment = cursor.segment();
    const start = deployment !== null && cursor.literal(":") ? cursor.segment() : null;
    if (deployment === null || start === null) return id;
    return `timer:${prefixed(deployment)}:${prefixed(names.get(start) ?? start)}${cursor.rest()}`;
  }
  return id;
}

/**
 * `json` with every string at a field `selects` picks renamed through `names`, as an element or an instance; a Signal
 * reference (`signalRef: {id, namespace?}`) names its Signal by `id`.
 */
function mapStrings(json: Json, names: ReadonlyMap<string, string>, selects: (field: string) => boolean, field = ""): Json {
  if (typeof json === "string") {
    if (instanceFields.has(field)) return renamedInstance(json, names);
    return selects(field) ? names.get(json) ?? json : json;
  }
  if (Array.isArray(json)) return json.map((item) => mapStrings(item, names, selects, field));
  if (json !== null && typeof json === "object") {
    return Object.fromEntries(Object.entries(json).map(([key, value]) =>
      [key, mapStrings(value, names, key === "signalRef" ? (inner) => inner === "id" || selects(inner) : selects, key)]));
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

/** The source a witness binds, as these bytes. */
const boundTo = (source: ScenarioDocument["bpmn"], bytes: Uint8Array): ScenarioDocument["bpmn"] => ({ ...source, sha256: sha256(bytes) });

/** The disagreement between `xml`'s run and its renamed and permuted variant's, mapped back; null when they agree. */
async function renamedDisagreement(scenarioPath: string, scenario: ScenarioDocument, xml: string): Promise<string | null> {
  const original = await readSourceFor(scenarioPath, boundTo(scenario.bpmn, encoder.encode(xml)), scenario.profile, encoder.encode(xml));
  if (original.kind !== "read") return `the source is refused (${JSON.stringify(original)})`;
  const expected = JSON.parse(JSON.stringify(runScenario(original.program, scenario)));
  const changed = variant(xml);
  const bytes = encoder.encode(changed.xml);
  const read = await readSourceFor(scenarioPath, boundTo(scenario.bpmn, bytes), scenario.profile, bytes);
  if (read.kind !== "read") return `the variant is refused (${JSON.stringify(read)})`;
  const back = new Map([...changed.names].map(([old, renamed]) => [renamed, old]));
  const schedule = mapStrings(scenario, changed.names, (field) => elementFields.has(field));
  const actual = mapStrings(JSON.parse(JSON.stringify(runScenario(read.program, schedule))), back, () => true);
  // Both results are the kernel's, so its codes and scopes count; open waits are compared in their canonical order.
  const comparison = compareTargetResults({ target: DifferentialTarget.KernelTs, result: scopesSorted(expected) },
    [{ target: DifferentialTarget.Kernel, result: scopesSorted(actual) }]);
  return comparison.kind === ComparisonKind.Disagreement ? JSON.stringify(comparison.disagreement) : null;
}

/**
 * `json` with every `scopes`, `openWaits` and `processStates` list in one order, and a refused deployment's code
 * dropped. The kernel orders these lists by identifiers a renaming changes (see `scopesSorted`; a population's states
 * by instance identifier, which embeds start Events), and a refused deployment reports the first refused element in
 * document order, which a permutation changes as well; the variant must still refuse the same deployment.
 */
function listsSorted(json: Json, field = ""): Json {
  if (Array.isArray(json)) {
    const items = json.map((item) => listsSorted(item));
    return field === "scopes" || field === "openWaits" || field === "processStates"
      ? items.sort((left, right) => (JSON.stringify(left) < JSON.stringify(right) ? -1 : 1)) : items;
  }
  if (json !== null && typeof json === "object") {
    const entries = Object.entries(json).filter(([key]) => !(key === "code" && json.kind === "deploymentRefused"));
    return Object.fromEntries(entries.map(([key, value]) => [key, listsSorted(value, key)]));
  }
  return json;
}

/**
 * The difference between a population's run over `xmls`, one source per declared definition, and over their renamed
 * and permuted variants, mapped back with each variant's digest; null when they agree.
 */
async function renamedPopulationDisagreement(scenarioPath: string, document: PopulationScenarioDocument,
  xmls: readonly string[]): Promise<string | null> {
  const run = async (sources: readonly string[], schedule: PopulationScenarioDocument): Promise<Json> => {
    const bytes = new Map(document.definitions.map((definition, index) => [definition.definitionRef, encoder.encode(sources[index]!)]));
    const bound = { ...schedule, definitions: schedule.definitions.map((definition) =>
      ({ ...definition, bpmn: boundTo(definition.bpmn, bytes.get(definition.definitionRef)!) })) };
    const programs = await populationPrograms(scenarioPath, bound, bytes);
    return JSON.parse(JSON.stringify(runPopulation(programs, bound, populationStepDigests(bound.steps))));
  };
  const expected = listsSorted(await run(xmls, document));
  const changed = variants(xmls);
  const back = new Map([...changed.names].map(([old, renamed]) => [renamed, old]));
  xmls.forEach((xml, index) => back.set(sha256(encoder.encode(changed.xmls[index]!)), sha256(encoder.encode(xml))));
  const schedule = mapStrings(document, changed.names, (field) => elementFields.has(field)) as PopulationScenarioDocument;
  const actual = listsSorted(mapStrings(await run(changed.xmls, schedule), back, () => true));
  if (JSON.stringify(actual) === JSON.stringify(expected)) return null;
  return `expected ${JSON.stringify(expected)}, renamed ${JSON.stringify(actual)}`;
}

test("renaming and permuting every document of an admitted population and their declaration-reversed twins changes nothing the kernel observes beyond the renaming", async () => {
  const files = (await Promise.all(differentialDiscoveryRoots.map(scenarioFiles))).flat().sort();
  const counts = { covered: 0, readerRefused: 0 };
  const findings: string[] = [];
  for (const scenarioPath of files) {
    const document = JSON.parse(await readFile(path.join(projectRoot, scenarioPath), "utf8")) as PopulationScenarioDocument | { kind: string };
    if (document.kind !== "populationScenario") continue;
    const population = document as PopulationScenarioDocument;
    const reads = await Promise.all(population.definitions.map((definition) => readSourceFor(scenarioPath, definition.bpmn, population.profile)));
    if (reads.some((read) => read.kind !== "read")) {
      counts.readerRefused += 1;
      continue;
    }
    counts.covered += 1;
    const xmls = await Promise.all(population.definitions.map((definition) => readFile(path.join(projectRoot, definition.bpmn.relativePath), "utf8")));
    for (const [twin, sources] of [["retained", xmls], ["declaration-reversed", xmls.map(declarationReversed)]] as const) {
      const finding = await renamedPopulationDisagreement(scenarioPath, population, sources);
      if (finding !== null) findings.push(`${scenarioPath} (${twin}): ${finding}`);
    }
  }
  assert.deepEqual(findings, [], JSON.stringify(counts));
  assert.ok(counts.covered > counts.readerRefused, JSON.stringify(counts));
});

test("renaming and permuting every admitted witness and its declaration-reversed twin changes nothing the kernel observes beyond the renaming", async () => {
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
    for (const [twin, source] of [["retained", xml], ["declaration-reversed", declarationReversed(xml)]] as const) {
      const finding = await renamedDisagreement(scenarioPath, scenario, source);
      if (finding !== null) findings.push(`${scenarioPath} (${twin}): ${finding}`);
    }
  }
  assert.deepEqual(findings, [], JSON.stringify(counts));
  // The cohort is the retained witnesses; an empty or shrunken run would pass vacuously.
  assert.ok(counts.covered > counts.readerRefused + counts.notDeployed, JSON.stringify(counts));
});
