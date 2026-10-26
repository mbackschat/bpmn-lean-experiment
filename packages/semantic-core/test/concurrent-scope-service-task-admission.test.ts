/**
 * CSE-ADMIT-01 over the checked graph: a data-free Service Task is a task wherever the nested scope-control class
 * admits a User Task. The oracle for the burst is the same model with that Service Task replaced by a User Task,
 * because the proposal charges an effect completion exactly as a User Task completion; an analysis that left the
 * Service Task out of the per-body task list would return a smaller bound.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { NestedScopeControlCheckedGraph } from "../src/nested-scope-control-admission.ts";

const core = await import(new URL("../dist/index.js", import.meta.url).href) as typeof import("../src/index.ts");
const { EffectProtocol, nestedScopeControlCheckedAnalysis } = core;

type Node = Readonly<Record<string, unknown> & { id: string; kind: string }>;

const start = (id: string): Node => ({ kind: "noneStartEvent", id });
const end = (id: string): Node => ({ kind: "noneEndEvent", id });
const user = (id: string): Node => ({ kind: "userTask", id });
const service = (id: string, extra: Readonly<Record<string, unknown>> = {}): Node => ({
  kind: "serviceTask", id, descriptor: { protocol: EffectProtocol.Activity, operation: `handle${id}` },
  inputMappings: [], outputMappings: [], bpmnErrorRoute: null, ...extra,
});
const sub = (id: string, childScopeId: string): Node => ({ kind: "embeddedSubProcess", id, childScopeId });
const fork = (id: string): Node => ({ kind: "parallelGateway", id, direction: "diverging" });
const join = (id: string): Node => ({ kind: "parallelGateway", id, direction: "converging" });
const merge = (id: string): Node => ({ kind: "exclusiveMerge", id });
const call = (id: string, calledProcessId: string): Node => ({ kind: "callActivity", id, calledProcessId, data: { kind: "empty" } });

type Scope = Readonly<{ id: string; parent: string | null; origin: string; nodes: readonly Node[]; flows: readonly (readonly [string, string])[] }>;

function graph(scopes: readonly Scope[]): NestedScopeControlCheckedGraph {
  return {
    definitionScopes: scopes.map(({ id, parent, origin }) => ({ id, parentScopeId: parent, originElementId: origin })),
    nodeScopes: scopes.flatMap(({ id, nodes }) => nodes.map(node => ({ nodeId: node.id, scopeId: id }))),
    nodes: scopes.flatMap(({ nodes }) => nodes),
    flows: scopes.flatMap(({ flows }) => flows).map(([sourceId, targetId], index) =>
      ({ id: `f${index}`, sourceId, targetId, condition: null })),
  } as unknown as NestedScopeControlCheckedGraph;
}

/** A serial chain `Start → tasks… → End` of one scope body. */
function chain(id: string, parent: string | null, origin: string, tasks: readonly Node[]): Scope {
  const nodes = [start(`${id}Start`), ...tasks, end(`${id}End`)];
  return { id, parent, origin, nodes, flows: nodes.slice(1).map((node, index) => [nodes[index]!.id, node.id] as const) };
}

/** Supplier onboarding: two Service Tasks beside a User Task in a Parallel block of a Sub-Process, then a root Service Task. */
function supplier(screen: Node = service("Screen")): NestedScopeControlCheckedGraph {
  const root = chain("R", null, "Supplier", [sub("Onboard", "O"), service("Activate")]);
  const onboard: Scope = {
    id: "O", parent: "R", origin: "Onboard",
    nodes: [start("OStart"), fork("OFork"), screen, service("Verify"), user("Review"), join("OJoin"), user("Approve"), end("OEnd")],
    flows: [["OStart", "OFork"], ["OFork", screen.id], ["OFork", "Verify"], ["OFork", "Review"], [screen.id, "OJoin"],
      ["Verify", "OJoin"], ["Review", "OJoin"], ["OJoin", "Approve"], ["Approve", "OEnd"]],
  };
  return graph([root, onboard]);
}

test("admits data-free Service Tasks in a Parallel block of a Sub-Process and in the root body", () => {
  assert.notEqual(nestedScopeControlCheckedAnalysis(supplier()), null);
});

test("admits a Service Task in each branch of a merge region and in its merge-target body", () => {
  const root = chain("R", null, "Claim", [sub("Intake", "I"), user("Settle")]);
  const intake: Scope = {
    id: "I", parent: "R", origin: "Intake",
    nodes: [start("IStart"), fork("IFork"), user("Collect"), service("Fetch"), merge("IMerge"), sub("Assess", "A"), end("IEnd")],
    flows: [["IStart", "IFork"], ["IFork", "Collect"], ["IFork", "Fetch"], ["Collect", "IMerge"], ["Fetch", "IMerge"],
      ["IMerge", "Assess"], ["Assess", "IEnd"]],
  };
  const assess = chain("A", "I", "Assess", [service("Price"), user("Confirm")]);
  assert.notEqual(nestedScopeControlCheckedAnalysis(graph([root, intake, assess])), null);
});

