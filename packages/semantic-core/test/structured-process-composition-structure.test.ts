import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome, InternalSchedulingMode, SemanticOperationKind, StimulusKind, VariableValueKind,
  applyStimulus, initialState, isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { SemanticOperation } from "@bpmn-lean/semantic-core";
import { operationBase } from "./semantic-program-parts.ts";
import { choice, compositionProcessId, compositionProgram } from "./structured-process-composition-fixture.ts";

const NodeKind = Object.freeze({
  Start: SemanticOperationKind.Initiate, Task: SemanticOperationKind.AwaitUserTask,
  Choice: SemanticOperationKind.Choose, Merge: SemanticOperationKind.MergeExclusive, End: SemanticOperationKind.ReachNoneEnd,
});
type NodeKind = typeof NodeKind[keyof typeof NodeKind];
type Edge = readonly [string, string];
function graph(nodes: Readonly<Record<string, NodeKind>>, edges: readonly Edge[]) {
  const flows = edges.map((_, index) => `Flow_${index.toString().padStart(3, "0")}`);
  const incoming = (id: string) => edges.flatMap(([, target], index) => target === id ? [flows[index]!] : []);
  const outgoing = (id: string) => edges.flatMap(([source], index) => source === id ? [flows[index]!] : []);
  const only = (values: readonly string[]) => { assert.equal(values.length, 1); return values[0]!; };
  const operations = Object.entries(nodes).map(([id, kind]): SemanticOperation => {
    switch (kind) {
      case NodeKind.Start: return { ...operationBase(id), kind: SemanticOperationKind.Initiate, output: `place:${only(outgoing(id))}` };
      case NodeKind.End: return { ...operationBase(id), kind: SemanticOperationKind.ReachNoneEnd, input: `place:${only(incoming(id))}` };
      case NodeKind.Task: return { ...operationBase(id), kind: SemanticOperationKind.AwaitUserTask,
        input: `place:${only(incoming(id))}`, output: `place:${only(outgoing(id))}`, task: { elementId: id, name: null } };
      case NodeKind.Choice: {
        const outputs = outgoing(id);
        assert.equal(outputs.length, 3);
        return choice(id, only(incoming(id)), [outputs[0]!, outputs[1]!, outputs[2]!]);
      }
      case NodeKind.Merge: {
        const inputs = incoming(id).map((flow) => `place:${flow}`);
        assert.equal(inputs.length, 3);
        return { ...operationBase(id), kind: SemanticOperationKind.MergeExclusive,
          inputs: [inputs[0]!, inputs[1]!, inputs[2]!], output: `place:${only(outgoing(id))}` };
      }
    }
  });
  return compositionProgram(operations, flows);
}

function nestedEmptyRegions(depth: number) {
  const nodes: Record<string, NodeKind> = { Start: NodeKind.Start, Wait: NodeKind.Task, End: NodeKind.End };
  const edges: Edge[] = [["Start", "Choice0"], ["Merge0", "Wait"], ["Wait", "End"]];
  for (let i = 0; i < depth; i += 1) {
    nodes[`Choice${i}`] = NodeKind.Choice;
    nodes[`Merge${i}`] = NodeKind.Merge;
    edges.push([`Choice${i}`, i + 1 < depth ? `Choice${i + 1}` : `Merge${i}`],
      [`Choice${i}`, `Merge${i}`], [`Choice${i}`, `Merge${i}`]);
    if (i > 0) edges.push([`Merge${i}`, `Merge${i - 1}`]);
  }
  return graph(nodes, edges);
}

const start = {
  kind: StimulusKind.StartProcess, commandId: "start", processId: compositionProcessId,
  instanceId: "Instance", initialVariables: [{ name: "Decision", value: { kind: VariableValueKind.String, value: "approved" } }],
} as const;

test("nested empty branches retain multiplicity and close at exactly eight steps", () => {
  const program = nestedEmptyRegions(3);
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const closed = applyStimulus(program, initialState, start);
  assert.equal(closed.outcome, CommandOutcome.Committed);
  assert.deepEqual(closed.state.userTaskWaits.map(({ id }) => id.elementId), ["Wait"]);
  assert.equal(applyStimulus(program, initialState, start, 7).internalStepBoundExceeded, true);
  assert.equal(isWellFormedSemanticProcessProgram(nestedEmptyRegions(4)), false);
});

test("a nine-step completion burst is rejected before starting", () => {
  const nodes: Record<string, NodeKind> = {
    Start: NodeKind.Start, Route: NodeKind.Choice, A: NodeKind.Task, B: NodeKind.Task, C: NodeKind.Task,
    Join: NodeKind.Merge, End: NodeKind.End,
  };
  const edges: Edge[] = [["Start", "Route"], ["Route", "A"], ["Route", "B"], ["Route", "C"],
    ["A", "Join"], ["B", "Join"], ["C", "Join"], ["Join", "Choice0"], ["Merge0", "End"]];
  for (let i = 0; i < 3; i += 1) {
    nodes[`Choice${i}`] = NodeKind.Choice; nodes[`Merge${i}`] = NodeKind.Merge;
    edges.push([`Choice${i}`, i < 2 ? `Choice${i + 1}` : `Merge${i}`],
      [`Choice${i}`, `Merge${i}`], [`Choice${i}`, `Merge${i}`]);
    if (i > 0) edges.push([`Merge${i}`, `Merge${i - 1}`]);
  }
  assert.equal(isWellFormedSemanticProcessProgram(graph(nodes, edges)), false);
});

test("crossing Exclusive regions reject despite valid individual arities", () => {
  assert.equal(isWellFormedSemanticProcessProgram(graph({
    Start: NodeKind.Start, Outer: NodeKind.Choice, Inner: NodeKind.Choice,
    A: NodeKind.Task, B: NodeKind.Task, C: NodeKind.Task, D: NodeKind.Task, E: NodeKind.Task,
    First: NodeKind.Merge, Second: NodeKind.Merge, End: NodeKind.End,
  }, [["Start", "Outer"], ["Outer", "Inner"], ["Outer", "A"], ["Outer", "B"],
    ["Inner", "C"], ["Inner", "D"], ["Inner", "E"], ["A", "First"], ["C", "First"],
    ["D", "First"], ["B", "Second"], ["E", "Second"], ["First", "Second"], ["Second", "End"]])), false);
});

test("a long serial task chain is bounded by waits rather than total program length", () => {
  const nodes: Record<string, NodeKind> = { Start: NodeKind.Start, End: NodeKind.End };
  const edges: Edge[] = [["Start", "Task0"], ["Task39", "End"]];
  for (let i = 0; i < 40; i += 1) {
    nodes[`Task${i}`] = NodeKind.Task;
    if (i > 0) edges.push([`Task${i - 1}`, `Task${i}`]);
  }
  const program = graph(nodes, edges);
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(isWellFormedSemanticProcessProgram({ ...program,
    internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule,
  }), false);
});
