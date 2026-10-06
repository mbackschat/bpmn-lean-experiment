import { CheckedNodeKind as Kind, MappingExpressionKind as Mapping, VariableValueKind as Value, compareCanonicalStrings } from "@bpmn-lean/semantic-core";
import type { CheckedNode, CheckedProcess, VariableBinding } from "@bpmn-lean/semantic-core";
import { parallelAdmissionCases } from "./parallel-scope-admission-fixture.ts";

export type ParallelStartBoundCase = Readonly<{ source: CheckedProcess; bindings: readonly VariableBinding[]; expected: number | null }>;

export async function parallelStartBoundCases(): Promise<readonly ParallelStartBoundCase[]> {
  const admission = await parallelAdmissionCases();
  const baseline = admission[0]!.source;
  const cases: ParallelStartBoundCase[] = [];
  const items = (values: string[]): VariableBinding => ({ name: "items", value: { kind: Value.StringList, value: values } });
  const scalar = (name: string): VariableBinding => ({ name, value: { kind: Value.Null } });
  const add = (source: CheckedProcess, bindings: readonly VariableBinding[], expected: number | null) => cases.push({ source, bindings, expected });
  const changeEntry = (patch: Partial<Extract<CheckedNode, { kind: Kind.ParallelMultiInstanceSubProcess }>>): CheckedProcess => ({ ...baseline, nodes: baseline.nodes.map((node): CheckedNode =>
    node.kind === Kind.ParallelMultiInstanceSubProcess ? { ...node, ...patch } : node) });
  const paired = admission.find(({ expected, source }) => expected && source.nodes.some(node => node.kind === Kind.ParallelGateway) &&
    source.nodes.filter(node => node.kind === Kind.NoneEndEvent).length === 2)!.source;
  const separate = admission.find(({ expected, source }) => expected && source.nodes.filter(node => node.kind === Kind.NoneEndEvent).length === 4)!.source;
  for (const [source, body] of [[baseline, 5], [paired, 9], [separate, 9]] as const)
    for (const count of [0, 1, 16]) add(source, [items(Array(count).fill("same"))], 5 + count * body);
  for (const { source, expected } of admission.filter(({ source }) => source.nodes.length >= 1023).slice(0, 6)) {
    const root = source.definitionScopes.find(scope => scope.parentScopeId === null)!;
    const longParent = source.nodeScopes.filter(owner => owner.scopeId === root.id).length > 4;
    add(source, [items(Array(16).fill("x"))], expected ? longParent ? 1099 : 16309 : null);
  }
  add(baseline, [], null);
  add(baseline, [items(Array(17).fill("x"))], null);
  add(baseline, [items(["😀".repeat(128)])], 10);
  add(baseline, [items(["😀".repeat(128) + "x"])], null);
  add(baseline, [items([...Array(15).fill("x".repeat(512)), "x".repeat(463)])], 85);
  add(baseline, [items([...Array(15).fill("x".repeat(512)), "x".repeat(464)])], null);
  add(baseline, [items([""])], 10);
  add(baseline, [scalar("items")], null);
  add(baseline, [items([]), items([])], null);
  add(baseline, [scalar("invoiceValidator"), items([])], null);
  add(baseline, [scalar("seed"), items([])], null);
  const entry = baseline.nodes.find(node => node.kind === Kind.ParallelMultiInstanceSubProcess)!;
  const withInput = changeEntry({ bodyInputs: [...entry.bodyInputs, { target: "snapshot", expression: { kind: Mapping.EnclosingVariable, name: "seed" } }] });
  add(withInput, [items([])], null);
  add(withInput, [items([]), scalar("seed")], 5);
  add(withInput, [items(["x"]), { name: "seed", value: { kind: Value.Boolean, value: false } }], null);
  const conditional = changeEntry({ completionBooleanName: "stop" });
  add(conditional, [items([])], null);
  for (const value of [false, true]) add(conditional, [items(Array(16).fill("x")), { name: "stop", value: { kind: Value.Boolean, value } }], 85);
  add(conditional, [items([]), scalar("stop")], null);
  const inherited = { ...baseline, nodes: baseline.nodes.map((node): CheckedNode => node.kind === Kind.ServiceTask ? { ...node,
    inputMappings: [{ target: "payload", expression: { kind: Mapping.EnclosingVariable, name: "region" } }] } : node) };
  add(inherited, [items([])], null);
  add(inherited, [items([]), scalar("region")], 5);
  const parentEffect = { ...baseline, nodes: baseline.nodes.map((node): CheckedNode => node.id === "PublishBatch" ? {
    kind: Kind.ServiceTask, id: node.id, descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "publish" },
    inputMappings: [{ target: "payload", expression: { kind: Mapping.EnclosingVariable, name: "item" } }], outputMappings: [], bpmnErrorRoute: null } : node) };
  add(parentEffect, [items([])], null);
  add(parentEffect, [items([]), scalar("item")].sort((a, b) => compareCanonicalStrings(a.name, b.name)), 5);
  add(changeEntry({ collectionName: "records" }), [{ ...items(Array(16).fill("same")), name: "records" }], 85);
  add({ ...baseline, identity: { ...baseline.identity, semanticProfile: "unselected" } }, [items([])], null);
  return cases;
}
