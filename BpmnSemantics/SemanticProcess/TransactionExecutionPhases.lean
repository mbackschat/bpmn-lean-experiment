import BpmnSemantics.SemanticProcess.TransactionEarlyPhases
import BpmnSemantics.SemanticProcess.TransactionPhaseFrames

/-! # Transaction execution-phase invariant

Exact initialization prefixes lead to the continuation invariant. Its live-scope, ownership and
inactive-family facts are derived locally; no constructor assumes a frontier bound or runtime validity.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics TransactionProgramRoles

structure TransactionContinuationInvariant {p : Program} (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) : Prop where
  continuation : TransactionContinuationState roles state
  scopes : ∃ leaf, TransactionScopeShape roles state leaf ∧
    TransactionTokensAtLeaf state leaf ∧ TransactionWaitsAtLeaf state leaf
  inert : TransactionInertCollections state
  live : TransactionLiveScopeControl state
  noninitial : state.control ≠ .notStarted

inductive TransactionExecutionPhase {p : Program} (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) : RuntimeState → Prop where
  | initial : TransactionExecutionPhase roles heads initialState
  | start (instanceId : SemanticId) (nonemptyId : nonempty instanceId.value = true) :
      TransactionExecutionPhase roles heads (transactionRootStartState roles instanceId [])
  | initiated (instanceId : SemanticId) (nonemptyId : nonempty instanceId.value = true) :
      TransactionExecutionPhase roles heads (transactionInitiatedState roles instanceId [])
  | entered (instanceId : SemanticId) (nonemptyId : nonempty instanceId.value = true) :
      TransactionExecutionPhase roles heads (transactionEnteredState roles instanceId [])
  | split (instanceId : SemanticId) (nonemptyId : nonempty instanceId.value = true) :
      TransactionExecutionPhase roles heads (transactionSplitState roles instanceId [])
  | one (instanceId : SemanticId) (nonemptyId : nonempty instanceId.value = true) (reverse : Bool) :
      TransactionExecutionPhase roles heads (transactionInitialArmingState roles heads instanceId [] reverse .one)
  | continuation (state : RuntimeState) (invariant : TransactionContinuationInvariant roles state) :
      TransactionExecutionPhase roles heads state

