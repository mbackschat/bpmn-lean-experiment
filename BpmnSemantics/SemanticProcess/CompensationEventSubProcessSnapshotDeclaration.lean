import BpmnSemantics.SemanticProcess.JsonSupport

/-! # Compensation Event Sub-Process snapshot declaration

Program-only validation for the optional hidden snapshot declaration and its narrow dormant-handler scope lifecycle. Runtime snapshots remain outside this module so graph admission depends only on immutable Program data.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def safeNat (value : Nat) : Bool :=
  BpmnSemantics.SemanticProcessJson.isSafeWireNat value

private def operationScope? (program : Program) (operationId : OperationId) :
    Option DefinitionScopeId :=
  (program.operationScopes.find? fun ownership =>
    decide (ownership.operationId = operationId)).map (·.scopeId)

/-- The child definition scope entered by each scope-entering operation family. The exhaustive match makes a newly added family fail compilation until its lifecycle role is classified. -/
def enteredChildScopeId? : SemanticOperation → Option DefinitionScopeId
  | .enterScope _ _ _ _ childScopeId
  | .enterBoundedScope _ _ _ _ childScopeId _ => some childScopeId
  | .initiate .. | .initiateMessage .. | .initiateTimer .. | .invokeProcess .. | .returnProcess .. | .awaitUserTask ..
  | .awaitDataInputUserTask ..
  | .awaitDataOutputUserTask ..
  | .awaitSequentialMultiInstanceUserTask ..
  | .awaitParallelMultiInstanceUserTask ..
  | .completeParallelMultiInstanceUserTask ..
  | .awaitTimer .. | .awaitMessage .. | .awaitPayloadMessage ..
  | .awaitCorrelatedPayloadMessage .. | .awaitEventRace ..
  | .awaitBoundedUserTask .. | .awaitMonitoredUserTask ..
  | .awaitMessageBoundedUserTask ..
  | .awaitEffect .. | .duplicate ..
  | .synchronize .. | .mergeExclusive .. | .choose .. | .selectMany ..
  | .synchronizeSelected ..
  | .throwError .. | .reachNoneEnd .. | .terminateScope ..
  | .completeScope .. => none

private def completesScope (scopeId : DefinitionScopeId) : SemanticOperation → Bool
  | .completeScope _ _ completedScopeId _ => completedScopeId == scopeId
  | _ => false

private def scopeHasOneEntry (program : Program) (scopeId : DefinitionScopeId) : Bool :=
  (program.operations.filter fun operation =>
    enteredChildScopeId? operation = some scopeId).length = 1

private def ordinaryScopeLifecycleValid (program : Program)
    (entryRootId : DefinitionScopeId) (scope : DefinitionScope) : Bool :=
  (match scope.parentScopeId with
  | none =>
      if scope.id = entryRootId then
        (program.operations.filter (completesScope scope.id)).length = 1 &&
          (program.operations.filter fun operation =>
            match operation with
            | .returnProcess id _ _ _ _ =>
                operationScope? program id = some scope.id
            | _ => false).isEmpty
      else
        (program.operations.filter (completesScope scope.id)).isEmpty &&
          (program.operations.filter fun operation =>
            match operation with
            | .returnProcess id _ _ _ _ =>
                operationScope? program id = some scope.id
            | _ => false).length = 1
  | some _ =>
      (program.operations.filter (completesScope scope.id)).length = 1) &&
    match scope.parentScopeId with
    | none =>
        program.operations.all fun operation =>
          enteredChildScopeId? operation ≠ some scope.id
    | some _ => scopeHasOneEntry program scope.id

/-- Ordinary graph lifecycle: every non-root scope has one entry and one completion strategy. -/
def ordinaryScopeLifecycleWellFormed (program : Program)
    (entryRootId : DefinitionScopeId) : Bool :=
  program.definitionScopes.all (ordinaryScopeLifecycleValid program entryRootId)

def programEntryRootScopeId? (program : Program) : Option DefinitionScopeId :=
  match program.definitionScopes.filter fun scope =>
      scope.parentScopeId.isNone &&
        scope.originElementId.value = program.processId.value with
  | [scope] => some scope.id
  | _ => none

private def entryRootIsOnlyParentlessScope (program : Program)
    (entryRootId : DefinitionScopeId) : Bool :=
  match program.definitionScopes.filter fun scope => scope.parentScopeId.isNone with
  | [scope] => scope.id == entryRootId
  | _ => false

private def uniqueScope? (program : Program) (scopeId : DefinitionScopeId) :
    Option DefinitionScope :=
  match program.definitionScopes.filter fun scope => scope.id == scopeId with
  | [scope] => some scope
  | _ => none

