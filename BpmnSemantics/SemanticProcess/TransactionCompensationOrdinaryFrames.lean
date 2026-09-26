import BpmnSemantics.SemanticProcess.TransactionCompensationProvenance
import BpmnSemantics.SemanticProcess.TransactionCompensationTokenPreservation
import BpmnSemantics.SemanticProcess.WaitActivation

/-! Ordinary wait changes preserve Compensation execution when exact owner separation
and retained identity provenance follow from the predecessor state. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Ordinary work preserves active child cancellation by preserving its quiet owner and issued provenance. -/
theorem compensationExecutionStateValid_running_ordinary
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId)
    (running : before.control = .running instanceId)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (triggers : after.compensationTriggers = before.compensationTriggers)
    (handlers : after.compensationHandlerEffectWaits = before.compensationHandlerEffectWaits)
    (effects : after.effectWaits = before.effectWaits)
    (incidents : after.effectIncidents = before.effectIncidents)
    (valid : compensationExecutionStateValid program before = true)
    (provenance : ∀ trigger ∈ before.compensationTriggers,
      transactionTriggerProvenanceValid before trigger = true →
        transactionTriggerProvenanceValid after trigger = true)
    (quiet : ∀ trigger ∈ before.compensationTriggers,
      scopeQuiescent { before with compensationTriggers :=
        before.compensationTriggers.filter (fun candidate => candidate.id != trigger.id) }
        trigger.owner = true →
      scopeQuiescent { after with compensationTriggers :=
        after.compensationTriggers.filter (fun candidate => candidate.id != trigger.id) }
        trigger.owner = true) :
    compensationExecutionStateValid program after = true := by
  apply compensationExecutionStateValid_running_of_matches program before after instanceId running
    control triggers handlers effects incidents valid
  intro declaration present trigger member
  have lifecyclePreserved (transaction : Bool)
      (prior : triggerLifecycleValid transaction before trigger = true) :
      triggerLifecycleValid transaction after trigger = true := by
    cases transaction with
    | false => simpa [triggerLifecycleValid, control, scopes] using prior
    | true =>
        have issued : transactionTriggerProvenanceValid before trigger = true :=
          (Bool.and_eq_true_iff.mp prior).1
        have issuedAfter := provenance trigger member issued
        cases lifecycle : trigger.lifecycle with
        | succeeded | failed =>
            simpa only [triggerLifecycleValid, lifecycle, control, scopes, issued, issuedAfter] using prior
        | active =>
            have live : transactionTriggerOwnerLive before trigger = true := by
              simp only [triggerLifecycleValid, lifecycle, Bool.not_true, Bool.false_or,
                Bool.and_eq_true, ite_true] at prior
              exact prior.2.1.1.2
            have liveAfter : transactionTriggerOwnerLive after trigger = true := by
              unfold transactionTriggerOwnerLive at live ⊢
              rw [scopes]
              split at live
              · exact Bool.and_eq_true_iff.mpr
                  ⟨(Bool.and_eq_true_iff.mp live).1, by
                    simpa only [scopes] using quiet trigger member (Bool.and_eq_true_iff.mp live).2⟩
              · contradiction
            simpa only [triggerLifecycleValid, lifecycle, control, scopes, issued, issuedAfter,
              live, liveAfter] using prior
  have matching := compensationExecutionStateValid_trigger program before declaration present valid trigger member
  unfold triggerMatchesDeclaration at matching ⊢
  split at matching
  · have lifecycle := (Bool.and_eq_true_iff.mp matching).2
    have preserved := lifecyclePreserved false lifecycle
    simpa only [Bool.and_eq_true, lifecycle, preserved, and_true] using matching
  · have lifecycle := (Bool.and_eq_true_iff.mp matching).2
    have preserved := lifecyclePreserved true lifecycle
    simpa only [Bool.and_eq_true, lifecycle, preserved, and_true] using matching
  · contradiction

private theorem any_canonicalInsertBy_rejected (order : α → α → Bool) (test : α → Bool)
    (inserted : α) (values : List α) (absent : test inserted = false) :
    (canonicalInsertBy order inserted values).any test = values.any test := by
  induction values with
  | nil => simp [canonicalInsertBy, absent]
  | cons first rest ih =>
      simp only [canonicalInsertBy]
      split <;> simp [absent, ih]

