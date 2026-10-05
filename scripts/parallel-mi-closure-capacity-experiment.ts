import assert from "node:assert/strict";
import { closeSupportedInternalOperations } from "../packages/semantic-core/src/semantic-process-closure.ts";

import type { SemanticOperation, SemanticOperationKind, SemanticOriginKind } from "../packages/semantic-core/src/semantic-process-contract.ts";

type Graph = ReadonlyArray<readonly [id: string, kind: "wait" | "flow" | "end", outputs: readonly string[]]>;
type Body = { index: number; fired: string[]; tokens: number[]; waits: string[] };
type State = { phase: "start" | "enter" | "bodies" | "parentEnd" | "parentComplete" | "done";
  bodies: Body[]; completed: number; cancelled: number; commands: number };

// Proposal-only control witness: no source admission, data, public IDs or production MI semantics.
const graphs = {
  serial: [["review", "wait", ["validate"]], ["validate", "wait", ["end"]], ["end", "end", []]],
  joined: [["fork", "flow", ["review", "validate"]], ["review", "wait", ["join"]],
    ["validate", "wait", ["join"]], ["join", "flow", ["confirm"]],
    ["confirm", "wait", ["end"]], ["end", "end", []]],
  separateEnds: [["fork", "flow", ["review", "validate"]], ["review", "wait", ["humanEnd"]],
    ["validate", "wait", ["serviceEnd"]], ["humanEnd", "end", []], ["serviceEnd", "end", []]],
  emptyBranches: [["review", "wait", ["fork"]], ["fork", "flow", ["join", "join"]],
    ["join", "flow", ["validate"]], ["validate", "wait", ["end"]], ["end", "end", []]],
} satisfies Record<string, Graph>;

function experiment(graph: Graph, count: number, early: boolean, reverse: boolean, fixedLimit?: number) {
  const edges = graph.flatMap(([source, , outputs]) => outputs.map(target => ({ source, target })));
  const freshBody = (index: number): Body => ({ index, fired: [], tokens: [], waits: [] });
  const initial: State = { phase: "start", bodies: [], completed: 0, cancelled: 0, commands: 0 };
  // Each acyclic body node and retirement fires at most once; four operations cover the parent.
  const derivedLimit = 4 + count * (graph.length + 1);
  const limit = fixedLimit ?? derivedLimit;
  const order = <T>(values: readonly T[]): T[] => reverse ? [...values].reverse() : [...values];
  const emit = (body: Body, source: string) => edges.forEach((edge, index) => {
    if (edge.source === source) body.tokens.push(index);
  });
  function step(state: State): Array<{ operation: SemanticOperation; successor: State }> {
    const next = structuredClone(state);
    let id: string | undefined;
    switch (next.phase) {
      case "start": next.phase = "enter"; id = "start"; break;
      case "enter":
        next.bodies = Array.from({ length: count }, (_, index) => freshBody(index));
        next.phase = count === 0 ? "parentEnd" : "bodies";
        id = "enter";
        break;
      case "parentEnd": next.phase = "parentComplete"; id = "parentEnd"; break;
      case "parentComplete": next.phase = "done"; id = "parentComplete"; break;
      case "done": return [];
      case "bodies": {
        for (const body of order(next.bodies)) {
          const node = order(graph).find(([candidate]) => !body.fired.includes(candidate) &&
            edges.every((edge, index) => edge.target !== candidate || body.tokens.includes(index)));
          if (node !== undefined) {
            const [candidate, kind] = node;
            body.fired.push(candidate);
            body.tokens = body.tokens.filter(index => edges[index]!.target !== candidate);
            if (kind === "wait") body.waits.push(candidate);
            else emit(body, candidate);
            id = `${body.index}:${candidate}`;
            break;
          }
          if (body.waits.length === 0 && body.tokens.length === 0 && body.fired.length === graph.length) {
            next.bodies = next.bodies.filter(other => other.index !== body.index);
            next.completed++;
            if (early) {
              next.cancelled += next.bodies.length;
              next.bodies = [];
            }
            if (next.bodies.length === 0) next.phase = "parentEnd";
            id = `${body.index}:retire`;
            break;
          }
        }
        if (id === undefined) return [];
        break;
      }
      default: assert.fail("unknown experimental phase");
    }
    assert.ok(id !== undefined);
    // The closure helper consumes only operation identity; this envelope has no semantic dispatch here.
    const operation: SemanticOperation = { id, kind: "reachNoneEnd" as SemanticOperationKind.ReachNoneEnd,
      input: "control-witness", origin: { kind: "bpmnElement" as SemanticOriginKind.BpmnElement, elementId: id } };
    return [{ operation, successor: next }];
  }
  function settle(state: State) {
    const result = closeSupportedInternalOperations(state, limit, step,
      () => assert.fail("this experiment selects explicit internal schedules"),
      () => assert.fail("no prepared batch selected"));
    assert.equal(result.ambiguousInternalChoice, false);
    return result;
  }
  let result = settle(initial);
  let maximumBurst = result.steps.length;
  let totalAutomatic = result.steps.length;
  if (fixedLimit !== undefined) return { hitBound: result.hitBound };
  let firstEndWhileSiblingWaits = false;
  while (result.state.phase !== "done") {
    assert.equal(result.hitBound, false);
    const state = structuredClone(result.state);
    firstEndWhileSiblingWaits ||= state.bodies.some(body => body.waits.length > 0 &&
      graph.some(([id, kind]) => kind === "end" && body.fired.includes(id)));
    const waits = state.bodies.flatMap(body => body.waits.map(task => ({ body: body.index, task })));
    const selected = order(waits)[0];
    assert.ok(selected, "every nonterminal stable state has real external work");
    const body = state.bodies.find(value => value.index === selected.body)!;
    body.waits = body.waits.filter(task => task !== selected.task);
    emit(body, selected.task);
    state.commands++;
    assert.ok(state.commands <= count * graph.filter(([, kind]) => kind === "wait").length);
    result = settle(state);
    maximumBurst = Math.max(maximumBurst, result.steps.length);
    totalAutomatic += result.steps.length;
  }
  assert.equal(result.hitBound, false);
  assert.equal(result.state.completed, early && count > 0 ? 1 : count);
  assert.equal(result.state.cancelled, early && count > 0 ? count - 1 : 0);
  assert.ok(totalAutomatic <= derivedLimit);
  if (!early) assert.equal(totalAutomatic, derivedLimit);
  if (graph === graphs.separateEnds && count > 0) assert.equal(firstEndWhileSiblingWaits, true);
  return { hitBound: result.hitBound, count, early, reverse, derivedLimit, maximumBurst, totalAutomatic };
}

const fixedEight = process.argv.includes("--fixed-eight");
if (fixedEight) {
  const result = experiment(graphs.serial, 16, false, false, 8);
  assert.equal(result.hitBound, false, "sixteen serial bodies must reach their initial waits");
} else {
  let cases = 0;
  for (const [name, graph] of Object.entries(graphs)) {
    for (const count of [0, 1, 2, 16]) {
      for (const early of [false, true]) {
        for (const reverse of [false, true]) {
          const result = experiment(graph, count, early, reverse);
          if (count === 16 && !early && !reverse) console.log(JSON.stringify({ graph: name, ...result }));
          cases++;
        }
      }
    }
  }
  console.log(`CONTROL_WITNESSES_PASS=${cases}; production semantics and quantified bound remain unproved`);
}
