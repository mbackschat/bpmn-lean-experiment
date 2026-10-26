module

public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import BpmnSemantics.SemanticProcess.InternalArmingOrder

/-! # Actual parallel body counter growth

PMIS-SELECT-01 needs headroom above counters retained across commands. Actual
Human and Service arms issue exactly the next native ordinal; token controls
increase only the End count, by at most one. These laws charge one internal
record without assuming reservation preparation or a predecessor counter bound.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

private theorem activateHuman_counter_growth (before : RuntimeState) (owner : ScopeOccurrenceId)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (human : TaskDefinitionId) (effect : NodeId) :
    activationCount (activateUserTask before owner.processInstanceId owner input output task) human ≤
        activationCount before human + 1 ∧
      effectActivationCount (activateUserTask before owner.processInstanceId owner input output task) effect ≤
        effectActivationCount before effect + 1 ∧
      (activateUserTask before owner.processInstanceId owner input output task).endOccurrences ≤ before.endOccurrences + 1 := by
  refine ⟨?_, Nat.le_succ _, Nat.le_succ _⟩
  change activationCount { before with
    activations := setActivationCount before.activations task.id (activationCount before task.id + 1) } human ≤ _
  by_cases same : human = task.id
  · subst human
    rw [activationCount_setActivationCount_self]
    exact Nat.le_refl _
  · rw [activationCount_setActivationCount_other _ _ _ _ same]
    exact Nat.le_succ _

private theorem activateService_counter_growth (before : RuntimeState) (owner : ScopeOccurrenceId)
    (input output : ControlPlaceId) (definition : EffectDefinition) (route : Option BpmnErrorRoute)
    (arguments : List VariableBinding) (human : TaskDefinitionId) (effect : NodeId) :
    activationCount (activateEffect before owner.processInstanceId owner input output definition route arguments) human ≤
        activationCount before human + 1 ∧
      effectActivationCount (activateEffect before owner.processInstanceId owner input output definition route arguments) effect ≤
        effectActivationCount before effect + 1 ∧
      (activateEffect before owner.processInstanceId owner input output definition route arguments).endOccurrences ≤ before.endOccurrences + 1 := by
  refine ⟨Nat.le_succ _, ?_, Nat.le_succ _⟩
  change effectActivationCount { before with
    effectActivations := setEffectActivationCount before.effectActivations definition.elementId (effectActivationCount before definition.elementId + 1) } effect ≤ _
  by_cases same : effect = definition.elementId
  · subst effect
    rw [effectActivationCount_set_self]
    exact Nat.le_refl _
  · rw [effectActivationCount_set_other _ _ _ _ same]
    exact Nat.le_succ _

private theorem successful_guard_tail {α : Type} (guard : Bool) (tail : Option α) (value : α)
    (successful : (if guard then none else tail) = some value) : tail = some value := by
  cases guard <;> simp_all

/-- Actual PMIS body execution charges at most one issuance or End occurrence per internal record, for every native counter query. -/
theorem applyInternalOperationOccurrence_body_counter_growth
    (program : Program) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (human : TaskDefinitionId) (effect : NodeId) :
    activationCount after human ≤ activationCount before human + 1 ∧
      effectActivationCount after effect ≤ effectActivationCount before effect + 1 ∧
      after.endOccurrences ≤ before.endOccurrences + 1 := by
  have running : ∃ instanceId, before.control = .running instanceId := by
    cases control : before.control with
    | running instanceId => exact ⟨instanceId, rfl⟩
    | _ => simp [applyInternalOperationOccurrence?, control] at applied
  obtain ⟨instanceId, running⟩ := running
  cases operation <;> simp [SemanticOperation.kind] at body
  all_goals simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    have applied := successful_guard_tail _ _ after applied
    cases parallel : hasParallelScopeDefinition program candidate.owner with
    | false =>
        simp only [parallel] at applied
        cases Option.some.inj applied
        exact activateHuman_counter_growth before candidate.owner input output task human effect
    | true =>
        simp only [parallel, ↓reduceIte] at applied
        obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
        cases Option.some.inj applied
        exact activateHuman_counter_growth before candidate.owner input output task human effect
  case awaitEffect id origin input output definition route =>
    have applied := successful_guard_tail _ _ after applied
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, ↓reduceIte] at applied
    all_goals
      obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact activateService_counter_growth before candidate.owner input output definition route arguments human effect
  case duplicate =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact ⟨Nat.le_succ _, Nat.le_succ _, Nat.le_succ _⟩
  case synchronize =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact ⟨Nat.le_succ _, Nat.le_succ _, Nat.le_succ _⟩
  case reachNoneEnd =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact ⟨Nat.le_succ _, Nat.le_succ _, Nat.le_refl _⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
