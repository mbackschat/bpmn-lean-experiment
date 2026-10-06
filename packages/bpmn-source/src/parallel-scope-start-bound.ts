import { analyzeParallelScopeData, sequentialScopeStartDataAdmitted, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { CheckedProcess, VariableBinding } from "@bpmn-lean/semantic-core";
import { parallelScopeCheckedSourceAdmitted } from "./multi-instance-scope-source-compiler.js";
import { lowerCheckedProcess } from "./semantic-process-lowering.js";

/** PMIS-ADMIT-01 derives closure fuel from admitted source and Start data; it grants no runtime or host capacity. */
export function parallelScopeStartClosureBound(source: CheckedProcess, bindings: readonly VariableBinding[]): number | undefined {
  if (!parallelScopeCheckedSourceAdmitted(source)) return undefined;
  const program = lowerCheckedProcess(source);
  const data = analyzeParallelScopeData(program);
  if (data === undefined || !sequentialScopeStartDataAdmitted(data, bindings)) return undefined;
  const collection = bindings.find(binding => binding.name === data.collectionName)?.value;
  if (collection?.kind !== VariableValueKind.StringList) return undefined;
  const root = program.definitionScopes.find(scope => scope.parentScopeId === null)!;
  const parent = program.operationScopes.filter(owner => owner.scopeId === root.id).length;
  const bodyWithRetirement = program.operations.length - parent;
  return parent + collection.value.length * bodyWithRetirement;
}
