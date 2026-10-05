import { SemanticOperationKind as Op } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { analyzeSequentialScopeControl } from "./sequential-scope-control-analysis.js";
import { analyzeSequentialScopeData } from "./sequential-scope-data-admission.js";

export function sequentialScopeProgramShape(operations: readonly SemanticOperation[], scopeCount: number): boolean {
  const count = (kind: Op) => operations.filter(operation => operation.kind === kind).length;
  return scopeCount === 2 && [Op.Initiate, Op.EnterSequentialMultiInstanceScope, Op.CompleteSequentialMultiInstanceScope, Op.CompleteScope]
    .every(kind => count(kind) === 1) && count(Op.ReachNoneEnd) >= 2 && count(Op.AwaitUserTask) > 0 && count(Op.AwaitEffect) > 0 &&
    operations.every(operation => {
    switch (operation.kind) {
      case Op.Initiate:
      case Op.EnterSequentialMultiInstanceScope:
      case Op.CompleteSequentialMultiInstanceScope:
      case Op.ReachNoneEnd:
      case Op.Duplicate:
      case Op.Synchronize: return true;
      case Op.CompleteScope: return operation.parentOutput === null;
      case Op.AwaitUserTask: return operation.task.metadata === undefined && operation.task.elementId === operation.origin.elementId;
      case Op.AwaitEffect: return operation.bpmnErrorRoute === null && operation.effect.elementId === operation.origin.elementId;
      default: return false;
    }
  });
}

/** SMIS-ADMIT-01 requires the complete mixed body and source identity as well as separately checked control and data. */
export function sequentialScopeProgramAdmitted(program: SemanticProcessProgram): boolean {
  if (program.identity.sourceOverlay === null || !sequentialScopeProgramShape(program.operations, program.definitionScopes.length)) return false;
  const control = analyzeSequentialScopeControl(program);
  if (control === undefined || analyzeSequentialScopeData(program) === undefined) return false;
  const childIds = new Set(program.operationScopes.filter(owner => owner.scopeId === control.childScopeId).map(owner => owner.operationId));
  if (![Op.AwaitUserTask, Op.AwaitEffect].every(kind => program.operations.some(operation => childIds.has(operation.id) && operation.kind === kind))) return false;
  const origins = [program.processId, ...program.controlPlaces.map(place => place.origin.elementId),
    ...program.operations.flatMap(operation => operation.kind === Op.CompleteScope || operation.kind === Op.CompleteSequentialMultiInstanceScope
      ? [] : [operation.origin.elementId])];
  return new Set(origins).size === origins.length;
}
