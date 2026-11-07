/**
 * Per-work facts of the scope host and exit, and the Program rule that each is its scope's sole entry or completion,
 * per the [scope host specification](../../../docs/capsules/SCOPE-HOST-FLOW-LISTS-SPEC.md#per-work-accessors). The
 * Lean `SemanticOperation.kind` and `ProgramStructuralValidation` transcribe them independently.
 *
 * No legacy projection exists: the host Program rules require two or more entries or outputs, so consumers that read
 * a committed step's work name `Scope` and `ScopeExit` explicitly instead of settling them.
 */
import {
  type PublishedSemanticOperationKind,
  type SemanticOperation,
  SemanticOperationKind,
  ScopeWorkKind,
} from "./semantic-process-contract.js";

export type ScopeHostOperation = Extract<SemanticOperation, { kind: SemanticOperationKind.Scope }>;
export type ScopeExitOperation = Extract<SemanticOperation, { kind: SemanticOperationKind.ScopeExit }>;

/** SCPH-HOST-01: a host or exit publishes its work's legacy kind, never its discriminant. */
export function scopeHostPublishedKind(operation: ScopeHostOperation | ScopeExitOperation): PublishedSemanticOperationKind {
  if (operation.kind === SemanticOperationKind.ScopeExit) return SemanticOperationKind.CompleteScope;
  switch (operation.work.kind) {
    case ScopeWorkKind.Process:
      return SemanticOperationKind.Initiate;
    case ScopeWorkKind.SubProcess:
      return SemanticOperationKind.EnterScope;
  }
}

/** The child scope a legacy entry or a `subProcess` host opens (SCPH-HOST-01). */
export function enteredChildScopeId(operation: SemanticOperation): string | null {
  switch (operation.kind) {
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.EnterBoundedScope:
    case SemanticOperationKind.EnterMonitoredScope:
    case SemanticOperationKind.EnterSequentialMultiInstanceScope:
    case SemanticOperationKind.EnterParallelMultiInstanceScope:
      return operation.childScopeId;
    case SemanticOperationKind.Scope:
      return operation.work.kind === ScopeWorkKind.SubProcess ? operation.work.childScopeId : null;
    default:
      return null;
  }
}

/**
 * SCPH-HOST-01: a `subProcess` host is the only operation entering its child scope, and an exit the only one completing
 * its scope, as the Lean `scopeEntryOperations` and `scopeCompletionOperations` require.
 */
export function scopeHostsAreSole(operations: ReadonlyArray<SemanticOperation>): boolean {
  const entered = operations.flatMap((operation) => {
    const child = enteredChildScopeId(operation);
    return child === null ? [] : [child];
  });
  const completed = operations.flatMap((operation) =>
    operation.kind === SemanticOperationKind.CompleteScope || operation.kind === SemanticOperationKind.ScopeExit
      ? [operation.scopeId] : []);
  const once = (ids: ReadonlyArray<string>, id: string) => ids.filter((candidate) => candidate === id).length === 1;
  return operations.every((operation) =>
    operation.kind === SemanticOperationKind.Scope && operation.work.kind === ScopeWorkKind.SubProcess
      ? once(entered, operation.work.childScopeId)
      : operation.kind !== SemanticOperationKind.ScopeExit || once(completed, operation.scopeId));
}
