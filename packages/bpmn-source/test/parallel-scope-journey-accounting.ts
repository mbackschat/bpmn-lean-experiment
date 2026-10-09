import assert from "node:assert/strict";
import { ControlStateKind, SemanticFlowNodeOccurrenceAnchorKind, SemanticOperationKind, SemanticTransitionKind, StimulusKind, VariableValueKind, initialState, replayCommittedTransitions } from "@bpmn-lean/semantic-core";
import type { ScopeOccurrenceId, SemanticProcessProgram, TracedCommandResult } from "@bpmn-lean/semantic-core";
const { sameScopeOccurrence } = await import(new URL("../../semantic-core/dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-process-state.ts");

const { parallelScopeProgramStartCapacity } = await import(new URL("../../semantic-core/dist/parallel-scope-program-capacity.js", import.meta.url).href
) as typeof import("../../semantic-core/src/parallel-scope-program-capacity.ts");

export function assertJourneyExecutionCounts(program: SemanticProcessProgram, traces: readonly TracedCommandResult[], bound?: number): void {
  const internal = traces.flatMap(trace => trace.committedTransitions).filter(record =>
    record.transition.kind === SemanticTransitionKind.InternalOperation);

  const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
  assert.ok(entry?.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
  const first = traces[0]?.committedTransitions[0];
  assert.ok(first?.transition.kind === SemanticTransitionKind.ExternalStimulus && first.transition.stimulus.kind === StimulusKind.StartProcess);
  const start = first.transition.stimulus;
  const admitted = replayCommittedTransitions(program, initialState, [first]);
  const root = admitted?.scopeOccurrences.find(scope => scope.parent === null)?.id;
  assert.ok(root, "Start admission supplies the exact root occurrence");
  const collection = start.initialVariables.find(binding => binding.name === entry.collectionName)?.value;
  assert.ok(collection?.kind === VariableValueKind.StringList);
  const parentDeclarations = program.operations.filter(operation => program.operationScopes.some(binding => binding.operationId === operation.id && binding.scopeId === root.definitionScopeId));
  const childDeclarations = program.operations.filter(operation => program.operationScopes.some(binding => binding.operationId === operation.id && binding.scopeId === entry.childScopeId));
  const retirementDeclarations = childDeclarations.filter(operation => operation.kind === SemanticOperationKind.CompleteParallelMultiInstanceScope);
  const bodyDeclarations = childDeclarations.filter(operation => operation.kind !== SemanticOperationKind.CompleteParallelMultiInstanceScope);
  assert.equal(retirementDeclarations.length, 1);
  assert.equal(parentDeclarations.length + childDeclarations.length, program.operations.length, "source declaration partition is complete");
  const capacity = parallelScopeProgramStartCapacity(program, start.initialVariables);
  assert.ok(capacity);
  const potential = [...parentDeclarations.map(operation => operation.id), ...collection.value.flatMap((_, index) =>
    childDeclarations.map(operation => `${index}:${operation.id}`))];
  assert.equal(capacity.closureBound, potential.length, "capacity covers exactly the source declaration/iteration slots");
  assert.equal(capacity.closureBound, parentDeclarations.length + collection.value.length * childDeclarations.length);
  assert.ok(internal.length <= (bound ?? capacity.closureBound), "charged internal steps exceed the admission-derived journey bound");
  let parentRecords = 0, bodyRecords = 0, retirementRecords = 0;

  if (traces.at(-1)?.result.state.control.kind === ControlStateKind.Completed) {
    const transitions = internal.flatMap(record => record.transition.kind === SemanticTransitionKind.InternalOperation ? [record.transition] : []);
    const phase = (kind: SemanticOperationKind, label: string) => {
      const selected = transitions.filter(transition => transition.operationKind === kind);
      assert.equal(selected.length, 1, `whole journey has exactly one ${label}`);
      const transition = selected[0]!;
      const root = program.definitionScopes.find(scope => scope.parentScopeId === null)!;
      assert.equal(transition.owner.definitionScopeId, root.id, `${label} uses the root owner`);
      return transitions.indexOf(transition);
    };
    const initiation = phase(SemanticOperationKind.Initiate, "initiation");
    const entered = phase(SemanticOperationKind.EnterParallelMultiInstanceScope, "parallel entry");
    const completed = phase(SemanticOperationKind.CompleteScope, "root completion");
    assert.equal(initiation, 0, "initiation is the first whole-journey internal record");
    assert.ok(initiation < entered && entered < completed, "whole-journey phases occur in order");
    assert.equal(completed, transitions.length - 1, "root completion is the final whole-journey internal record");
    for (const transition of transitions) switch (transition.operationKind) {
      case SemanticOperationKind.Initiate:
      case SemanticOperationKind.EnterParallelMultiInstanceScope:
      case SemanticOperationKind.CompleteScope:
      case SemanticOperationKind.AwaitUserTask:
      case SemanticOperationKind.AwaitEffect:
      case SemanticOperationKind.Duplicate:
      case SemanticOperationKind.Synchronize:
      case SemanticOperationKind.ReachNoneEnd:
      case SemanticOperationKind.CompleteParallelMultiInstanceScope: break;
      default: assert.fail("whole journey contains an unsupported internal phase kind");
    }
  }
  const published: ScopeOccurrenceId[] = [];
  const seen = new Set<string>();
  for (const trace of traces) {
    assert.equal(trace.flowNodeOccurrenceLifecycles.length, trace.committedTransitions.length, "one lifecycle delta per record");
    for (const [index, record] of trace.committedTransitions.entries()) {
      for (const start of trace.flowNodeOccurrenceLifecycles[index]!.started)
        if (start.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope) published.push(start.anchor.id);
      const transition = record.transition;
      if (transition.kind !== SemanticTransitionKind.InternalOperation) continue;
      const declarations = program.operations.filter(operation => operation.id === transition.operationId);
      const bindings = program.operationScopes.filter(binding => binding.operationId === transition.operationId);
      assert.equal(declarations.length, 1, "exact operation declaration exists");
      assert.equal(bindings.length, 1, "exact operation declaration has one scope");
      const declaration = bindings[0]!;
      assert.equal(transition.operationKind, declarations[0]!.kind, "record matches declared operation kind");
      assert.deepEqual(transition.origin, declarations[0]!.origin, "record matches declared operation origin");
      assert.equal(transition.owner.definitionScopeId, declaration.scopeId, "operation uses its declared scope");
      const parent: boolean = declaration.scopeId === root.definitionScopeId;
      if (parent) {
        assert.deepEqual(transition.owner, root, "parent record uses exact root occurrence");
        parentRecords++;
      } else {
        assert.equal(declaration.scopeId, entry.childScopeId);
        assert.ok(published.some(owner => sameScopeOccurrence(owner, transition.owner)), "body owner has an exact published Scope start no later than use");
        if (transition.operationKind === SemanticOperationKind.CompleteParallelMultiInstanceScope) retirementRecords++;
        else bodyRecords++;
      }
      const key = JSON.stringify([transition.owner.processInstanceId, transition.owner.definitionScopeId,
        transition.owner.activation, transition.operationId]);
      assert.equal(seen.has(key), false, `${parent ? "parent" : "body"} operation fired twice for one exact scope occurrence`);
      seen.add(key);
    }
  }
  const children = published.filter(owner => owner.definitionScopeId === entry.childScopeId);
  assert.equal(new Set(children.map(owner => JSON.stringify(owner))).size, children.length, "published child owners are unique");
  assert.ok(children.length <= collection.value.length);
  assert.equal(internal.length, parentRecords + bodyRecords + retirementRecords, "all charged records have exactly one partition");
  assert.ok(parentRecords <= parentDeclarations.length);
  assert.ok(bodyRecords <= children.length * bodyDeclarations.length);
  assert.ok(retirementRecords <= children.length * retirementDeclarations.length);
  if (traces.at(-1)?.result.state.control.kind === ControlStateKind.Completed) {
    assert.equal(parentRecords, parentDeclarations.length, "terminal journey visits the complete parent path once");
    assert.equal(children.length, collection.value.length, "entry publishes the captured population");
  }
}
