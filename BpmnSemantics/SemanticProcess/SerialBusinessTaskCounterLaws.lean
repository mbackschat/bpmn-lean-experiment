module

public import BpmnSemantics.SemanticProcess.WaitActivation
public import BpmnSemantics.SemanticProcess.RuntimeStateCollectionCounterLaws

/-! Serial task issuance retains canonical counter storage and high-water marks. These laws are
shared by the serial chain and mixed-task graph reachability frames. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.SerialBusinessTask

/-- These issuance facts are exactly the retained counter/order checks read by serial command admission. -/
def IssuanceFrame (state : RuntimeState) : Prop :=
  orderedBy activationBefore state.activations = true ∧
  orderedBy effectActivationBefore state.effectActivations = true ∧
  orderedBy scopeActivationBefore state.scopeActivations = true ∧
  state.waits.all (fun wait => decide (wait.activation ≤ activationCount state wait.task.id)) = true ∧
  (state.activations.map (·.taskId)).Nodup ∧
  (state.effectActivations.map (·.elementId)).Nodup ∧
  (state.scopeActivations.map (·.scopeId)).Nodup

theorem user_activation_issuance (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId) (task : UserTaskDefinition)
    (issued : IssuanceFrame state) (empty : state.waits = []) :
    IssuanceFrame (activateUserTask state instanceId owner input output task) := by
  have storage := task_counter_storage state.activations task.id (activationCount state task.id + 1)
    issued.1 issued.2.2.2.2.1
  simp only [activationCount, setActivationCount, insertTaskActivation_eq_canonicalInsertBy,
    ne_eq, decide_not] at storage
  have count := activationCount_setActivationCount_self state task.id (activationCount state task.id + 1)
  change taskActivationCount (setActivationCount state.activations task.id (activationCount state task.id + 1)) task.id = _ at count
  simpa [IssuanceFrame, activateUserTask, empty, insertUserTaskWait, activationCount,
    setActivationCount, insertTaskActivation_eq_canonicalInsertBy] using
    And.intro storage.1 (And.intro issued.2.1 (And.intro issued.2.2.1 (And.intro (show
      (activationCount state task.id + 1 ≤ taskActivationCount
        (setActivationCount state.activations task.id (activationCount state task.id + 1)) task.id) from by rw [count]; exact Nat.le_refl _)
        ⟨storage.2, issued.2.2.2.2.2.1, issued.2.2.2.2.2.2⟩)))

theorem effect_activation_issuance (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId) (effect : EffectDefinition)
    (issued : IssuanceFrame state) :
    IssuanceFrame (activateEffect state instanceId owner input output effect none) := by
  have storage := effect_counter_storage state.effectActivations effect.elementId
    (effectActivationCount state effect.elementId + 1) issued.2.1 issued.2.2.2.2.2.1
  exact ⟨issued.1, storage.1, issued.2.2.1, issued.2.2.2.1,
    issued.2.2.2.2.1, storage.2, issued.2.2.2.2.2.2⟩


end BpmnSemantics.SemanticProcess.SerialBusinessTask