/-- The two actual Task arms establish every continuation component on the complete primitive state. -/
theorem transaction_both_arms_invariant (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (instanceId : SemanticId) (reverse : Bool) :
    TransactionContinuationInvariant roles
      (transactionInitialArmingState roles heads instanceId [] reverse .both) := by
  let state := transactionInitialArmingState roles heads instanceId [] reverse .both
  let parent : RuntimeScopeOccurrence :=
    { id := { processInstanceId := instanceId, definitionScopeId := roles.root.id, activation := 1 }, parent := none }
  let child : RuntimeScopeOccurrence :=
    { id := transactionChildOwner roles instanceId, parent := some parent.id }
  have scopes : state.scopeOccurrences = insertScopeOccurrence child [parent] := by cases reverse <;> rfl
  have perm : state.scopeOccurrences.Perm [parent, child] := by
    rw [scopes]
    simp only [insertScopeOccurrence, canonicalInsertBy]
    split
    · exact List.Perm.swap _ _ []
    · exact List.Perm.refl _
  have waits := transaction_initial_arming_both_waits p roles heads instanceId [] reverse
  refine ⟨transaction_both_arms_enter_continuation p roles heads instanceId [] reverse,
    ⟨some child, .nested parent child rfl rfl rfl rfl perm, ?_, ?_⟩, ?_, ?_, ?_⟩
  · intro token member
    simp [waits.1] at member
  · intro wait member
    have same := List.all_eq_true.mp waits.2.2.1 wait member
    change some wait.owner = some (transactionChildOwner roles instanceId)
    exact congrArg some (by simpa only [beq_iff_eq] using same)
  · cases reverse <;> exact ⟨rfl, rfl, rfl, rfl, rfl⟩
  · intro occurrence member
    have selected := perm.mem_iff.mp member
    simp only [List.mem_cons, List.not_mem_nil, or_false] at selected
    rcases selected with same | same
    all_goals subst occurrence; cases reverse <;> rfl
  · cases reverse <;> intro impossible <;> contradiction

/-- Refusal-free stability derives the empty-token command boundary from leaf ownership. -/
theorem transaction_stable_invariant_tokens_empty (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (invariant : TransactionContinuationInvariant roles state)
    (stable : (snapshotInternalTransitionFrontier p state).transitions = [])
    (noRefusal : (snapshotInternalTransitionFrontier p state).refusal = none) : state.tokens = [] := by
  by_cases empty : state.tokens = []
  · exact empty
  · obtain ⟨token, member⟩ := List.exists_mem_of_ne_nil _ empty
    obtain ⟨leaf, shape, owned, _⟩ := invariant.scopes
    have owner := owned token member
    cases shape with
    | empty scopes => contradiction
    | root parent selected parentless scopes =>
        exact transaction_stable_continuation_tokens_empty p roles state invariant.continuation
          parent.id.processInstanceId (invariant.live parent (by simp [scopes])) stable noRefusal
    | nested parent child root parentless selected attached scopes =>
        exact transaction_stable_continuation_tokens_empty p roles state invariant.continuation
          child.id.processInstanceId (invariant.live child (scopes.mem_iff.mpr (by simp))) stable noRefusal

/-- Ordinary retained Task completion preserves the complete continuation invariant. -/
theorem transaction_completed_task_invariant (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (invariant : TransactionContinuationInvariant roles before)
    (taskId : UserTaskInstanceId) (emptyTokens : before.tokens = [])
    (completed : completeOrdinaryUserTaskWithCompensation? completeUserTask p before taskId = some after) :
    TransactionContinuationInvariant roles after := by
  obtain ⟨leaf, shape, owned, waits⟩ := invariant.scopes
  have next := transaction_scope_task_completion p roles before after leaf shape waits taskId emptyTokens completed
  have frames := transaction_task_completion_phase_frames p before after invariant.inert invariant.live
    invariant.noninitial taskId completed
  exact ⟨transaction_continuation_task_completion p roles before after invariant.continuation taskId emptyTokens completed,
    ⟨leaf, next.1, next.2.1, next.2.2.1⟩, frames.1, frames.2.1, frames.2.2⟩

/-- Successful and failed handler completion retain the same continuation contract. -/
theorem transaction_completed_handler_invariant (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (before after : RuntimeState)
    (invariant : TransactionContinuationInvariant roles before) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) (emptyTokens : before.tokens = [])
    (step : CompensationHandlerCompletionStep p before effectId result after) :
    TransactionContinuationInvariant roles after := by
  obtain ⟨leaf, shape, owned, waits⟩ := invariant.scopes
  have next := transaction_scope_handler_completion p roles wellFormed before after leaf shape owned waits effectId result step
  have frames := transaction_handler_completion_phase_frames p before after invariant.inert invariant.live
    invariant.noninitial effectId result step
  exact ⟨transaction_continuation_handler_completion p roles before after invariant.continuation effectId result emptyTokens step,
    next, frames.1, frames.2.1, frames.2.2⟩

private theorem invariant_process_patch (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (invariant : TransactionContinuationInvariant roles state)
    (bindings : List VariableBinding) :
    TransactionContinuationInvariant roles
      { state with variables := { state.variables with process := { bindings } } } := by
  obtain ⟨leaf, shape, owned, waits⟩ := invariant.scopes
  exact ⟨⟨invariant.continuation.consumed, invariant.continuation.tokenBound,
    invariant.continuation.tokenPlaces, invariant.continuation.waitOutputs⟩,
    ⟨leaf, shape.of_scopes_eq rfl, owned, waits⟩, invariant.inert, invariant.live, invariant.noninitial⟩

private theorem admitted_task_invariant (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (before : RuntimeState)
    (invariant : TransactionContinuationInvariant roles before) (instanceId commandId : SemanticId)
    (taskId : UserTaskInstanceId) (submitted : List VariableBinding)
    (running : before.control = .running instanceId) (emptyTokens : before.tokens = []) :
    TransactionContinuationInvariant roles
      (admitStimulusWithCompensationSnapshots p before (.completeUserTaskInstance commandId taskId submitted)).state := by
  obtain ⟨parallel, sequential, messageMonitored, messageBounded, bounded, composed,
      dataInput, dataOutput, monitored⟩ := transaction_task_dispatch_selectors p graph ⟨taskId.elementId.value⟩
  simp only [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent]
  simp [running, invariant.inert.2.2.2.1, parallel, sequential, messageMonitored, messageBounded,
    bounded, composed, dataInput, dataOutput, monitored]
  cases completed : completeOrdinaryUserTaskWithCompensation? completeUserTask p before taskId with
  | none => dsimp only; exact invariant
  | some successor =>
      dsimp only
      have continued := transaction_completed_task_invariant p roles before successor invariant taskId emptyTokens completed
      split
      · exact invariant_process_patch p roles successor continued _
      · split <;> first | exact continued | exact invariant

private theorem admitted_handler_invariant (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (before : RuntimeState)
    (invariant : TransactionContinuationInvariant roles before) (instanceId commandId : SemanticId)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (running : before.control = .running instanceId) (emptyTokens : before.tokens = []) :
    TransactionContinuationInvariant roles
      (admitStimulusWithCompensationSnapshots p before (.completeEffect commandId effectId result)).state := by
  simp only [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent]
  simp [running, invariant.inert.2.2.2.1, invariant.inert.2.2.1]
  split
  · cases completed : attemptCompensationHandlerEffectCompletion p before effectId result with
    | refused reason => dsimp only; exact invariant
    | applied successor =>
        dsimp only
        have continued := transaction_completed_handler_invariant p roles wellFormed before successor invariant
          effectId result emptyTokens
          (attemptCompensationHandlerEffectCompletion_sound p before successor effectId result completed)
        split <;> first | exact continued | exact invariant
  · contradiction
  · exact invariant

/-- Admission from an established command boundary preserves the complete continuation invariant. -/
theorem transaction_continuation_admission_invariant (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (wellFormed : programWellFormed p = true)
    (before : RuntimeState) (invariant : TransactionContinuationInvariant roles before)
    (emptyTokens : before.tokens = []) (stimulus : Stimulus) :
    TransactionContinuationInvariant roles (admitStimulusWithCompensationSnapshots p before stimulus).state := by
  cases stimulus
  case startProcess commandId processId instanceId submitted =>
    have started := invariant.noninitial
    cases control : before.control <;>
      simp_all [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent, invariant.inert.2.2.2.1]
  case completeUserTaskInstance commandId taskId submitted =>
    cases control : before.control
    case running instanceId => exact admitted_task_invariant p roles graph before invariant instanceId commandId taskId submitted control emptyTokens
    all_goals simpa [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent, control, invariant.inert.2.2.2.1] using invariant
  case completeEffect commandId effectId result =>
    cases control : before.control
    case running instanceId => exact admitted_handler_invariant p roles wellFormed before invariant instanceId commandId effectId result control emptyTokens
    all_goals simpa [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent, control, invariant.inert.2.2.2.1] using invariant
  all_goals
    rw [transaction_other_admissions_preserve_state p roles graph roles.profileSelected before _
      invariant.inert.1 invariant.inert.2.1 invariant.inert.2.2.1 invariant.inert.2.2.2.1 trivial]
    exact invariant

/-- Every state-changing admission in this selected grammar reports a committed command. -/
theorem transaction_admission_commits_or_preserves_state (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (before : RuntimeState)
    (inert : TransactionInertCollections before) (stimulus : Stimulus) :
    (admitStimulusWithCompensationSnapshots p before stimulus).outcome = .committed ∨
      (admitStimulusWithCompensationSnapshots p before stimulus).state = before := by
  cases stimulus
  case startProcess commandId processId instanceId submitted =>
    cases control : before.control
    all_goals simp [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent, control, inert.2.2.2.1]
    repeat' first | exact Or.inl rfl | exact Or.inr rfl | split
  case completeUserTaskInstance commandId taskId submitted =>
    obtain ⟨parallel, sequential, messageMonitored, messageBounded, bounded, composed,
        dataInput, dataOutput, monitored⟩ := transaction_task_dispatch_selectors p graph ⟨taskId.elementId.value⟩
    cases control : before.control
    all_goals simp [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent, control,
      inert.2.2.2.1, parallel, sequential, messageMonitored, messageBounded, bounded, composed,
      dataInput, dataOutput, monitored]
    repeat' first | exact Or.inl rfl | exact Or.inr rfl | split
  case completeEffect commandId effectId result =>
    cases control : before.control
    all_goals simp [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent, control,
      inert.2.2.2.1, inert.2.2.1]
    repeat' first | exact Or.inl rfl | exact Or.inr rfl | contradiction | split
  all_goals
    exact Or.inr (transaction_other_admissions_preserve_state p roles graph roles.profileSelected before _
      inert.1 inert.2.1 inert.2.2.1 inert.2.2.2.1 trivial)

/-- Initial admission either preserves the exact empty state or creates the exact selected Start state. -/
theorem transaction_initial_admission_phase (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (wellFormed : programWellFormed p = true) (stimulus : Stimulus)
    (identity : TransactionStartIdentityAdmitted stimulus) :
    TransactionExecutionPhase roles heads (admitStimulusWithCompensationSnapshots p initialState stimulus).state := by
  cases stimulus
  case startProcess commandId processId instanceId submitted =>
    by_cases committed : (admitStimulusWithCompensationSnapshots p initialState
        (.startProcess commandId processId instanceId submitted)).outcome = .committed
    · rw [transaction_committed_start_empty_normal_form p roles wellFormed commandId processId instanceId submitted committed]
      exact .start instanceId identity
    · have same := (transaction_admission_commits_or_preserves_state p roles graph initialState
        ⟨rfl, rfl, rfl, rfl, rfl⟩ (.startProcess commandId processId instanceId submitted)).resolve_left committed
      rw [same]
      exact .initial
  case completeUserTaskInstance commandId taskId submitted =>
    simpa [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent, initialState] using
      (TransactionExecutionPhase.initial (roles := roles) (heads := heads))
  case completeEffect commandId effectId result =>
    simpa [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent, initialState] using
      (TransactionExecutionPhase.initial (roles := roles) (heads := heads))
  all_goals
    rw [transaction_other_admissions_preserve_state p roles graph roles.profileSelected initialState _
      rfl rfl rfl rfl trivial]
    exact .initial

/-- Early prefixes cannot be committed boundaries because their next actual operation is still offered. -/
theorem transaction_stable_phase_boundary (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles)
    (wellFormed : programWellFormed p = true) (state : RuntimeState)
    (phase : TransactionExecutionPhase roles heads state)
    (stable : (snapshotInternalTransitionFrontier p state).transitions = [])
    (noRefusal : (snapshotInternalTransitionFrontier p state).refusal = none) :
    state = initialState ∨ (TransactionContinuationInvariant roles state ∧ state.tokens = []) := by
  have impossible (operation : SemanticOperation) (after : RuntimeState) (member : operation ∈ p.operations)
      (applied : attemptInternalOperation p operation state = .applied { operation, successor := after }) : False := by
    have offered := (transaction_frontier_attempt_iff p state operation after).mpr ⟨member, applied⟩
    simp [stable] at offered
  cases phase with
  | initial => exact Or.inl rfl
  | start instanceId nonemptyId =>
      exact False.elim (impossible roles.start _ (unique_filter_facts _ _ _ roles.startSelected).1
        (transaction_start_operation_reaches_entry p roles instanceId []))
  | initiated instanceId nonemptyId =>
      exact False.elim (impossible roles.entry _ (soleConsumer_facts p _ _ roles.entrySelected).1
        (transaction_entry_operation_reaches_child p roles wellFormed instanceId []))
  | entered instanceId nonemptyId =>
      exact False.elim (impossible roles.split _ (soleConsumer_facts p _ _ roles.splitSelected).1
        (transaction_split_operation_reaches_two_children p roles instanceId []))
  | split instanceId nonemptyId =>
      have offered := (transaction_initial_frontier_contains_heads p roles heads instanceId []).1
      simp [stable] at offered
  | one instanceId nonemptyId reverse =>
      have consumers := transaction_initial_heads_consumers p roles heads
      have member : (if reverse then heads.left else heads.right).operation ∈ p.operations := by
        cases reverse
        · exact (soleConsumer_facts p _ _ consumers.2).1
        · exact (soleConsumer_facts p _ _ consumers.1).1
      exact False.elim (impossible _ _ member (transaction_initial_arming_actual_steps p roles heads instanceId [] reverse true))
  | continuation state invariant =>
      exact Or.inr ⟨invariant, transaction_stable_invariant_tokens_empty p roles state invariant stable noRefusal⟩

/-- Actual internal attempts preserve the complete continuation invariant. -/
theorem transaction_continuation_step_invariant (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (wellFormed : programWellFormed p = true)
    (before after : RuntimeState) (invariant : TransactionContinuationInvariant roles before)
    (operation : SemanticOperation) (member : operation ∈ p.operations)
    (applied : attemptInternalOperation p operation before = .applied { operation, successor := after }) :
    TransactionContinuationInvariant roles after := by
  obtain ⟨leaf, shape, owned, waits⟩ := invariant.scopes
  have disabled := transaction_continuation_excludes_entry_and_split p roles before invariant.continuation.tokenPlaces
  obtain ⟨nextLeaf, nextShape, nextTokens, nextWaits, nextInert, nextLive, nextStarted⟩ :=
    transaction_scope_frames_internal_step p roles graph wellFormed before after leaf shape owned waits
      invariant.inert invariant.live invariant.noninitial invariant.continuation.consumed disabled.1 disabled.2
      operation member applied
  exact ⟨transaction_continuation_internal_step p roles graph before after invariant.continuation leaf shape owned
    operation member applied, ⟨nextLeaf, nextShape, nextTokens, nextWaits⟩, nextInert, nextLive, nextStarted⟩

/-- Every actual offered successor stays in the exact early forms or the proved continuation invariant. -/
theorem transaction_execution_phase_step (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (wellFormed : programWellFormed p = true) (before after : RuntimeState)
    (phase : TransactionExecutionPhase roles heads before) (operation : SemanticOperation)
    (offered : (operation, after) ∈ (snapshotInternalTransitionFrontier p before).transitions) :
    TransactionExecutionPhase roles heads after := by
  cases phase with
  | initial =>
      rw [transaction_initial_frontier_empty p roles graph] at offered
      contradiction
  | start instanceId nonemptyId =>
      rw [(transaction_pending_only_start p roles graph instanceId operation after offered).2]
      exact .initiated instanceId nonemptyId
  | initiated instanceId nonemptyId =>
      rw [(transaction_initiated_only_entry p roles graph wellFormed instanceId operation after offered).2]
      exact .entered instanceId nonemptyId
  | entered instanceId nonemptyId =>
      rw [(transaction_entered_only_split p roles graph instanceId operation after offered).2]
      exact .split instanceId nonemptyId
  | split instanceId nonemptyId =>
      have choice := transaction_initial_frontier_only_heads p roles heads graph instanceId [] operation after offered
      have applied := ((transaction_frontier_attempt_iff p _ operation after).mp offered).2
      rcases choice with same | same
      · have actual := transaction_initial_arming_actual_steps p roles heads instanceId [] false false
        change attemptInternalOperation p heads.left.operation (transactionSplitState roles instanceId []) =
          .applied { operation := heads.left.operation, successor := transactionInitialArmingState roles heads instanceId [] false .one } at actual
        rw [same, actual] at applied
        have stateEq := congrArg AppliedInternalOperation.successor (InternalOperationAttempt.applied.inj applied)
        change transactionInitialArmingState roles heads instanceId [] false .one = after at stateEq
        rw [← stateEq]
        exact .one instanceId nonemptyId false
      · have actual := transaction_initial_arming_actual_steps p roles heads instanceId [] true false
        change attemptInternalOperation p heads.right.operation (transactionSplitState roles instanceId []) =
          .applied { operation := heads.right.operation, successor := transactionInitialArmingState roles heads instanceId [] true .one } at actual
        rw [same, actual] at applied
        have stateEq := congrArg AppliedInternalOperation.successor (InternalOperationAttempt.applied.inj applied)
        change transactionInitialArmingState roles heads instanceId [] true .one = after at stateEq
        rw [← stateEq]
        exact .one instanceId nonemptyId true
  | one instanceId nonemptyId reverse =>
      rw [(transaction_one_arm_only_other p roles heads graph instanceId reverse operation after offered).2]
      exact .continuation _ (transaction_both_arms_invariant p roles heads instanceId reverse)
  | continuation state invariant =>
      obtain ⟨member, applied⟩ := (transaction_frontier_attempt_iff p _ operation after).mp offered
      exact .continuation _ (transaction_continuation_step_invariant p roles graph wellFormed
        _ after invariant operation member applied)

/-- Actual command boundaries retain only the initial state or an empty-token continuation. -/
theorem transaction_reachable_boundary_invariant (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (wellFormed : programWellFormed p = true) (state : RuntimeState)
    (reachable : TransactionCommandBoundaryReachable p state) :
    state = initialState ∨ (TransactionContinuationInvariant roles state ∧ state.tokens = []) := by
  induction reachable with
  | initial => exact Or.inl rfl
  | command before closureLimit stimulus reachable identity ih =>
    have phase : TransactionExecutionPhase roles heads before := by
      rcases ih with same | continued
      · rw [same]; exact .initial
      · exact .continuation _ continued.1
    have inert : TransactionInertCollections before := by
      rcases ih with same | continued
      · rw [same]; exact ⟨rfl, rfl, rfl, rfl, rfl⟩
      · exact continued.1.inert
    have admitted : TransactionExecutionPhase roles heads
        (admitStimulusWithCompensationSnapshots p before stimulus).state := by
      rcases ih with same | continued
      · subst before
        exact transaction_initial_admission_phase p roles heads graph wellFormed stimulus identity
      · exact .continuation _ (transaction_continuation_admission_invariant p roles graph wellFormed before
          continued.1 continued.2 stimulus)
    have single : ∀ before operation after, TransactionExecutionPhase roles heads before →
        (snapshotInternalTransitionFrontier p before).refusal = none →
        (operation, after) ∈ (snapshotInternalTransitionFrontier p before).transitions →
        TransactionExecutionPhase roles heads after := by
      intro before operation after phase _ offered
      exact transaction_execution_phase_step p roles heads graph wellFormed before after phase operation offered
    have finalPhase := applyStimulusWithCompensationSnapshots_preserves_phase p roles.execution roles.executionPresent
      (TransactionExecutionPhase roles heads) before stimulus phase admitted single
      (fun before prepared result phase _ selected applied =>
        transaction_prepared_batch_preserves_phase p (stimulusCommandId stimulus)
          (TransactionExecutionPhase roles heads) single before phase prepared selected result applied) closureLimit
    rcases applyStimulusWithCompensationSnapshots_commits_or_preserves_state p roles.execution roles.executionPresent
        before stimulus closureLimit (transaction_admission_commits_or_preserves_state p roles graph before inert stimulus)
      with committed | same
    · have stable := applyStimulusWithCompensationSnapshots_committed_is_stable p roles.execution roles.executionPresent
        closureLimit before stimulus committed
      exact transaction_stable_phase_boundary p roles heads wellFormed _ finalPhase stable.1 stable.2
    · rw [same]; exact ih

/-- Every reachable command prefix obtains its phase from the actual evaluator and actual attempted steps. -/
theorem transaction_reachable_prefix_phase (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (wellFormed : programWellFormed p = true) (state : RuntimeState)
    (reachable : TransactionInternalPrefixReachable p state) : TransactionExecutionPhase roles heads state := by
  induction reachable with
  | admitted before stimulus reachable identity committed =>
      rcases transaction_reachable_boundary_invariant p roles heads graph wellFormed before reachable with same | continued
      · subst before
        exact transaction_initial_admission_phase p roles heads graph wellFormed stimulus identity
      · exact .continuation _ (transaction_continuation_admission_invariant p roles graph wellFormed before
          continued.1 continued.2 stimulus)
  | step before after operation reachable noRefusal offered ih =>
      exact transaction_execution_phase_step p roles heads graph wellFormed before after ih operation offered

end BpmnSemantics.SemanticProcess