/-- The actual selected input prevents ordinary activation in an owner already pinned for cancellation. -/
theorem compensationExecutionStateValid_activateUserTask (program : Program) (state : RuntimeState)
    (hosting instanceId : SemanticId) (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (task : UserTaskDefinition) (running : state.control = .running hosting)
    (selected : onlyTokenOwner? state input = some owner)
    (valid : compensationExecutionStateValid program state = true) :
    compensationExecutionStateValid program
      (activateUserTask state instanceId owner input output task) = true := by
  have inputMember : ({ placeId := input, owner } : ControlToken) ∈ state.tokens := by
    have member : owner ∈ tokenOwners state input := by
      unfold onlyTokenOwner? at selected
      split at selected <;> simp_all
    obtain ⟨token, filtered, ownerEq⟩ := List.mem_map.mp member
    obtain ⟨present, placeEq⟩ := List.mem_filter.mp filtered
    have same : token = { placeId := input, owner } := by cases token; simp_all
    exact same ▸ present
  apply compensationExecutionStateValid_running_ordinary program state
    (activateUserTask state instanceId owner input output task) hosting running
    rfl rfl rfl rfl rfl rfl valid
  · intro trigger member prior
    simpa only [activateUserTask, transactionTriggerProvenanceValid] using
      transactionTriggerProvenanceValid_setActivationCount state task.id
        (activationCount state task.id + 1) (by omega) trigger prior
  · intro trigger member quiet
    have absent : (state.tokens.any fun token => token.owner == trigger.owner) = false := by
      simp only [scopeQuiescent, Bool.and_eq_true, Bool.not_eq_true'] at quiet
      exact quiet.1.1.1.1.1.1.1.1.1.1
    have separate : owner ≠ trigger.owner := by
      intro same
      have refused := List.any_eq_false.mp absent { placeId := input, owner } inputMember
      simp [same] at refused
    have removed : ((removeToken state.tokens input owner).any
        fun token => token.owner == trigger.owner) = false := by
      apply List.any_eq_false.mpr
      intro token member
      exact List.any_eq_false.mp absent token ((removeToken_sublist _ _ _).subset member)
    simp only [activateUserTask, scopeQuiescent, insertUserTaskWait_eq_canonicalInsertBy]
    rw [any_canonicalInsertBy_rejected _ _ _ _ (by simp [separate])]
    simpa only [scopeQuiescent, removed, absent] using quiet

/-- An attached Message wait shares an already-live Task owner, which cannot be an active Cancel owner. -/
theorem compensationExecutionStateValid_attachMessage (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (wait : MessageWait) (task : UserTaskWait)
    (running : state.control = .running instanceId)
    (taskMember : task ∈ state.waits) (owned : wait.owner = task.owner)
    (valid : compensationExecutionStateValid program state = true) :
    compensationExecutionStateValid program
      { state with messageWaits := insertMessageWait wait state.messageWaits } = true := by
  apply compensationExecutionStateValid_running_ordinary program state
    { state with messageWaits := insertMessageWait wait state.messageWaits } instanceId running
    rfl rfl rfl rfl rfl rfl valid
  · intro trigger member prior
    exact prior
  · intro trigger member quiet
    have separate : wait.owner ≠ trigger.owner := by
      intro same
      have present : (state.waits.any fun candidate => candidate.owner == trigger.owner) = true :=
        List.any_eq_true.mpr ⟨task, taskMember, by simp [← owned, same]⟩
      simp [scopeQuiescent, present] at quiet
    simp only [scopeQuiescent, insertMessageWait]
    rw [any_canonicalInsertBy_rejected _ _ _ _ (by simp [separate])]
    exact quiet

/-- An attached Timer wait shares the same live Task-owner separation as a Message wait. -/
theorem compensationExecutionStateValid_attachTimer (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (wait : TimerWait) (task : UserTaskWait)
    (running : state.control = .running instanceId)
    (taskMember : task ∈ state.waits) (owned : wait.owner = task.owner)
    (valid : compensationExecutionStateValid program state = true) :
    compensationExecutionStateValid program
      { state with timerWaits := insertTimerWait wait state.timerWaits } = true := by
  apply compensationExecutionStateValid_running_ordinary program state
    { state with timerWaits := insertTimerWait wait state.timerWaits } instanceId running
    rfl rfl rfl rfl rfl rfl valid
  · intro trigger member prior
    exact prior
  · intro trigger member quiet
    have separate : wait.owner ≠ trigger.owner := by
      intro same
      have present : (state.waits.any fun candidate => candidate.owner == trigger.owner) = true :=
        List.any_eq_true.mpr ⟨task, taskMember, by simp [← owned, same]⟩
      simp [scopeQuiescent, present] at quiet
    simp only [scopeQuiescent, insertTimerWait]
    rw [any_canonicalInsertBy_rejected _ _ _ _ (by simp [separate])]
    exact quiet

end BpmnSemantics.SemanticProcess