def compensationEventSubProcessSnapshotTargetBefore
    (left right : CompensationEventSubProcessSnapshotTarget) : Bool :=
  if left.parentScopeId.value = right.parentScopeId.value then
    decide (left.handlerScopeId.value < right.handlerScopeId.value)
  else decide (left.parentScopeId.value < right.parentScopeId.value)

private def targetsStrictlyOrdered :
    List CompensationEventSubProcessSnapshotTarget → Bool
  | [] | [_] => true
  | left :: right :: rest =>
      compensationEventSubProcessSnapshotTargetBefore left right &&
        targetsStrictlyOrdered (right :: rest)

private def targetIdentityValid
    (target : CompensationEventSubProcessSnapshotTarget) : Bool :=
  !target.parentScopeId.value.isEmpty &&
    !target.handlerScopeId.value.isEmpty &&
    target.parentScopeId != target.handlerScopeId

private def targetParentUnique
    (targets : List CompensationEventSubProcessSnapshotTarget)
    (target : CompensationEventSubProcessSnapshotTarget) : Bool :=
  (targets.filter fun candidate =>
    candidate.parentScopeId == target.parentScopeId).length = 1

private def targetHandlerUnique
    (targets : List CompensationEventSubProcessSnapshotTarget)
    (target : CompensationEventSubProcessSnapshotTarget) : Bool :=
  (targets.filter fun candidate =>
    candidate.handlerScopeId == target.handlerScopeId).length = 1

private def targetScopesValid (program : Program) (entryRootId : DefinitionScopeId)
    (target : CompensationEventSubProcessSnapshotTarget) : Bool :=
  match uniqueScope? program target.parentScopeId,
      uniqueScope? program target.handlerScopeId with
  | some parent, some handler =>
      (parent.id == entryRootId || parent.parentScopeId == some entryRootId) &&
        handler.parentScopeId == some parent.id &&
        !(program.operationScopes.any fun ownership =>
          ownership.scopeId == handler.id) &&
        !(program.controlPlaceScopes.any fun ownership =>
          ownership.scopeId == handler.id) &&
        !(program.operations.any fun operation =>
          enteredChildScopeId? operation = some handler.id) &&
        !(program.operations.any (completesScope handler.id)) &&
        (parent.id == entryRootId || scopeHasOneEntry program parent.id)
  | _, _ => false

/-- Exact validity of the hidden Program declaration, including declaration-derived dormant-handler facts. -/
def compensationEventSubProcessSnapshotDeclarationValid (program : Program) : Bool :=
  match program.compensationEventSubProcessSnapshots with
  | none => true
  | some declaration =>
      match programEntryRootScopeId? program with
      | none => false
      | some entryRootId =>
          entryRootIsOnlyParentlessScope program entryRootId &&
            !declaration.targets.isEmpty &&
            declaration.targets.all targetIdentityValid &&
            declaration.targets.all (targetParentUnique declaration.targets) &&
            declaration.targets.all (targetHandlerUnique declaration.targets) &&
            targetsStrictlyOrdered declaration.targets &&
            declaration.maxRecords > 0 && safeNat declaration.maxRecords &&
            declaration.maxCanonicalBytes ≥ 2 &&
            declaration.maxCanonicalBytes ≤ 65536 &&
            safeNat declaration.maxCanonicalBytes &&
            declaration.targets.all (targetScopesValid program entryRootId)

private def declaredHandlerScopeIds (program : Program) : List DefinitionScopeId :=
  match program.compensationEventSubProcessSnapshots with
  | none => []
  | some declaration => declaration.targets.map (fun target => target.handlerScopeId)

private def declaredScopeLifecycleValid (program : Program)
    (entryRootId : DefinitionScopeId) (handlerScopeIds : List DefinitionScopeId)
    (scope : DefinitionScope) : Bool :=
  if handlerScopeIds.contains scope.id then
    scope.parentScopeId.isSome &&
      (program.operations.filter (completesScope scope.id)).isEmpty &&
      (program.operations.filter fun operation =>
        enteredChildScopeId? operation = some scope.id).isEmpty
  else ordinaryScopeLifecycleValid program entryRootId scope

/-- Program-aware lifecycle admission derives exactly the valid declaration's handler scopes; callers cannot supply exemptions. -/
def compensationEventSubProcessSnapshotScopeLifecycleWellFormed
    (program : Program) (entryRootId : DefinitionScopeId) : Bool :=
  compensationEventSubProcessSnapshotDeclarationValid program &&
    program.definitionScopes.all
      (declaredScopeLifecycleValid program entryRootId
        (declaredHandlerScopeIds program))

end BpmnSemantics.SemanticProcess
