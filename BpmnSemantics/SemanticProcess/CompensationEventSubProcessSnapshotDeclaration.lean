module

public import BpmnSemantics.SemanticProcess.JsonSupport
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessProgramAdmission
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessAdmission
public import BpmnSemantics.WireNatural

/-! # Compensation Event Sub-Process snapshot declaration

Program-only validation for the optional hidden snapshot declaration and its narrow dormant-handler scope lifecycle. Runtime snapshots remain outside this module so graph admission depends only on immutable Program data.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def safeNat (value : Nat) : Bool :=
  BpmnSemantics.SemanticProcessJson.isSafeWireNat value

def operationScope? (program : Program) (operationId : OperationId) :
    Option DefinitionScopeId :=
  (program.operationScopes.find? fun ownership =>
    decide (ownership.operationId = operationId)).map (·.scopeId)

/-- The child definition scope entered by each scope-entering operation family. The exhaustive match makes a newly added family fail compilation until its lifecycle role is classified. -/
def enteredChildScopeId? : SemanticOperation → Option DefinitionScopeId
  | .enterSequentialMultiInstanceScope _ _ _ _ childScopeId _ _ _ _ _
  | .enterParallelMultiInstanceScope _ _ _ _ childScopeId _ _ _ _ _
  | .enterScope _ _ _ _ childScopeId
  | .enterBoundedScope _ _ _ _ childScopeId _
  | .enterMonitoredScope _ _ _ _ childScopeId _ => some childScopeId
  | .initiate .. | .initiateMessage .. | .initiateTimer .. | .invokeProcess .. | .returnProcess .. | .awaitUserTask ..
  | .awaitDataInputUserTask ..
  | .awaitDataInputOutputUserTask ..
  | .awaitDataOutputUserTask ..
  | .awaitSequentialMultiInstanceUserTask ..
  | .awaitParallelMultiInstanceUserTask ..
  | .completeSequentialMultiInstanceScope ..
  | .completeParallelMultiInstanceScope ..
  | .completeParallelMultiInstanceUserTask ..
  | .awaitTimer .. | .awaitMessage .. | .awaitPayloadMessage ..
  | .awaitCorrelatedPayloadMessage .. | .awaitEventRace ..
  | .awaitBoundedUserTask .. | .awaitMonitoredUserTask ..
  | .awaitMessageBoundedUserTask ..
  | .awaitMessageMonitoredUserTask ..
  | .awaitEffect .. | .duplicate ..
  | .synchronize .. | .mergeExclusive .. | .choose .. | .selectMany ..
  | .synchronizeSelected ..
  | .throwError .. | .reachNoneEnd .. | .terminateScope ..
  | .completeScope .. | .completeEventSubProcess .. | .triggerCompensation .. | .cancelTransaction .. => none

def completesScope (scopeId : DefinitionScopeId) : SemanticOperation → Bool
  | .completeScope _ _ completedScopeId _ => completedScopeId == scopeId
  | _ => false

def scopeHasOneEntry (program : Program) (scopeId : DefinitionScopeId) : Bool :=
  (program.operations.filter fun operation =>
    enteredChildScopeId? operation = some scopeId).length = 1

/-- SMIS-END-01 keeps the continuation on the entry; completion carries only its binding. -/
def sequentialScopeContinuation? (operations : List SemanticOperation)
    (entryId : OperationId) : Option ControlPlaceId :=
  operations.findSome? fun
    | .enterSequentialMultiInstanceScope id _ _ _ _ output _ _ _ _ =>
        if id == entryId then some output else none
    | _ => none

/-- Each repeated body has exactly one completion with the same source Activity and child owner. -/
def sequentialScopeOperationsPaired (program : Program) : Bool :=
  let entries := program.operations.filter fun
    | .enterSequentialMultiInstanceScope .. => true | _ => false
  let completions := program.operations.filter fun
    | .completeSequentialMultiInstanceScope .. => true | _ => false
  entries.length == completions.length && entries.all fun
    | .enterSequentialMultiInstanceScope id origin _ _ childScopeId _ _ _ _ _ =>
        (program.operations.all fun operation =>
          operation.origin.elementId != origin.elementId ||
          match operation with
          | .enterSequentialMultiInstanceScope entryId .. => entryId == id
          | .completeSequentialMultiInstanceScope _ _ entryId => entryId == id
          | _ => false) &&
        (completions.filter fun
          | .completeSequentialMultiInstanceScope completionId completionOrigin entryId =>
              entryId == id && completionOrigin == origin &&
                operationScope? program completionId == some childScopeId
          | _ => false).length == 1
    | _ => false

