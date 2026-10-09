import type { VariableBinding } from "./contract.js";
import { VariableValueKind } from "./contract.js";
import { SemanticOperationKind as Op } from "./semantic-process-contract.js";
import { PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID as profile } from "./semantic-profile-catalog.js";
import { isWellFormedSemanticProcessProgram } from "./semantic-process-admission.js";
import { repeatedScopeProgramShape } from "./sequential-scope-program-admission.js";
import { analyzeRepeatedScopeStructure } from "./repeated-scope-control-analysis.js";
import { analyzeParallelScopeData, sequentialScopeStartDataAdmitted } from "./sequential-scope-data-admission.js";
import { structuredParallelBodyFrontierCapacity } from "./structured-parallel-body-analysis.js";

export type ParallelScopeStartCapacity = Readonly<{ closureBound: number; waits: number; effects: number }>;

/** PMIS-ADMIT-01 independently checks raw IL and Start data; it grants no execution or hosting capability. */
export function parallelScopeProgramStartCapacity(value: unknown, bindings: readonly VariableBinding[]): ParallelScopeStartCapacity | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const operations = (value as Record<string, unknown>).operations;
  if (!Array.isArray(operations) || operations.length > 1024 ||
      !isWellFormedSemanticProcessProgram(value)) return undefined;
  const program = value;
  if (program.identity.semanticProfile !== profile || program.identity.sourceOverlay === null ||
      !repeatedScopeProgramShape(program.operations, program.definitionScopes.length, Op.EnterParallelMultiInstanceScope, Op.CompleteParallelMultiInstanceScope)) return undefined;
  const control = analyzeRepeatedScopeStructure(program, profile, Op.EnterParallelMultiInstanceScope);
  const data = analyzeParallelScopeData(program);
  if (control === undefined || data === undefined || !sequentialScopeStartDataAdmitted(data, bindings)) return undefined;
  const childIds = new Set(program.operationScopes.filter(owner => owner.scopeId === control.childScopeId).map(owner => owner.operationId));
  if (![Op.AwaitUserTask, Op.AwaitEffect].every(kind => program.operations.some(operation => childIds.has(operation.id) && operation.kind === kind))) return undefined;
  const origins = [program.processId, ...program.controlPlaces.map(place => place.origin.elementId),
    ...program.operations.flatMap(operation => operation.kind === Op.CompleteScope || operation.kind === Op.CompleteParallelMultiInstanceScope ? [] : [operation.origin.elementId])];
  if (new Set(origins).size !== origins.length) return undefined;
  const collection = bindings.find(binding => binding.name === data.collectionName)?.value;
  if (collection?.kind !== VariableValueKind.StringList) return undefined;
  const count = collection.value.length;
  const effectIds = new Set(program.operations.filter(operation => operation.kind === Op.AwaitEffect).map(operation => operation.id));
  const body = structuredParallelBodyFrontierCapacity(control.body, effectIds);
  if (body === undefined) return undefined;
  const parent = program.operations.filter(operation => !childIds.has(operation.id));
  const waits = Math.max(parent.some(operation => operation.kind === Op.AwaitUserTask || operation.kind === Op.AwaitEffect) ? 1 : 0, count * body.waits);
  const effects = Math.max(parent.some(operation => operation.kind === Op.AwaitEffect) ? 1 : 0, count * body.effects);
  const closureBound = parent.length + count * childIds.size;
  return waits <= 128 && effects <= 64 ? { closureBound, waits, effects } : undefined;
}
