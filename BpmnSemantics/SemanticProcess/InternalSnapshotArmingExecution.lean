import BpmnSemantics.SemanticProcess.InternalSnapshotArmingBatch
import BpmnSemantics.SemanticProcess.InternalSnapshotArmingRefusalFrames

/-! Complete ordinary frontiers derive prefix refusal absence and canonical publication equality in the actual snapshot batch runner. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private def SnapshotRefusableDisabled (program : Program) (state : RuntimeState) :
    SemanticOperation → Prop
  | operation@(.enterScope _ _ input entry scope) =>
      program.compensationEventSubProcessSnapshots.isSome = true →
        attemptEnterScope program operation state input entry scope = .disabled operation
  | operation@(.enterBoundedScope _ origin input entry scope boundary) =>
      program.compensationEventSubProcessSnapshots.isSome = true →
        attemptEnterBoundedScope program operation state origin input entry scope boundary = .disabled operation
  | operation@(.completeScope _ _ scope output) =>
      program.compensationEventSubProcessSnapshots.isSome = true →
        attemptCompleteScope program operation state scope output = .disabled operation
  | operation@(.triggerCompensation ..) =>
      program.compensationExecution.isSome = true →
        attemptCompensationTrigger program operation state = .disabled state
  | _ => True

private theorem snapshot_refusable_disabled_frame (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (instanceId : SemanticId)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (selected : SnapshotPrepared program state prepared)
    (operation : SemanticOperation) (disabled : SnapshotRefusableDisabled program state operation) :
    SnapshotRefusableDisabled program (prepared.apply state) operation := by
  cases prepared with
  | data _ _ => contradiction
  | ordinary arm patch =>
    cases operation <;> try exact True.intro
    case enterScope id origin input entry scope =>
      exact fun declared => prepared_arm_attemptEnterScope_stays_disabled program state arm patch
        selected.1 _ input entry scope (disabled declared)
    case enterBoundedScope id origin input entry scope boundary =>
      exact fun declared => prepared_arm_attemptEnterBoundedScope_stays_disabled program state arm patch
        selected.1 _ origin input entry scope boundary (disabled declared)
    case completeScope id origin scope output =>
      exact fun declared => prepared_arm_attemptCompleteScope_stays_disabled program state arm patch
        instanceId stateValid selected.1 _ scope output (disabled declared)
    case triggerCompensation id origin scope input output =>
      exact fun declared => prepared_arm_compensationTrigger_stays_disabled program state arm patch
        selected.1 _ (disabled declared)

private def SnapshotNotRefused : InternalOperationAttempt → Prop
  | .refused _ _ => False
  | .disabled _ | .applied _ => True

private theorem snapshot_attempt_not_refused (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (disabled : SnapshotRefusableDisabled program state operation) :
    SnapshotNotRefused (attemptInternalOperation program operation state) := by
  cases execution : program.compensationExecution <;>
    cases snapshots : program.compensationEventSubProcessSnapshots <;> cases operation <;>
    simp only [SnapshotRefusableDisabled, execution, snapshots, Option.isSome_none,
      Option.isSome_some, Bool.false_eq_true, false_implies, forall_const] at disabled
  all_goals simp only [attemptInternalOperation, execution, snapshots]
  all_goals first
    | solve | simp only [disabled, SnapshotNotRefused]
    | split <;> trivial

private theorem snapshot_canonical_refusal_absent (attempts : List InternalOperationAttempt)
    (absent : ∀ attempt ∈ attempts, SnapshotNotRefused attempt) :
    canonicalInternalOperationRefusal? attempts = none := by
  unfold canonicalInternalOperationRefusal?
  apply List.findSome?_eq_none_iff.mpr
  intro attempt present
  have clean := absent attempt ((mem_sortBy _ _ _).mp present)
  cases attempt <;> simp_all [SnapshotNotRefused]

private theorem snapshot_frontier_refusal_absent (program : Program) (state : RuntimeState)
    (disabled : ∀ operation ∈ program.operations, SnapshotRefusableDisabled program state operation) :
    (snapshotInternalTransitionFrontier program state).refusal = none := by
  apply snapshot_canonical_refusal_absent
  intro attempt present
  obtain ⟨operation, member, rfl⟩ := List.mem_map.mp present
  exact snapshot_attempt_not_refused program state operation (disabled operation member)

private theorem snapshot_batch_erases_to_runner (program : Program)
    (instanceId commandId : SemanticId) (state : RuntimeState) (prepared : List PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome = true)
    (selected : SnapshotPreparedList program state prepared)
    (independent : prepared.Pairwise PreparedInternalArming.Independent)
    (disabled : ∀ operation ∈ program.operations, SnapshotRefusableDisabled program state operation)
    (final : RuntimeState) (publications : List AcceptedInternalPublicationPair)
    (ran : runPreparedSnapshotArmingBatch? program instanceId commandId state prepared =
      some (final, publications)) :
    fireSnapshotInternalBatch program commandId state prepared =
      .applied { state := final, publications := publications.map (·.pair) } := by
  induction prepared generalizing state final publications with
  | nil =>
      simp only [runPreparedSnapshotArmingBatch?, Option.some.injEq, Prod.mk.injEq] at ran
      obtain ⟨rfl, rfl⟩ := ran
      rfl
  | cons head tail ih =>
      have headSelected := selected head (by simp)
      have applied := snapshot_prepared_applies program state head instanceId stateValid headSelected
      simp only [runPreparedSnapshotArmingBatch?, applied, Option.bind_eq_bind, Option.bind_some] at ran
      obtain ⟨publication, accepted, ran⟩ := Option.bind_eq_some_iff.mp ran
      obtain ⟨⟨last, rest⟩, tailRan, ran⟩ := Option.bind_eq_some_iff.mp ran
      cases ran
      have pairAccepted : snapshotArmingPublicationForFootprint? program state (head.apply state)
          head.operation commandId head.footprint = some publication.pair := by
        unfold acceptedSnapshotArmingPublication? at accepted
        obtain ⟨pair, pairFound, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        obtain ⟨position, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        cases accepted
        exact pairFound
      have valid := snapshot_prepared_preserves program state head instanceId programValid
        stateValid openBefore headSelected
      have remaining := snapshot_prepared_tail program state head tail instanceId stateValid
        selected independent
      have stillDisabled := fun operation member => snapshot_refusable_disabled_frame program state
        head instanceId stateValid headSelected operation (disabled operation member)
      have tailResult := ih (head.apply state) valid.1 valid.2 remaining
        (List.pairwise_cons.mp independent).2 stillDisabled last rest tailRan
      simp [fireSnapshotInternalBatch, snapshot_frontier_refusal_absent program state disabled,
        applied, pairAccepted, tailResult]

private theorem snapshot_sort_eq (before : α → α → Bool) (values : List α) :
    SemanticProcess.sortBy before values = sortBy before values := by
  have insertion (inserted : α) (entries : List α) :
      insertBy before inserted entries = sortInsertBy before inserted entries := by
    induction entries with
    | nil => rfl
    | cons head tail ih =>
        simp only [insertBy, sortInsertBy]
        split <;> simp_all
  induction values with
  | nil => rfl
  | cons head tail ih => simp only [SemanticProcess.sortBy, sortBy, insertion, ih]

private theorem snapshot_applied_in_frontier (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (member : operation ∈ program.operations)
    (step : AppliedInternalOperation)
    (applied : attemptInternalOperation program operation state = .applied step) :
    (operation, step.successor) ∈ (snapshotInternalTransitionFrontier program state).transitions := by
  have same := attemptInternalOperation_operation_identity program operation state
  rw [applied] at same
  change step.operation = operation at same
  simp only [snapshotInternalTransitionFrontier, canonicalEnabledInternalTransitions, snapshot_sort_eq]
  apply (mem_sortBy _ _ _).mpr
  apply List.mem_filterMap.mpr
  refine ⟨.applied step, ?_, ?_⟩
  · apply (mem_sortBy _ _ _).mpr
    exact List.mem_map.mpr ⟨operation, member, applied⟩
  · simp only [same]

private theorem snapshot_frontier_not_refused (program : Program) (state : RuntimeState)
    (absent : (snapshotInternalTransitionFrontier program state).refusal = none)
    (operation : SemanticOperation) (member : operation ∈ program.operations) :
    SnapshotNotRefused (attemptInternalOperation program operation state) := by
  change canonicalInternalOperationRefusal? _ = none at absent
  unfold canonicalInternalOperationRefusal? at absent
  have absentEach := List.findSome?_eq_none_iff.mp absent
  have selected := absentEach (attemptInternalOperation program operation state)
    ((mem_sortBy _ _ _).mpr (List.mem_map.mpr ⟨operation, member, rfl⟩))
  cases attempted : attemptInternalOperation program operation state <;> simp_all [SnapshotNotRefused]

private theorem snapshot_unprepared_operation_disabled (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalArming)
    (selected : prepareSnapshotArmingBatch? program state
      ((snapshotInternalTransitionFrontier program state).transitions.map (·.1)) = some prepared)
    (absent : (snapshotInternalTransitionFrontier program state).refusal = none)
    (operation : SemanticOperation) (member : operation ∈ program.operations)
    (notOrdinary : prepareInternalArm? program state operation = none) :
    attemptInternalOperation program operation state = .disabled operation := by
  cases attempted : attemptInternalOperation program operation state with
  | refused returned reason =>
      have safe := snapshot_frontier_not_refused program state absent operation member
      simp [attempted, SnapshotNotRefused] at safe
  | disabled returned =>
      have same := attemptInternalOperation_operation_identity program operation state
      simpa only [attempted, InternalOperationAttempt.operation] using congrArg
        InternalOperationAttempt.disabled same
  | applied step =>
      have inFrontier := snapshot_applied_in_frontier program state operation member step attempted
      have sound := prepareSnapshotArmingBatch_sound program state _ prepared selected
      have inPrepared : operation ∈ prepared.map PreparedInternalArming.operation := by
        rw [sound.2.2.2.2]
        exact List.mem_map.mpr ⟨(operation, step.successor), inFrontier, rfl⟩
      obtain ⟨entry, entryMember, entryOperation⟩ := List.mem_map.mp inPrepared
      have raw := sound.2.2.1 entry entryMember
      cases entry with
      | data _ _ => contradiction
      | ordinary original patch =>
          change original = operation at entryOperation
          subst original
          have contradiction := raw.1
          rw [notOrdinary] at contradiction
          contradiction

private theorem compensation_trigger_disabled_returns_input (program : Program)
    (operation : SemanticOperation) (state returned : RuntimeState)
    (disabled : attemptCompensationTrigger program operation state = .disabled returned) :
    returned = state := by
  unfold attemptCompensationTrigger at disabled
  repeat' first | dsimp only at disabled | split at disabled | cases disabled | rfl

private theorem snapshot_initial_refusable_disabled (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalArming)
    (selected : prepareSnapshotArmingBatch? program state
      ((snapshotInternalTransitionFrontier program state).transitions.map (·.1)) = some prepared)
    (absent : (snapshotInternalTransitionFrontier program state).refusal = none) :
    ∀ operation ∈ program.operations, SnapshotRefusableDisabled program state operation := by
  intro operation member
  cases operation <;> try exact True.intro
  all_goals
    have disabled := snapshot_unprepared_operation_disabled program state prepared selected absent
      _ member (by simp [prepareInternalArm?, internalArmInput?, internalArmOrigin?])
  case enterScope id origin input entry scope =>
    intro declared
    cases execution : program.compensationExecution <;>
      cases snapshots : program.compensationEventSubProcessSnapshots <;>
      simp_all [attemptInternalOperation]
  case enterBoundedScope id origin input entry scope boundary =>
    intro declared
    cases execution : program.compensationExecution <;>
      cases snapshots : program.compensationEventSubProcessSnapshots <;>
      simp_all [attemptInternalOperation]
  case completeScope id origin scope output =>
    intro declared
    cases execution : program.compensationExecution <;>
      cases snapshots : program.compensationEventSubProcessSnapshots <;>
      simp_all [attemptInternalOperation]
  case triggerCompensation id origin scope input output =>
    intro declared
    cases execution : program.compensationExecution with
    | none => simp [execution] at declared
    | some declaration =>
      simp only [attemptInternalOperation, execution] at disabled
      cases attempted : attemptCompensationTrigger program
          (.triggerCompensation id origin scope input output) state with
      | applied successor => simp [attempted] at disabled
      | refused reason => simp [attempted] at disabled
      | disabled returned =>
          have same := compensation_trigger_disabled_returns_input program _ state returned attempted
          simp_all

/-- The actual refusal-aware runner inherits complete accepted-publication equality for any finite
permutation of a fully prepared ordinary frontier; prefix refusal absence is derived, not assumed. -/
theorem snapshot_frontier_runner_perm (program : Program) (state : RuntimeState)
    (instanceId commandId : SemanticId) (prepared reordered : List PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (selected : prepareSnapshotArmingBatch? program state
      ((snapshotInternalTransitionFrontier program state).transitions.map (·.1)) = some prepared)
    (absent : (snapshotInternalTransitionFrontier program state).refusal = none)
    (permutation : prepared.Perm reordered) :
    ∃ final leftPublications rightPublications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? program final).isSome = true ∧
      fireSnapshotInternalBatch program commandId state prepared =
        .applied { state := final, publications := leftPublications.map (·.pair) } ∧
      fireSnapshotInternalBatch program commandId state reordered =
        .applied { state := final, publications := rightPublications.map (·.pair) } ∧
      canonicalAcceptedInternalPublicationPairs leftPublications =
        canonicalAcceptedInternalPublicationPairs rightPublications := by
  have sound := prepareSnapshotArmingBatch_sound program state _ prepared selected
  have openBefore := sound.2.1
  have allSelected := sound.2.2.1
  have independent := sound.2.2.2.1
  have disabled := snapshot_initial_refusable_disabled program state prepared selected absent
  obtain ⟨final, leftPublications, rightPublications, valid, projected, leftRun, rightRun, same⟩ :=
    snapshot_prepared_batch_publication_perm program instanceId commandId state prepared reordered
      programValid stateValid openBefore allSelected independent permutation
  exact ⟨final, leftPublications, rightPublications, valid, projected,
    snapshot_batch_erases_to_runner program instanceId commandId state prepared programValid
      stateValid openBefore allSelected independent disabled final leftPublications leftRun,
    snapshot_batch_erases_to_runner program instanceId commandId state reordered programValid
      stateValid openBefore (fun entry present => allSelected entry (permutation.mem_iff.mpr present))
      (independent.perm permutation PreparedInternalArming.independent_symm) disabled
      final rightPublications rightRun, same⟩

theorem snapshot_frontier_runner_publication_perm (program : Program) (state : RuntimeState)
    (instanceId commandId : SemanticId) (prepared reordered : List PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (selected : prepareSnapshotArmingBatch? program state
      ((snapshotInternalTransitionFrontier program state).transitions.map (·.1)) = some prepared)
    (absent : (snapshotInternalTransitionFrontier program state).refusal = none)
    (permutation : prepared.Perm reordered) :
    ∃ final leftPublications rightPublications,
      fireSnapshotInternalBatch program commandId state prepared =
        .applied { state := final, publications := leftPublications } ∧
      fireSnapshotInternalBatch program commandId state reordered =
        .applied { state := final, publications := rightPublications } ∧
      canonicalPublicationPairs leftPublications = canonicalPublicationPairs rightPublications := by
  obtain ⟨final, left, right, _, _, leftRun, rightRun, same⟩ := snapshot_frontier_runner_perm
    program state instanceId commandId prepared reordered programValid stateValid selected absent permutation
  refine ⟨final, left.map (·.pair), right.map (·.pair), leftRun, rightRun, ?_⟩
  rw [← canonicalAcceptedInternalPublicationPairs_map_pair,
    ← canonicalAcceptedInternalPublicationPairs_map_pair, same]

end BpmnSemantics.SemanticProcess.InternalCommutation
