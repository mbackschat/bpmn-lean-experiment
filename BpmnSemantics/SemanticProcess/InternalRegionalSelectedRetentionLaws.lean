module

public import BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention
import BpmnSemantics.SemanticProcess.InternalRegionalReferencePreservation
import BpmnSemantics.SemanticProcess.InternalRegionalSelectionLaws
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionRetentionLaws
import BpmnSemantics.SemanticProcess.ScopeAncestryLaws
import all BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityCore

/-! Ownership-closed regional selections preserve the retained data and reference fields. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Terminate retains its exact root while Error removes it, even when their content masks agree. -/
theorem selectedCancellation_root_disposition (state : RuntimeState) (operation : SemanticOperation)
    (root : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId) :
    (regionalSelectionReferenceRetention state { operation, root, kind := .terminating }).scope root = true ∧
    (regionalSelectionReferenceRetention state { operation, root, kind := .interrupting parent }).scope root = false := by
  simp [regionalSelectionReferenceRetention, cancellationReferenceRetention, occurrenceInSubtree_reflexive]

/-- The selected masks agree with all six reference collections and retained local data. Timer uniqueness is
needed only to express bounded completion's one-record erasure as a retention filter; monitored
completion supplies its exact singleton censuses through the predecessor selector. -/
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
  have foundSelected := found
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  unfold fire? at result
  rw [snapshotAbsent] at result
  cases operation with
  | returnProcess id origin process definition output data =>
      cases data with
      | scalar => simp at found
      | variableMappings => simp at found
      | empty =>
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
      change completeDeclaredScope? program before definition output = some after at result
      rw [selectInternalRegional?_completeScope_fires_selected program before id origin definition output selected
        foundSelected] at result
      have localFields := congrArg ScopedVariables.activities
        (regionalLocalData_selected_completion_variables program before after definition output result)
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
          by_cases monitored : isMonitoredScopeDefinition program definition = true
          · simp only [selectSubscribedCompletionWithdrawal?, monitored, ↓reduceIte] at withdrawn
            obtain ⟨pair, pairFound, withdrawn⟩ := Option.bind_eq_some_iff.mp withdrawn
            split at withdrawn
            · next addressed =>
                cases withdrawn
                simp only [completeSelectedScope?, monitored, ↓reduceIte, completeMonitoredScope?,
                  pairFound, Option.bind_eq_bind, Option.bind_some, ite_eq_left addressed] at result
                obtain ⟨completed, ordinary, update⟩ := Option.bind_eq_some_iff.mp result
                cases update
                refine ⟨monitoredCompletionReferenceRetention_matches_completion program before completed
                  definition output root pair.val pair.property addressed.1 census ordinary, ?_⟩
                exact localFields.trans (List.filter_eq_self.mpr (by intros; rfl)).symm
            · contradiction
          · have legacy : selectInternalCompletionWithdrawal? program before definition = some withdrawal := by
              simpa [selectSubscribedCompletionWithdrawal?, monitored] using withdrawn
            have boundedResult : completeBoundedScope? program before definition output = some after := by
              simpa [completeSelectedScope?, monitored] using result
            cases withdrawal with
            | unbounded =>
                have absent := (completionWithdrawal_unbounded program before definition
                  (completionWithdrawal_unbounded_facts program before definition legacy)).2
                simp only [completeBoundedScope?, absent] at boundedResult
                cases ordinary : completeScopeState? before definition output with
                | none => simp [ordinary] at boundedResult
                | some completed =>
                    simp only [ordinary, Option.some.injEq] at boundedResult
                    subst after
                    refine ⟨ordinaryCompletionReferenceRetention_matches_completion before completed definition output root census ordinary, ?_⟩
                    exact localFields.trans (List.filter_eq_self.mpr (by intros; rfl)).symm
            | bounded record deadline =>
                obtain ⟨declaration, child, parent, definitionFound, childFound, deadlineFound, _⟩ :=
                  completionWithdrawal_raw_selection program before definition record deadline legacy
                have childIdentity : child = root.id := by
                  simp only [boundedScopeChildOccurrence?, ← List.head?_filter, census] at childFound
                  cases parentEq : root.parent <;> simp [parentEq] at childFound
                  exact childFound.1.symm
                subst child
                refine ⟨boundedCompletionReferenceRetention_matches_completion program before after definition output root
                  (definition, declaration) root.id parent deadline census definitionFound childFound deadlineFound identities boundedResult, ?_⟩
                exact localFields.trans (List.filter_eq_self.mpr (by intros; rfl)).symm
            | monitored record timer =>
                unfold selectInternalCompletionWithdrawal? at legacy
                repeat' first
                  | (solve | simp at legacy)
                  | split at legacy
                  | obtain ⟨_, _, legacy⟩ := Option.bind_eq_some_iff.mp legacy
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
    (interruptionRooted : operationInterrupts operation = true → InvocationsInProcessRoots program)
    (found : selectInternalOwnershipClosedRegional? program before operation = some selected) :
    ∃ after, fire? program operation before = some after ∧
      runtimePositionValid program expectedInstanceId after = true ∧
      activityRecordsOwnLiveWork after = true ∧ eventRaceAssociationsValid after = true := by
  obtain ⟨selectedBefore, _⟩ := ownershipClosedSelection_facts program before operation selected found
  obtain ⟨after, result, retainedActivities, retainedRaces⟩ := ownershipClosedSelection_preserves_references
    program before operation selected snapshotAbsent identities activities races found
  obtain ⟨positionAfter, positionResult, retainedPosition⟩ := regionalSelection_preserves_position
    program before expectedInstanceId operation selected snapshotAbsent position structural declared interruptionRooted
    selectedBefore
  have equal := Option.some.inj (positionResult.symm.trans result)
  subst positionAfter
  exact ⟨after, result, retainedPosition, retainedActivities, retainedRaces⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
