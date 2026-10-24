module

public import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Actual parallel body wait-declaration preservation

RSI-BIND-04 follows actual operation resolution and the admitted family declarer
census. This preserves hosting-instance provenance without assuming reserved
preparation or claiming that foreign-instance waits belong to this Program.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

private theorem human_declared (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (wellFormed : programWellFormed program = true)
    (resolved : resolveInternalOperationOccurrence? program state candidate =
      some (.awaitUserTask id origin input output task)) :
    declaredByExactlyOneOwnedOperation program (userTaskWaitDeclarers program task.id) candidate.owner = true := by
  have member := (resolveInternalOperationOccurrence_declaration program state candidate _ resolved).1
  have onlyDeclarer := programWellFormed_waitDeclarer program (.awaitUserTask id origin input output task)
    (userTaskWaitDeclarationKey task.id) wellFormed member (by
      simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])
  have owned := resolved_definition_owner program state candidate _ resolved
  rw [userTaskWaitDeclarers_eq_keyFilter, onlyDeclarer]
  simp [declaredByExactlyOneOwnedOperation, owned]

private theorem effect_declared (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (wellFormed : programWellFormed program = true)
    (resolved : resolveInternalOperationOccurrence? program state candidate =
      some (.awaitEffect id origin input output effect route)) :
    declaredByExactlyOneOwnedOperation program (effectWaitDeclarers program effect.elementId) candidate.owner = true := by
  have member := (resolveInternalOperationOccurrence_declaration program state candidate _ resolved).1
  have aligned := programWellFormed_awaitEffect_elements_align program wellFormed id origin input output effect route member
  have onlyDeclarer := programWellFormed_waitDeclarer program (.awaitEffect id origin input output effect route)
    (effectWaitDeclarationKey effect.elementId) wellFormed member (by
      simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, aligned])
  have owned := resolved_definition_owner program state candidate _ resolved
  rw [effectWaitDeclarers_eq_keyFilter, onlyDeclarer]
  simp [declaredByExactlyOneOwnedOperation, owned]

private theorem activateHuman_wait_declarations (program : Program) (hosting : SemanticId)
    (before : RuntimeState) (owner : ScopeOccurrenceId) (input output : ControlPlaceId) (task : UserTaskDefinition)
    (valid : waitDeclarationsValid program hosting before = true)
    (declared : declaredByExactlyOneOwnedOperation program (userTaskWaitDeclarers program task.id) owner = true) :
    waitDeclarationsValid program hosting
      (activateUserTask before owner.processInstanceId owner input output task) = true := by
  simpa [activateUserTask, waitDeclarationsValid, List.all_filter, all_insertUserTaskWait, declared] using valid

private theorem activateService_wait_declarations (program : Program) (hosting : SemanticId)
    (before : RuntimeState) (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute) (arguments : List VariableBinding)
    (valid : waitDeclarationsValid program hosting before = true)
    (declared : declaredByExactlyOneOwnedOperation program (effectWaitDeclarers program effect.elementId) owner = true) :
    waitDeclarationsValid program hosting
      (activateEffect before owner.processInstanceId owner input output effect route arguments) = true := by
  simpa [activateEffect, waitDeclarationsValid, List.all_filter, insertEffectWait, all_canonicalInsertBy, declared] using valid

private theorem successful_guard_tail {α : Type} (guard : Bool) (tail : Option α) (value : α)
    (successful : (if guard then none else tail) = some value) : tail = some value := by
  cases guard <;> simp_all

/-- Actual successful PMIS body execution preserves the canonical hosting-instance wait declarations, independently of reservation preparation. -/
theorem applyInternalOperationOccurrence_body_wait_declarations
    (program : Program) (hosting : SemanticId) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (wellFormed : programWellFormed program = true)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (valid : waitDeclarationsValid program hosting before = true)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    waitDeclarationsValid program hosting after = true := by
  have running : ∃ instanceId, before.control = .running instanceId := by
    cases control : before.control with
    | running instanceId => exact ⟨instanceId, rfl⟩
    | _ => simp [applyInternalOperationOccurrence?, control] at applied
  obtain ⟨instanceId, running⟩ := running
  cases operation <;> simp [SemanticOperation.kind] at body
  all_goals simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    have declared := human_declared program before candidate id origin input output task wellFormed resolved
    have applied := successful_guard_tail _ _ after applied
    cases parallel : hasParallelScopeDefinition program candidate.owner with
    | false =>
        simp only [parallel] at applied
        cases Option.some.inj applied
        exact activateHuman_wait_declarations program hosting before candidate.owner input output task valid declared
    | true =>
        simp only [parallel, ↓reduceIte] at applied
        obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
        cases Option.some.inj applied
        exact activateHuman_wait_declarations program hosting before candidate.owner input output task valid declared
  case awaitEffect id origin input output effect route =>
    have declared := effect_declared program before candidate id origin input output effect route wellFormed resolved
    have applied := successful_guard_tail _ _ after applied
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, ↓reduceIte] at applied
    all_goals
      obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact activateService_wait_declarations program hosting before candidate.owner input output effect route arguments valid declared
  case duplicate =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact valid
  case synchronize =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact valid
  case reachNoneEnd =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact valid

end BpmnSemantics.SemanticProcess.InternalCommutation