test("charges a Service Task completion that cascades through three scope completions like a User Task completion", () => {
  // The root body holds only S1, so the deepest completion reaches the root End: the closure limit of 8.
  const nested = (last: Node) => graph([
    chain("R", null, "P", [sub("S1", "C1")]),
    chain("C1", "R", "S1", [sub("S2", "C2")]),
    chain("C2", "C1", "S2", [sub("S3", "C3")]),
    chain("C3", "C2", "S3", [user("First"), last]),
  ]);
  assert.equal(nestedScopeControlCheckedAnalysis(nested(user("Last"))), 8);
  assert.equal(nestedScopeControlCheckedAnalysis(nested(service("Last"))), 8);
});

test("refuses a Service Task whose completion cascade exceeds the closure limit", () => {
  // Forking First against the Service Task adds the join to the cascade: 9 steps.
  const deepest: Scope = {
    id: "C3", parent: "C2", origin: "S3",
    nodes: [start("C3Start"), fork("C3Fork"), user("First"), service("Last"), join("C3Join"), end("C3End")],
    flows: [["C3Start", "C3Fork"], ["C3Fork", "First"], ["C3Fork", "Last"], ["First", "C3Join"], ["Last", "C3Join"],
      ["C3Join", "C3End"]],
  };
  assert.equal(nestedScopeControlCheckedAnalysis(graph([
    chain("R", null, "P", [sub("S1", "C1")]),
    chain("C1", "R", "S1", [sub("S2", "C2")]),
    chain("C2", "C1", "S2", [sub("S3", "C3")]),
    deepest,
  ])), null);
});

test("refuses a Service Task with a mapping, an Error route or a non-Activity descriptor", () => {
  const mapping = { target: "x", expression: { kind: "literal", value: { kind: "string", value: "v" } } };
  for (const extra of [
    { inputMappings: [mapping] },
    { outputMappings: [mapping] },
    { bpmnErrorRoute: { code: "E", output: "Recover" } },
    { descriptor: { protocol: "urn:other", operation: "handleScreen" } },
  ]) {
    assert.equal(nestedScopeControlCheckedAnalysis(supplier(service("Screen", extra))), null, JSON.stringify(extra));
  }
});

test("admits 32 multiplicity-weighted Service Tasks and refuses 33", () => {
  const services = (count: number) => graph([
    chain("R", null, "P", [sub("S", "C")]),
    chain("C", "R", "S", Array.from({ length: count }, (_, index) => service(`T${index}`))),
  ]);
  assert.notEqual(nestedScopeControlCheckedAnalysis(services(32)), null);
  assert.equal(nestedScopeControlCheckedAnalysis(services(33)), null);
});

test("weights a merge target's Service Tasks once per fork output against the 32 bound", () => {
  // Two fork outputs double the target body: 16 Service Tasks weigh 32, 17 weigh 34.
  const region = (targetServices: number) => graph([
    chain("R", null, "P", [sub("Outer", "O")]),
    {
      id: "O", parent: "R", origin: "Outer",
      nodes: [start("OStart"), fork("OFork"), user("Left"), user("Right"), merge("OMerge"), sub("Target", "T"), end("OEnd")],
      flows: [["OStart", "OFork"], ["OFork", "Left"], ["OFork", "Right"], ["Left", "OMerge"], ["Right", "OMerge"],
        ["OMerge", "Target"], ["Target", "OEnd"]],
    },
    chain("T", "O", "Target", Array.from({ length: targetServices }, (_, index) => service(`T${index}`))),
  ]);
  assert.notEqual(nestedScopeControlCheckedAnalysis(region(16)), null);
  assert.equal(nestedScopeControlCheckedAnalysis(region(17)), null);
});

test("refuses a Service Task in a model with a Call Activity", () => {
  const withCall = (task: Node) => graph([
    chain("R", null, "Caller", [call("Invoke", "Callee"), task]),
    chain("K", null, "Callee", [user("Called")]),
  ]);
  assert.notEqual(nestedScopeControlCheckedAnalysis(withCall(user("Next"))), null);
  assert.equal(nestedScopeControlCheckedAnalysis(withCall(service("Next"))), null);
});

test("refuses a Service Task in a called Process body", () => {
  assert.equal(nestedScopeControlCheckedAnalysis(graph([
    chain("R", null, "Caller", [call("Invoke", "Callee"), user("Next")]),
    chain("K", null, "Callee", [service("Called")]),
  ])), null);
});