def hasRepeatedScopeEntry (program : Program) (scopeId : DefinitionScopeId) : Bool :=
  program.operations.any fun
    | .enterSequentialMultiInstanceScope _ _ _ _ childScopeId _ _ _ _ _
    | .enterParallelMultiInstanceScope _ _ _ _ childScopeId _ _ _ _ _ => childScopeId == scopeId
    | _ => false

def ordinaryScopeLifecycleValid (program : Program)
    (entryRootId : DefinitionScopeId) (scope : DefinitionScope) : Bool :=
  (if scope.parentScopeId.isSome && hasRepeatedScopeEntry program scope.id then
      (program.operations.filter (completesScope scope.id)).isEmpty &&
      (program.operations.filter fun
        | .completeSequentialMultiInstanceScope id _ _
        | .completeParallelMultiInstanceScope id _ _ => operationScope? program id == some scope.id
        | _ => false).length == 1 &&
      (program.operations.all fun
        | .returnProcess id _ _ _ _ _ => operationScope? program id != some scope.id
        | .completeEventSubProcess _ _ childScopeId => childScopeId != scope.id
        | _ => true)
  else match scope.parentScopeId with
  | none =>
      if scope.id = entryRootId then
        (program.operations.filter (completesScope scope.id)).length = 1 &&
          (program.operations.filter fun operation =>
            match operation with
            | .returnProcess id _ _ _ _ _ =>
                operationScope? program id = some scope.id
            | _ => false).isEmpty
      else
        -- One return per paired invocation, at least one per called root (CALLN-ADMIT-01).
        (program.operations.filter (completesScope scope.id)).isEmpty &&
          !(program.operations.filter fun operation =>
            match operation with
            | .returnProcess id _ _ _ _ _ =>
                operationScope? program id = some scope.id
            | _ => false).isEmpty
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

def entryRootIsOnlyParentlessScope (program : Program)
    (entryRootId : DefinitionScopeId) : Bool :=
  match program.definitionScopes.filter fun scope => scope.parentScopeId.isNone with
  | [scope] => scope.id == entryRootId
  | _ => false

def uniqueScope? (program : Program) (scopeId : DefinitionScopeId) :
    Option DefinitionScope :=
  match program.definitionScopes.filter fun scope => scope.id == scopeId with
  | [scope] => some scope
  | _ => none

def compensationEventSubProcessSnapshotTargetBefore
    (left right : CompensationEventSubProcessSnapshotTarget) : Bool :=
  if left.parentScopeId.value = right.parentScopeId.value then
    decide (left.handlerScopeId.value < right.handlerScopeId.value)
  else decide (left.parentScopeId.value < right.parentScopeId.value)

def targetsStrictlyOrdered :
    List CompensationEventSubProcessSnapshotTarget → Bool
  | [] | [_] => true
  | left :: right :: rest =>
      compensationEventSubProcessSnapshotTargetBefore left right &&
        targetsStrictlyOrdered (right :: rest)

def targetIdentityValid
    (target : CompensationEventSubProcessSnapshotTarget) : Bool :=
  !target.parentScopeId.value.isEmpty &&
    !target.handlerScopeId.value.isEmpty &&
    target.parentScopeId != target.handlerScopeId

def targetParentUnique
    (targets : List CompensationEventSubProcessSnapshotTarget)
    (target : CompensationEventSubProcessSnapshotTarget) : Bool :=
  (targets.filter fun candidate =>
    candidate.parentScopeId == target.parentScopeId).length = 1

def targetHandlerUnique
    (targets : List CompensationEventSubProcessSnapshotTarget)
    (target : CompensationEventSubProcessSnapshotTarget) : Bool :=
  (targets.filter fun candidate =>
    candidate.handlerScopeId == target.handlerScopeId).length = 1

def targetScopesValid (program : Program) (entryRootId : DefinitionScopeId)
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

def declaredHandlerScopeIds (program : Program) : List DefinitionScopeId :=
  match program.compensationEventSubProcessSnapshots with
  | none => []
  | some declaration => declaration.targets.map (fun target => target.handlerScopeId)

def declaredScopeLifecycleValid (program : Program)
    (entryRootId : DefinitionScopeId) (handlerScopeIds : List DefinitionScopeId)
    (scope : DefinitionScope) : Bool :=
  let messageHandler := program.interruptingMessageEventSubProcesses.any (fun declaration =>
    declaration.handlerScopeId == scope.id)
  if handlerScopeIds.contains scope.id || messageHandler then
    scope.parentScopeId.isSome &&
      (program.operations.filter (completesScope scope.id)).isEmpty &&
      (program.operations.filter fun operation =>
        enteredChildScopeId? operation = some scope.id).isEmpty &&
      (!messageHandler || (program.operations.filter fun
        | .completeEventSubProcess _ _ candidate => candidate == scope.id
        | _ => false).length == 1)
  else ordinaryScopeLifecycleValid program entryRootId scope

/-- Program-aware lifecycle admission derives exactly the valid declaration's handler scopes; callers cannot supply exemptions. -/
def compensationEventSubProcessSnapshotScopeLifecycleWellFormed
    (program : Program) (entryRootId : DefinitionScopeId) : Bool :=
  (compensationEventSubProcessSnapshotDeclarationValid program &&
    (program.interruptingMessageEventSubProcesses.isEmpty ||
      (program.identity.semanticProfile == interruptingMessageEventSubProcessProfileId &&
        interruptingMessageEventSubProcessProgramGraph program))) &&
    program.definitionScopes.all
      (declaredScopeLifecycleValid program entryRootId
        (declaredHandlerScopeIds program))

/-- A declared parentless scope with a Complete operation is the hosting entry scope. Called
roots require Return instead, and the snapshot handler exemption requires a child scope. -/
theorem scopeLifecycle_parentless_completion_is_entryRoot (program : Program)
    (entryRoot : DefinitionScopeId) (scope : DefinitionScope)
    (id : OperationId) (origin : BpmnElementOrigin) (output : Option ControlPlaceId)
    (valid : compensationEventSubProcessSnapshotScopeLifecycleWellFormed program entryRoot = true)
    (member : scope ∈ program.definitionScopes) (parentless : scope.parentScopeId = none)
    (completion : .completeScope id origin scope.id output ∈ program.operations) : scope.id = entryRoot := by
  simp only [compensationEventSubProcessSnapshotScopeLifecycleWellFormed, Bool.and_eq_true] at valid
  have lifecycle := List.all_eq_true.mp valid.2 scope member
  unfold declaredScopeLifecycleValid at lifecycle
  dsimp only at lifecycle
  split at lifecycle
  · simp [parentless] at lifecycle
  · unfold ordinaryScopeLifecycleValid at lifecycle
    simp only [parentless, Option.isSome_none, Bool.false_and, Bool.false_eq_true, ↓reduceIte, Bool.and_eq_true] at lifecycle
    by_cases same : scope.id = entryRoot
    · exact same
    · simp only [same, ↓reduceIte, Bool.and_eq_true, List.isEmpty_iff] at lifecycle
      have present : .completeScope id origin scope.id output ∈ program.operations.filter (completesScope scope.id) :=
        List.mem_filter.mpr ⟨completion, by simp [completesScope]⟩
      rw [lifecycle.1.1] at present
      contradiction

/-- SMIS-END-01 excludes ordinary completion from a repeated child definition. -/
theorem scopeLifecycle_completion_excludes_repeated_entry (program : Program)
    (entryRoot : DefinitionScopeId) (scope : DefinitionScope)
    (id : OperationId) (origin : BpmnElementOrigin) (output : Option ControlPlaceId)
    (entry : SemanticOperation)
    (valid : compensationEventSubProcessSnapshotScopeLifecycleWellFormed program entryRoot = true)
    (member : scope ∈ program.definitionScopes) (child : scope.parentScopeId.isSome = true)
    (completion : .completeScope id origin scope.id output ∈ program.operations)
    (entered : entry ∈ program.operations)
    (repeated : ∃ eid eorigin input body output collection item mappings condition,
      entry = .enterSequentialMultiInstanceScope eid eorigin input body scope.id output collection item mappings condition) : False := by
  have present : .completeScope id origin scope.id output ∈ program.operations.filter (completesScope scope.id) :=
    List.mem_filter.mpr ⟨completion, by simp [completesScope]⟩
  have lifecycle := List.all_eq_true.mp (Bool.and_eq_true_iff.mp valid).2 scope member
  have absent : (program.operations.filter (completesScope scope.id)).isEmpty = true := by
    unfold declaredScopeLifecycleValid at lifecycle
    dsimp only at lifecycle
    split at lifecycle
    · exact (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp lifecycle).1).1).2
    · obtain ⟨eid, eorigin, input, body, output, collection, item, mappings, condition, rfl⟩ := repeated
      have hasEntry : hasRepeatedScopeEntry program scope.id = true :=
        List.any_eq_true.mpr ⟨_, entered, by simp⟩
      simp only [ordinaryScopeLifecycleValid, child, hasEntry, Bool.true_and, ↓reduceIte, Bool.and_eq_true] at lifecycle
      exact lifecycle.1.1.1
  rw [List.isEmpty_iff.mp absent] at present
  contradiction

end BpmnSemantics.SemanticProcess
