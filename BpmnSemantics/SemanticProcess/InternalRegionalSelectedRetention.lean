import BpmnSemantics.SemanticProcess.InternalRegionalSelection
import BpmnSemantics.SemanticProcess.InternalRegionalReferencePreservation
import BpmnSemantics.SemanticProcess.InternalRegionalLocalDataRetention

/-! # Ownership closure for selected regional operations

REG-OWN-CLOSE-01 derives reference masks from retained predecessor choices and compares them
with actual evaluator fields before deriving Activity and event-race reference preservation.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def regionalSelectionReferenceRetention (state : RuntimeState) (selected : InternalRegionalSelection) :
    RegionalReferenceRetention :=
  match selected.kind with
  | .returning record => callReferenceRetention state record
  | .completing .unbounded => ordinaryCompletionReferenceRetention selected.root
  | .completing (.bounded _ deadline) =>
      boundedCompletionReferenceRetention selected.root selected.root.id deadline
  | .interrupting _ => cancellationReferenceRetention state selected.root.id .remove
  | .terminating => cancellationReferenceRetention state selected.root.id .retain

/-- Terminate retains its exact root while Error removes it, even when their content masks agree. -/
theorem selectedCancellation_root_disposition (state : RuntimeState) (operation : SemanticOperation)
    (root : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId) :
    (regionalSelectionReferenceRetention state { operation, root, kind := .terminating }).scope root = true ∧
    (regionalSelectionReferenceRetention state { operation, root, kind := .interrupting parent }).scope root = false := by
  simp [regionalSelectionReferenceRetention, cancellationReferenceRetention, occurrenceInSubtree_reflexive]

theorem scope_identity_of_census (state : RuntimeState) (owner : ScopeOccurrenceId)
    (root : RuntimeScopeOccurrence)
    (census : state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) = [root]) :
    root.id = owner := by
  have present : root ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) := by
    rw [census]; simp
  exact of_decide_eq_true (List.mem_filter.mp present).2

