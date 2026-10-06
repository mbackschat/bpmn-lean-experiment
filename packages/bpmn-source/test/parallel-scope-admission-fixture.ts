import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { source, prepareSource, overlayDocument, parallelBodySource } from "./sequential-scope-source-fixture.ts";
import { CheckedNodeKind as Kind, PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID as profile } from "@bpmn-lean/semantic-core";
import type { CheckedProcess, CheckedNode } from "@bpmn-lean/semantic-core";
const compiler = await import(new URL("../dist/multi-instance-scope-source-compiler.js", import.meta.url).href) as typeof import("../src/multi-instance-scope-source-compiler.ts");
const { importBpmnGraph } = await import(new URL("../dist/moddle-adapter.js", import.meta.url).href) as typeof import("../src/moddle-adapter.ts");

export async function parallelAdmissionCases(): Promise<readonly { source: CheckedProcess; expected: boolean }[]> {
  const xml = prepareSource(await readFile(source, "utf8")).replace('isSequential="true"', 'isSequential="false"');
  const cases: { source: CheckedProcess; expected: boolean }[] = [];
  for (const text of [xml, parallelBodySource(xml, 3, false), parallelBodySource(xml, 3, true)]) {
    const imported = await importBpmnGraph(text, 5000);
    const result = compiler.compileParallelScopeSource(imported.rootElement, { kind: "bpmnSource", id: "admission-fixture",
      sha256: "0".repeat(64), byteLength: Buffer.byteLength(text), declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
      { identity: { id: "bindings", sha256: "1".repeat(64) }, semanticProfile: profile, inertAttributes: [], effectBindings: overlayDocument.effectBindings });
    assert.ok(result.checkedProcess);
    const valid: CheckedProcess = result.checkedProcess;
    cases.push({ source: valid, expected: true }, { source: { ...valid, nodes: [...valid.nodes].reverse() }, expected: true },
      { source: { ...valid, interruptingMessageEventSubProcesses: [] }, expected: true });
    cases.push(...[
      { ...valid, identity: { ...valid.identity, sourceOverlay: null } },
      { ...valid, processId: valid.nodes[0]!.id },
      { ...valid, nodeScopes: valid.nodeScopes.slice(1) },
      { ...valid, definitionScopes: valid.definitionScopes.map(scope => scope.parentScopeId === null ? scope : { ...scope, originElementId: "foreign" }) },
      { ...valid, sequenceFlows: valid.sequenceFlows.map(flow => flow.id === "Confirmed" ? { ...flow, targetId: "Review" } : flow) },
      { ...valid, sequenceFlows: valid.sequenceFlows.map(flow => flow.id === "Validated" ? { ...flow, targetId: "PublishBatch" } : flow) },
      { ...valid, nodes: valid.nodes.map((node): CheckedNode => node.kind === Kind.ParallelMultiInstanceSubProcess ? { ...node,
        bodyInputs: node.bodyInputs.map(mapping => ({ ...mapping, target: "invoiceValidator" })) } : node) },
      { ...valid, nodes: valid.nodes.map((node): CheckedNode => node.kind === Kind.ServiceTask ? { ...node,
        outputMappings: node.outputMappings.map(mapping => ({ ...mapping, target: "items" })) } : node) },
      { ...valid, sequenceFlowScopes: valid.sequenceFlowScopes.slice(1) },
      { ...valid, sequenceFlows: valid.sequenceFlows.map((flow, index) => index === 0 ? { ...flow, targetId: "Unknown" } : flow) },
      { ...valid, sequenceFlows: [...valid.sequenceFlows, { ...valid.sequenceFlows[0]!, id: "DuplicateArc" }],
        sequenceFlowScopes: [...valid.sequenceFlowScopes, { ...valid.sequenceFlowScopes.find(owner => owner.sequenceFlowId === valid.sequenceFlows[0]!.id)!, sequenceFlowId: "DuplicateArc" }] },
      { ...valid, definitionScopes: valid.definitionScopes.map(scope => ({ ...scope, id: valid.definitionScopes[0]!.id })) },
      { ...valid, nodes: valid.nodes.map((node): CheckedNode => node.kind === Kind.ParallelMultiInstanceSubProcess ? { ...node, itemName: node.collectionName } : node) },
      { ...valid, nodes: valid.nodes.map((node): CheckedNode => node.kind === Kind.ParallelMultiInstanceSubProcess ? { ...node, kind: Kind.SequentialMultiInstanceSubProcess } : node) },
    ].map(source => ({ source, expected: false })));
  }
  const baseline = cases[0]!.source;
  for (const owner of baseline.definitionScopes) {
    const isolated: CheckedNode = { kind: Kind.UserTask, id: "Isolated", name: null };
    cases.push({ source: { ...baseline, nodes: [...baseline.nodes, isolated],
      nodeScopes: [...baseline.nodeScopes, { nodeId: isolated.id, scopeId: owner.id }],
      sequenceFlows: [...baseline.sequenceFlows, { id: "SelfLoop", sourceId: isolated.id, targetId: isolated.id, condition: null }],
      sequenceFlowScopes: [...baseline.sequenceFlowScopes, { sequenceFlowId: "SelfLoop", scopeId: owner.id }] }, expected: false });
    const start = baseline.nodes.find(node => node.kind === Kind.NoneStartEvent &&
      baseline.nodeScopes.some(binding => binding.nodeId === node.id && binding.scopeId === owner.id))!;
    const startFlow = baseline.sequenceFlows.find(flow => flow.sourceId === start.id)!;
    for (const limit of [1024, 1025]) {
      const count = limit - baseline.nodes.length - 1;
      const nodes: CheckedNode[] = Array.from({ length: count }, (_, index) => ({ kind: Kind.UserTask, id: `Capacity${index}`, name: null }));
      const flows = nodes.map((node, index) => ({ id: `CapacityFlow${index}`, sourceId: index === 0 ? start.id : nodes[index - 1]!.id,
        targetId: node.id, condition: null }));
      cases.push({ source: { ...baseline, nodes: [...baseline.nodes, ...nodes],
        nodeScopes: [...baseline.nodeScopes, ...nodes.map(node => ({ nodeId: node.id, scopeId: owner.id }))],
        sequenceFlows: [...baseline.sequenceFlows.map(flow => flow.id === startFlow.id ? { ...flow, sourceId: nodes.at(-1)!.id } : flow), ...flows],
        sequenceFlowScopes: [...baseline.sequenceFlowScopes, ...flows.map(flow => ({ sequenceFlowId: flow.id, scopeId: owner.id }))] }, expected: limit === 1024 });
    }
  }
  for (const entry of cases.filter(entry => entry.expected && entry.source.nodes.length === 1023))
    cases.push({ source: { ...entry.source, nodes: [...entry.source.nodes].reverse() }, expected: true });
  return cases;
}
