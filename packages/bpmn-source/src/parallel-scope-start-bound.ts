import { analyzeParallelScopeData, sequentialScopeStartDataAdmitted, VariableValueKind, SemanticOperationKind as Op, analyzeRepeatedScopeStructure, structuredParallelBodyFrontierCapacity } from "@bpmn-lean/semantic-core";
import type { CheckedProcess, VariableBinding } from "@bpmn-lean/semantic-core";
import { parallelScopeCheckedSourceAdmitted } from "./multi-instance-scope-source-compiler.js";
import { lowerCheckedProcess } from "./semantic-process-lowering.js";

/** PMIS-ADMIT-01 derives closure fuel from admitted source and Start data; it grants no runtime or host capacity. */
export function parallelScopeStartClosureBound(source: CheckedProcess, bindings: readonly VariableBinding[]): number | undefined {
  const start = analyzeStart(source, bindings);
  if (start === undefined) return undefined;
  const { program, count } = start;
  const root = program.definitionScopes.find(scope => scope.parentScopeId === null)!;
  const parent = program.operationScopes.filter(owner => owner.scopeId === root.id).length;
  return parent + count * (program.operations.length - parent);
}

/** PMIS-ADMIT-01 bounds simultaneous semantic waits/effects; byte and host admission remain separate. */
export function parallelScopeStartFrontierCapacity(source: CheckedProcess, bindings: readonly VariableBinding[]) {
  const start = analyzeStart(source, bindings);
  if (start === undefined) return undefined;
  const { program, count } = start;
  const control = analyzeRepeatedScopeStructure(program, source.identity.semanticProfile, Op.EnterParallelMultiInstanceScope);
  if (control === undefined) return undefined;
  const effects = new Set(program.operations.filter(operation => operation.kind === Op.AwaitEffect).map(operation => operation.id));
  const body = structuredParallelBodyFrontierCapacity(control.body, effects);
  if (body === undefined) return undefined;
  const parentIds = new Set(program.operationScopes.filter(owner => owner.scopeId !== control.childScopeId).map(owner => owner.operationId));
  const parent = program.operations.filter(operation => parentIds.has(operation.id));
  const waits = Math.max(parent.some(operation => operation.kind === Op.AwaitUserTask || operation.kind === Op.AwaitEffect) ? 1 : 0, count * body.waits);
  const effectCount = Math.max(parent.some(operation => operation.kind === Op.AwaitEffect) ? 1 : 0, count * body.effects);
  return waits <= 128 && effectCount <= 64 ? { waits, effects: effectCount } : undefined;
}

function analyzeStart(source: CheckedProcess, bindings: readonly VariableBinding[]) {
  if (!parallelScopeCheckedSourceAdmitted(source)) return undefined;
  const program = lowerCheckedProcess(source);
  const data = analyzeParallelScopeData(program);
  if (data === undefined || !sequentialScopeStartDataAdmitted(data, bindings)) return undefined;
  const collection = bindings.find(binding => binding.name === data.collectionName)?.value;
  if (collection?.kind !== VariableValueKind.StringList) return undefined;
  return { program, count: collection.value.length };
}