/-- The selected masks agree with all six reference collections and retained local data. Timer uniqueness is
needed only to express bounded completion's one-record erasure as a retention filter. -/
theorem regionalSelection_retention_fields (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (identities : waitIdentitiesUnique before = true)
    (found : selectInternalRegional? program before operation = some selected)
    (result : fire? program operation before = some after) :
    regionalReferenceFieldsMatch before after (regionalSelectionReferenceRetention before selected) ∧
      after.variables.activities = before.variables.activities.filter
        (regionalSelectionLocalDataRetention before selected) := by
  obtain ⟨hosting, running⟩ := regionalSelection_running program before operation selected found
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  unfold fire? at result
  rw [snapshotAbsent] at result
  cases operation with
  | returnProcess id origin process definition output =>
      dsimp only at found
      change returnProcessState? before id origin process definition output = some after at result
      unfold returnProcessState? at result
      repeat' first | (solve | simp at found) | split at found
      all_goals
        cases found
        simp only [*, ↓reduceIte, Option.some.injEq] at result
        subst after
        exact ⟨⟨rfl, rfl, rfl, rfl, rfl, rfl⟩, rfl⟩
  | completeScope id origin definition output =>
      dsimp only at found
      change completeBoundedScope? program before definition output = some after at result
      have localFields := congrArg ScopedVariables.activities
        (regionalLocalData_completion_variables program before after definition output result)
      split at found
      · rename_i root census
        split at found
        · simp at found
        · simp only [Option.bind_eq_bind] at found
          obtain ⟨withdrawal, withdrawn, found⟩ := Option.bind_eq_some_iff.mp found
          have retained : selected =
              { operation := .completeScope id origin definition output
                root := root, kind := .completing withdrawal } := by
            repeat' first | (solve | simp at found) | split at found
            all_goals exact Option.some.inj found.symm
          rw [retained]
          cases withdrawal with
          | unbounded =>
              have absent := (completionWithdrawal_unbounded program before definition
                (completionWithdrawal_unbounded_facts program before definition withdrawn)).2
              simp only [completeBoundedScope?, absent] at result
              cases ordinary : completeScopeState? before definition output with
              | none => simp [ordinary] at result
              | some completed =>
                  simp only [ordinary, Option.some.injEq] at result
                  subst after
                  refine ⟨ordinaryCompletionReferenceRetention_matches_completion before completed definition output root census ordinary, ?_⟩
                  exact localFields.trans (List.filter_eq_self.mpr (by intros; rfl)).symm
          | bounded record deadline =>
              obtain ⟨declaration, child, parent, definitionFound, childFound, deadlineFound, _⟩ :=
                completionWithdrawal_raw_selection program before definition record deadline withdrawn
              have childIdentity : child = root.id := by
                simp only [boundedScopeChildOccurrence?, ← List.head?_filter, census] at childFound
                cases parentEq : root.parent <;> simp [parentEq] at childFound
                exact childFound.1.symm
              subst child
              refine ⟨boundedCompletionReferenceRetention_matches_completion program before after definition output root
                (definition, declaration) root.id parent deadline census definitionFound childFound deadlineFound identities result, ?_⟩
              exact localFields.trans (List.filter_eq_self.mpr (by intros; rfl)).symm
      · simp at found
  | throwError id origin input error handler =>
      dsimp only at found
      change throwErrorState? before input error handler = some after at result
      obtain ⟨owner, offered, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · simp at found
      · split at found
        · simp at found
        · rename_i matching
          split at found
          · rename_i root census
            obtain ⟨parent, parentEq, found⟩ := Option.bind_eq_some_iff.mp found
            split at found
            · cases found
              have rootIdentity := scope_identity_of_census before owner root census
              simp only [throwErrorState?, offered, runningInstance?, running, matching, census, parentEq,
                Option.bind_eq_bind, Option.bind_some, Bool.false_eq_true, ↓reduceIte] at result
              split at result
              · simp only [Option.some.injEq] at result
                subst after
                simp only [regionalSelectionReferenceRetention, regionalSelectionLocalDataRetention, rootIdentity]
                exact ⟨⟨rfl, rfl, rfl, rfl, rfl, rfl⟩, rfl⟩
              · simp at result
            · simp at found
          · simp at found
  | terminateScope id origin input definition =>
      dsimp only at found
      change terminateScopeState? program before id origin input definition = some after at result
      obtain ⟨owner, chosen, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · rename_i root census
        cases found
        have rootIdentity := scope_identity_of_census before owner root census
        simp only [terminateScopeState?, chosen, Option.some.injEq] at result
        subst after
        simp only [regionalSelectionReferenceRetention, regionalSelectionLocalDataRetention, rootIdentity]
        exact ⟨⟨rfl, rfl, rfl, rfl, rfl, rfl⟩, rfl⟩
      · simp at found
  | _ => contradiction

theorem regionalSelection_reference_fields (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (identities : waitIdentitiesUnique before = true)
    (found : selectInternalRegional? program before operation = some selected)
    (result : fire? program operation before = some after) :
    regionalReferenceFieldsMatch before after (regionalSelectionReferenceRetention before selected) :=
  (regionalSelection_retention_fields program before after operation selected snapshotAbsent identities found result).1

/-- This selection stage enforces REG-OWN-CLOSE-01 before footprints and publication are built. -/
def selectInternalOwnershipClosedRegional? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option InternalRegionalSelection := do
  let selected ← selectInternalRegional? program state operation
  if regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) &&
      regionalRetainedLocalDataClosed state (regionalSelectionReferenceRetention state selected).activity
        (regionalSelectionLocalDataRetention state selected) then
    some selected
  else none

theorem ownershipClosedSelection_refuses_stranded_reference (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state operation = some selected)
    (stranded : regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) = false) :
    selectInternalOwnershipClosedRegional? program state operation = none := by
  simp [selectInternalOwnershipClosedRegional?, found, stranded]

/-- Closed predecessors remain selectable; a blanket refusal does not satisfy ownership closure. -/
theorem ownershipClosedSelection_accepts_closed_references (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state operation = some selected)
    (closed : regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) = true)
    (locals : regionalRetainedLocalDataClosed state (regionalSelectionReferenceRetention state selected).activity
      (regionalSelectionLocalDataRetention state selected) = true) :
    selectInternalOwnershipClosedRegional? program state operation = some selected := by
  simp [selectInternalOwnershipClosedRegional?, found, closed, locals]

