/**
 * Malformed scope trees reach the nested scope-control analyses before generic graph validation, because Program
 * well-formedness runs the profile capability first. The contract is a refusal (`null`), as in Lean, where depth
 * recursion carries fuel and every declared scope must own a body; the oracle is that both analyses return `null`
 * rather than throwing.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { NestedScopeControlCheckedGraph } from "../src/nested-scope-control-admission.ts";
import type { SemanticProcessProgram } from "../src/index.ts";

const core = await import(new URL("../dist/index.js", import.meta.url).href) as typeof import("../src/index.ts");
const { InternalSchedulingMode, SemanticOperationKind: Op, nestedScopeControlCheckedAnalysis,
  nestedScopeControlProgramAnalysis } = core;

test("a cyclic scope parent chain is refused by the Program analysis", () => {
  const scoped = [["i0", "R"], ["e0", "R"], ["cR", "R"], ["eB", "A"], ["ea", "A"], ["cA", "A"], ["eA", "B"],
    ["eb", "B"], ["cB", "B"]].map(([operationId, scopeId]) => ({ operationId: operationId!, scopeId: scopeId! }));
  const program = {
    identity: { semanticProfile: "cibseven-2.2.0-embedded-subprocess-completion-draft", sourceOverlay: null },
    internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
    definitionScopes: [
      { id: "A", parentScopeId: "B", originElementId: "SA" },
      { id: "B", parentScopeId: "A", originElementId: "SB" },
      { id: "R", parentScopeId: null, originElementId: "P" },
    ],
    operationScopes: scoped,
    operations: [
      { kind: Op.Initiate, id: "i0", output: "p0" },
      { kind: Op.ReachNoneEnd, id: "e0", input: "p0" },
      { kind: Op.CompleteScope, id: "cR", scopeId: "R", parentOutput: null },
      { kind: Op.EnterScope, id: "eB", input: "a0", childEntry: "b0", childScopeId: "B" },
      { kind: Op.ReachNoneEnd, id: "ea", input: "a1" },
      { kind: Op.CompleteScope, id: "cA", scopeId: "A", parentOutput: "b1" },
      { kind: Op.EnterScope, id: "eA", input: "b0", childEntry: "a0", childScopeId: "A" },
      { kind: Op.ReachNoneEnd, id: "eb", input: "b1" },
      { kind: Op.CompleteScope, id: "cB", scopeId: "B", parentOutput: "a1" },
    ],
  } as unknown as SemanticProcessProgram;
  assert.equal(nestedScopeControlProgramAnalysis(program), null);
});

test("a declared child scope without a body, beside a body in an undeclared scope, is refused by the checked analysis", () => {
  const graph = {
    definitionScopes: [
      { id: "R", parentScopeId: null, originElementId: "P" },
      { id: "S", parentScopeId: "R", originElementId: "Sub" },
    ],
    nodeScopes: [["RS", "R"], ["Sub", "R"], ["RE", "R"], ["ZS", "Z"], ["ZT", "Z"], ["ZE", "Z"]]
      .map(([nodeId, scopeId]) => ({ nodeId: nodeId!, scopeId: scopeId! })),
    nodes: [
      { kind: "noneStartEvent", id: "RS" }, { kind: "embeddedSubProcess", id: "Sub", childScopeId: "S" },
      { kind: "noneEndEvent", id: "RE" }, { kind: "noneStartEvent", id: "ZS" }, { kind: "userTask", id: "ZT" },
      { kind: "noneEndEvent", id: "ZE" },
    ],
    flows: [["RS", "Sub"], ["Sub", "RE"], ["ZS", "ZT"], ["ZT", "ZE"]]
      .map(([sourceId, targetId], index) => ({ id: `f${index}`, sourceId: sourceId!, targetId: targetId!, condition: null })),
  } as unknown as NestedScopeControlCheckedGraph;
  assert.equal(nestedScopeControlCheckedAnalysis(graph), null);
});
