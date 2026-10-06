import { CheckedNodeKind as Kind, MappingExpressionKind as Mapping, VariableValueKind as Value, compareCanonicalStrings, GatewayDirection, BoundaryInterruption, MessageChannelKind } from "@bpmn-lean/semantic-core";
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


export async function parallelStartFrontierCases() {
  const initial = await parallelStartBoundCases();
  const baseline = initial[0]!.source;
  const child = baseline.definitionScopes.find(scope => scope.parentScopeId !== null)!;
  const service = baseline.nodes.find(node => node.kind === Kind.ServiceTask)!;
  const ownsChild = (id: string) => baseline.nodeScopes.some(owner => owner.nodeId === id && owner.scopeId === child.id);
  type Capacity = Readonly<{ waits: number; effects: number }>;
  const cases: { source: CheckedProcess; bindings: readonly VariableBinding[]; expected: Capacity | null }[] = [];
  const add = (source: CheckedProcess, count: number, expected: Capacity | null) => cases.push({ source,
    bindings: [{ name: "items", value: { kind: Value.StringList, value: Array(count).fill("same") } }], expected });
  const wide = (humans: number, effects: number, separateEnds: boolean): CheckedProcess => {
    const nodes: CheckedNode[] = [{ kind: Kind.NoneStartEvent, id: "WidthStart" },
      { kind: Kind.ParallelGateway, id: "WidthFork", direction: GatewayDirection.Diverging }];
    const flows = [{ id: "WidthEntry", sourceId: "WidthStart", targetId: "WidthFork", condition: null }];
    if (!separateEnds) nodes.push({ kind: Kind.ParallelGateway, id: "WidthJoin", direction: GatewayDirection.Converging },
      { kind: Kind.NoneEndEvent, id: "WidthEnd" });
    for (let index = 0; index < humans + effects; index++) {
      const id = `WidthTask${index}`;
      nodes.push(index < humans ? { kind: Kind.UserTask, id, name: null } : { ...service, id });
      const end = separateEnds ? `WidthEnd${index}` : "WidthJoin";
      if (separateEnds) nodes.push({ kind: Kind.NoneEndEvent, id: end });
      flows.push({ id: `WidthIn${index}`, sourceId: "WidthFork", targetId: id, condition: null },
        { id: `WidthOut${index}`, sourceId: id, targetId: end, condition: null });
    }
    if (!separateEnds) flows.push({ id: "WidthExit", sourceId: "WidthJoin", targetId: "WidthEnd", condition: null });
    return { ...baseline, nodes: [...baseline.nodes.filter(node => !ownsChild(node.id)), ...nodes],
      nodeScopes: [...baseline.nodeScopes.filter(owner => owner.scopeId !== child.id), ...nodes.map(node => ({ nodeId: node.id, scopeId: child.id }))],
      sequenceFlows: [...baseline.sequenceFlows.filter(flow => !ownsChild(flow.sourceId)), ...flows],
      sequenceFlowScopes: [...baseline.sequenceFlowScopes.filter(owner => owner.scopeId !== child.id), ...flows.map(flow => ({ sequenceFlowId: flow.id, scopeId: child.id }))] };
  };
  for (const separate of [false, true]) {
    for (const [human, effect, count, expected] of [
      [4, 4, 16, { waits: 128, effects: 64 }], [5, 4, 16, null], [3, 5, 16, null],
      [128, 1, 1, null], [127, 1, 1, { waits: 128, effects: 1 }],
      [1, 64, 1, { waits: 65, effects: 64 }], [1, 65, 1, null],
      [8, 8, 0, { waits: 1, effects: 0 }], [4, 4, 17, null],
    ] as const) add(wide(human, effect, separate), count, expected);
  }
  for (const separate of [false, true]) {
    const outer = wide(2, 1, separate);
    const inner: CheckedNode[] = [{ kind: Kind.UserTask, id: "InnerHuman", name: null },
      { ...service, id: "InnerEffectA" }, { ...service, id: "InnerEffectB" },
      { kind: Kind.ParallelGateway, id: "InnerJoin", direction: GatewayDirection.Converging }];
    const flows = inner.slice(0, 3).flatMap(node => [
      { id: `In${node.id}`, sourceId: "WidthTask0", targetId: node.id, condition: null },
      { id: `Out${node.id}`, sourceId: node.id, targetId: "InnerJoin", condition: null }]);
    const nested: CheckedProcess = { ...outer,
      nodes: [...outer.nodes.map((node): CheckedNode => node.id === "WidthTask0" ? { kind: Kind.ParallelGateway, id: node.id, direction: GatewayDirection.Diverging } : node), ...inner],
      nodeScopes: [...outer.nodeScopes, ...inner.map(node => ({ nodeId: node.id, scopeId: child.id }))],
      sequenceFlows: [...outer.sequenceFlows.map(flow => flow.id === "WidthOut0" ? { ...flow, sourceId: "InnerJoin" } : flow), ...flows],
      sequenceFlowScopes: [...outer.sequenceFlowScopes, ...flows.map(flow => ({ sequenceFlowId: flow.id, scopeId: child.id }))] };
    add(nested, 16, { waits: 80, effects: 48 });
    add({ ...nested, nodes: [...nested.nodes].reverse(), sequenceFlows: [...nested.sequenceFlows].reverse() }, 16, { waits: 80, effects: 48 });
  }
  for (const count of [0, 1, 16]) add(baseline, count, { waits: Math.max(1, count), effects: count });
  for (const entry of initial.filter(entry => entry.source.nodes.length === 1023).slice(0, 2))
    add(entry.source, 16, { waits: 16, effects: 16 });
  const parentEffect = { ...baseline, nodes: baseline.nodes.map(node => node.id === "PublishBatch" ? { ...service, id: node.id, inputMappings: [] } : node) };
  add(parentEffect, 0, { waits: 1, effects: 1 });
  add(parentEffect, 16, { waits: 16, effects: 16 });
  for (const entry of cases.slice(0, 2)) cases.push({ ...entry, source: { ...entry.source, nodes: [...entry.source.nodes].reverse(), sequenceFlows: [...entry.source.sequenceFlows].reverse() } });
  for (const entry of cases.filter(entry => entry.expected !== null))
    cases.push({ ...entry, source: { ...entry.source, interruptingMessageEventSubProcesses: [] } });
  const [first] = cases;
  cases.push({ ...first!, source: { ...first!.source, interruptingMessageEventSubProcesses: [{
    parentScopeId: "root", handlerScopeId: "handler", elementId: "Handler", startEventId: "MessageStart",
    childEntryFlowId: "HandlerEntry", interruption: BoundaryInterruption.Interrupting,
    channel: { kind: MessageChannelKind.DirectMessage, messageId: "Cancel" },
  }] }, expected: null });
  for (const entry of initial.filter(entry => entry.expected === null)) cases.push({ ...entry, expected: null });
  return cases;
}