theorem ownershipClosedSelection_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalOwnershipClosedRegional? program state operation = some selected) :
    selectInternalRegional? program state operation = some selected ∧
      regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) = true := by
  unfold selectInternalOwnershipClosedRegional? at found
  obtain ⟨actual, selectedBefore, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · rename_i closed
    cases found; exact ⟨selectedBefore, (Bool.and_eq_true_iff.mp closed).1⟩
  · simp at found

theorem ownershipClosedSelection_local_data (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalOwnershipClosedRegional? program state operation = some selected) :
    regionalRetainedLocalDataClosed state (regionalSelectionReferenceRetention state selected).activity
      (regionalSelectionLocalDataRetention state selected) = true := by
  unfold selectInternalOwnershipClosedRegional? at found
  obtain ⟨actual, _, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · rename_i closed
    cases found; exact (Bool.and_eq_true_iff.mp closed).2
  · simp at found

theorem ownershipClosedSelection_preserves_local_data (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (identities : waitIdentitiesUnique before = true)
    (found : selectInternalOwnershipClosedRegional? program before operation = some selected)
    (result : fire? program operation before = some after) :
    regionalRetainedLocalDataClosed after (fun _ => true) (fun _ => true) = true := by
  have selection := (ownershipClosedSelection_facts program before operation selected found).1
  obtain ⟨fields, locals⟩ := regionalSelection_retention_fields program before after operation selected
    snapshotAbsent identities selection result
  exact regionalRetainedLocalDataClosed_preserves_owners before after _ _
    (ownershipClosedSelection_local_data program before operation selected found) fields.2.1 locals

/-- Selection, actual field agreement, and predecessor validity derive retained reference
liveness. No speculative successor or successor-validity premise supplies this conclusion. -/
theorem ownershipClosedSelection_preserves_references (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (identities : waitIdentitiesUnique before = true)
    (activities : activityRecordsOwnLiveWork before = true)
    (races : eventRaceAssociationsValid before = true)
    (found : selectInternalOwnershipClosedRegional? program before operation = some selected) :
    ∃ after, fire? program operation before = some after ∧
      activityRecordsOwnLiveWork after = true ∧ eventRaceAssociationsValid after = true := by
  obtain ⟨selectedBefore, closed⟩ := ownershipClosedSelection_facts program before operation selected found
  obtain ⟨after, result⟩ := regionalSelection_refines program before operation selected snapshotAbsent selectedBefore
  have fields := regionalSelection_reference_fields program before after operation selected snapshotAbsent identities selectedBefore result
  exact ⟨after, result,
    regional_reference_retention_preserves_activity_records before after _ fields closed activities,
    regional_reference_retention_preserves_event_race_associations before after _ fields closed races⟩

/-- The same actual step preserves position and retained references. These exact predicates
remain separate from the additional controller, history, and lifecycle obligations of full preparation. -/
theorem ownershipClosedSelection_preserves_position_and_references (program : Program) (before : RuntimeState)
    (expectedInstanceId : SemanticId) (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (position : runtimePositionValid program expectedInstanceId before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (declared : operation ∈ program.operations)
    (identities : waitIdentitiesUnique before = true)
    (activities : activityRecordsOwnLiveWork before = true)
    (races : eventRaceAssociationsValid before = true)
    (found : selectInternalOwnershipClosedRegional? program before operation = some selected) :
    ∃ after, fire? program operation before = some after ∧
      runtimePositionValid program expectedInstanceId after = true ∧
      activityRecordsOwnLiveWork after = true ∧ eventRaceAssociationsValid after = true := by
  obtain ⟨selectedBefore, _⟩ := ownershipClosedSelection_facts program before operation selected found
  obtain ⟨after, result, retainedActivities, retainedRaces⟩ := ownershipClosedSelection_preserves_references
    program before operation selected snapshotAbsent identities activities races found
  obtain ⟨positionAfter, positionResult, retainedPosition⟩ := regionalSelection_preserves_position
    program before expectedInstanceId operation selected snapshotAbsent position structural declared selectedBefore
  have equal := Option.some.inj (positionResult.symm.trans result)
  subst positionAfter
  exact ⟨after, result, retainedPosition, retainedActivities, retainedRaces⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
