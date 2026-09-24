import BpmnSemantics.SemanticProcess.InternalTransitionPreservation
import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.InternalLocalControlPairPublication
import BpmnSemantics.SemanticProcess.InternalRegionalPairCommutation
import BpmnSemantics.SemanticProcess.InternalRegionalArmingCommutation
import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationCommutation
import BpmnSemantics.SemanticProcess.InternalEndArmingCommutation
import BpmnSemantics.SemanticProcess.InternalEndLocalControlCommutation
import BpmnSemantics.SemanticProcess.InternalEndScopeCreationCommutation
import BpmnSemantics.SemanticProcess.InternalEndRegionalCommutation
import BpmnSemantics.SemanticProcess.InternalMergeArmingCommutation
import BpmnSemantics.SemanticProcess.InternalMergeScopeCreationCommutation
import BpmnSemantics.SemanticProcess.InternalMergeEndCommutation
import BpmnSemantics.SemanticProcess.InternalMergeRegionalCommutation
import BpmnSemantics.SemanticProcess.InternalTimerTaskTransitionPair
import BpmnSemantics.SemanticProcess.InternalTimerTaskAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalBoundedScopeTransitionPair
import BpmnSemantics.SemanticProcess.InternalMessageTaskTransitionPair

/-! Complete mixed preparations lift to arbitrary finite prefixes and multiplicity-preserving
permutations under the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem prepared_regional_transition_pair (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (regional : PreparedInternalRegional) (other : PreparedInternalTransition)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (regionalFound : prepareInternalRegional? program state regional.selection.operation = some regional)
    (otherFound : other.Prepared program state)
    (independent : (PreparedInternalTransition.regional regional).Independent other) :
    other.Prepared program ((PreparedInternalTransition.regional regional).apply program state) ∧
      (PreparedInternalTransition.regional regional).Prepared program (other.apply program state) ∧
      other.apply program ((PreparedInternalTransition.regional regional).apply program state) =
        (PreparedInternalTransition.regional regional).apply program (other.apply program state) := by
  have validFor (hosting : SemanticId) (running : state.control = .running hosting) :
      runtimeStateWellFormed program hosting state = true := by
    have same := runtimePositionValid_running_instance program instanceId hosting state
      (runtimeStateWellFormed_position program instanceId state stateValid) running
    simpa only [same] using stateValid
  cases other with
  | messageTask contract message =>
      have pair := prepared_message_task_transition_pair program state instanceId contract message (.regional regional)
        programValid stateValid otherFound regionalFound
        (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
        (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | boundedScope contract bounded =>
      have pair := prepared_bounded_scope_transition_pair program state instanceId contract bounded (.regional regional)
        programValid stateValid otherFound regionalFound
        (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
        (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | timerTask contract patch =>
      have pair := prepared_timer_task_transition_pair program state instanceId contract patch (.regional regional)
        programValid stateValid otherFound regionalFound
        (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
        (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | arming arm =>
      have valid := validFor _ (preparedArming_owner_facts program state arm otherFound).2.2
      obtain ⟨frame, after, applied, armFrame, commute⟩ := prepared_regional_arming_pair_commutes
        program state regional.selection.operation regional arm programValid valid regionalFound otherFound independent
      refine ⟨?_, frame, ?_⟩
      · simpa only [PreparedInternalTransition.Prepared, PreparedInternalTransition.apply, applied, Option.getD_some] using armFrame
      · simp only [PreparedInternalTransition.apply, applied, commute, Option.getD_some]
  | localControl control =>
      have running : state.control = .running control.runtimeInstanceId := by
        obtain ⟨_, _, _, _, _, _, _, running, _, _, _, _, _, _, _, rfl⟩ :=
          prepareInternalLocalControl_facts program state control.operation control otherFound
        exact running
      obtain ⟨frame, after, applied, controlFrame, commute⟩ := prepared_regional_local_control_pair_commutes
        program state regional.selection.operation control.operation regional control programValid
          (validFor _ running) regionalFound otherFound independent
      refine ⟨?_, frame, ?_⟩
      · simpa only [PreparedInternalTransition.Prepared, PreparedInternalTransition.apply, applied, Option.getD_some] using controlFrame
      · simp only [PreparedInternalTransition.apply, applied, commute, Option.getD_some]
  | scopeCreation creation =>
      have running : state.control = .running creation.runtimeInstanceId := by
        obtain ⟨_, _, _, _, _, _, _, _, running, _, _, _, _, _, _, _, _, rfl⟩ :=
          prepareInternalScopeCreation_facts program state creation.selection.operation creation otherFound
        exact running
      obtain ⟨frame, after, applied, creationFrame, commute, _⟩ := prepared_regional_scope_creation_pair_commutes
        program state regional.selection.operation creation.selection.operation regional creation programValid
          (validFor _ running) regionalFound otherFound independent
      refine ⟨?_, frame, ?_⟩
      · simpa only [PreparedInternalTransition.Prepared, PreparedInternalTransition.apply, applied, Option.getD_some] using creationFrame
      · simp only [PreparedInternalTransition.apply, applied, commute, Option.getD_some]
  | ordinaryEnd ending =>
      have running : state.control = .running ending.runtimeInstanceId := by
        obtain ⟨_, _, _, _, _, _, _, _, running, _, _, _, _, _, rfl⟩ :=
          prepareInternalEnd_facts program state ending.operation ending otherFound
        exact running
      obtain ⟨frame, after, applied, endFrame, commute⟩ := prepared_regional_end_pair_commutes
        program state regional.selection.operation ending.operation regional ending
          (validFor _ running) regionalFound otherFound independent
      refine ⟨?_, frame, ?_⟩
      · simpa only [PreparedInternalTransition.Prepared, PreparedInternalTransition.apply, applied, Option.getD_some] using endFrame
      · simp only [PreparedInternalTransition.apply, applied, commute, Option.getD_some]
  | mergeInput merge =>
      have running : state.control = .running merge.runtimeInstanceId := by
        obtain ⟨_, _, _, _, _, _, running, _, _, _, _, _, _, rfl⟩ :=
          prepareInternalMerge_facts program state merge.selection.operation merge.selection.alternative merge otherFound
        exact running
      obtain ⟨frame, after, applied, mergeFrame, commute⟩ := prepared_regional_merge_pair_commutes
        program state regional.selection.operation merge.selection.operation merge.selection.alternative regional merge
          (validFor _ running) regionalFound otherFound independent
      refine ⟨?_, frame, ?_⟩
      · simpa only [PreparedInternalTransition.Prepared, PreparedInternalTransition.apply, applied, Option.getD_some] using mergeFrame
      · simp only [PreparedInternalTransition.apply, applied, commute, Option.getD_some]
  | regional right =>
      have selected := (ownershipClosedSelection_facts program state regional.selection.operation regional.selection
        (prepareInternalRegional_facts program state _ regional regionalFound).2.2.2.1).1
      obtain ⟨hosting, running⟩ := regionalSelection_running program state _ regional.selection selected
      obtain ⟨afterLeft, afterRight, final, leftApplied, rightApplied, rightFrame, leftFrame,
        lrApplied, rlApplied, _⟩ := prepared_regional_pair_commutes program state hosting
          regional.selection.operation right.selection.operation regional right (validFor _ running)
          running regionalFound otherFound independent
      refine ⟨?_, ?_, ?_⟩
      · simpa only [PreparedInternalTransition.Prepared, PreparedInternalTransition.apply, leftApplied, Option.getD_some] using rightFrame
      · simpa only [PreparedInternalTransition.Prepared, PreparedInternalTransition.apply, rightApplied, Option.getD_some] using leftFrame
      · simp only [PreparedInternalTransition.apply, leftApplied, rightApplied, Option.getD_some,
          lrApplied, rlApplied]

private theorem prepared_end_transition_pair (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (ending : PreparedInternalEnd) (other : PreparedInternalTransition)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (endFound : prepareInternalEnd? program state ending.operation = some ending)
    (otherFound : other.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : (PreparedInternalTransition.ordinaryEnd ending).Independent other) :
    other.Prepared program (ending.selection.apply state) ∧
      prepareInternalEnd? program (other.apply program state) ending.operation = some ending ∧
      other.apply program (ending.selection.apply state) = ending.selection.apply (other.apply program state) := by
  cases other with
  | messageTask contract message =>
      have pair := prepared_message_task_transition_pair program state instanceId contract message (.ordinaryEnd ending)
        programValid stateValid otherFound endFound canonical (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | boundedScope contract bounded =>
      have pair := prepared_bounded_scope_transition_pair program state instanceId contract bounded (.ordinaryEnd ending)
        programValid stateValid otherFound endFound canonical (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | timerTask contract patch =>
      have pair := prepared_timer_task_transition_pair program state instanceId contract patch (.ordinaryEnd ending)
        programValid stateValid otherFound endFound canonical (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | arming arm =>
      have pair := prepared_end_arming_pair_commutes program state ending.operation ending arm
        endFound otherFound independent
      exact ⟨pair.2.1, pair.1, pair.2.2⟩
  | localControl control =>
      have pair := prepared_end_local_control_pair_commutes program state ending.operation control.operation
        ending control endFound otherFound canonical independent
      exact ⟨pair.2.1, pair.1, pair.2.2⟩
  | scopeCreation creation =>
      have pair := prepared_end_scope_creation_pair_commutes program state ending.operation creation.selection.operation
        ending creation endFound otherFound canonical independent
      exact ⟨pair.2.1, pair.1, pair.2.2⟩
  | ordinaryEnd other =>
      have pair := prepared_end_pair_commutes program state ending.operation other.operation ending other
        endFound otherFound independent
      exact ⟨pair.2.1, pair.1, pair.2.2⟩
  | mergeInput merge =>
      exact prepared_merge_end_pair_commutes program state merge.selection.operation ending.operation
        merge.selection.alternative merge ending otherFound endFound canonical independent
  | regional regional =>
      have pair := prepared_regional_transition_pair program state instanceId regional (.ordinaryEnd ending)
        programValid stateValid otherFound endFound (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩

private theorem prepared_merge_transition_pair (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (merge : PreparedInternalMerge) (other : PreparedInternalTransition)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (mergeFound : prepareInternalMerge? program state merge.selection.operation merge.selection.alternative = some merge)
    (otherFound : other.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : (PreparedInternalTransition.mergeInput merge).Independent other) :
    other.Prepared program (merge.selection.apply state) ∧
      prepareInternalMerge? program (other.apply program state) merge.selection.operation merge.selection.alternative = some merge ∧
      other.apply program (merge.selection.apply state) = merge.selection.apply (other.apply program state) := by
  cases other with
  | messageTask contract message =>
      have pair := prepared_message_task_transition_pair program state instanceId contract message (.mergeInput merge)
        programValid stateValid otherFound mergeFound canonical (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | boundedScope contract bounded =>
      have pair := prepared_bounded_scope_transition_pair program state instanceId contract bounded (.mergeInput merge)
        programValid stateValid otherFound mergeFound canonical (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | timerTask contract patch =>
      have pair := prepared_timer_task_transition_pair program state instanceId contract patch (.mergeInput merge)
        programValid stateValid otherFound mergeFound canonical (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | arming arm =>
      exact prepared_merge_arming_pair_commutes program state merge.selection.operation merge.selection.alternative
        merge arm mergeFound otherFound canonical independent
  | localControl control =>
      have pair := prepared_merge_local_control_pair_commutes program state merge.selection.operation control.operation
        merge.selection.alternative merge control mergeFound otherFound canonical independent
      exact ⟨pair.2.1, pair.1, pair.2.2⟩
  | scopeCreation creation =>
      have pair := prepared_merge_scope_creation_pair_commutes program state merge.selection.operation creation.selection.operation
        merge.selection.alternative merge creation mergeFound otherFound canonical
          (localControlStateFootprintsNonInterfering_symm _ _ independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | mergeInput right =>
      have pair := prepared_merge_pair_commutes program state merge.selection.operation right.selection.operation
        merge.selection.alternative right.selection.alternative merge right mergeFound otherFound canonical independent
      exact ⟨pair.2.1, pair.1, pair.2.2⟩
  | ordinaryEnd ending =>
      have pair := prepared_end_transition_pair program state instanceId ending (.mergeInput merge)
        programValid stateValid otherFound mergeFound canonical (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | regional regional =>
      have pair := prepared_regional_transition_pair program state instanceId regional (.mergeInput merge)
        programValid stateValid otherFound mergeFound (PreparedInternalTransition.independent_symm independent)
      exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩

theorem prepared_transition_pair (program : Program) (state : RuntimeState)
    (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (left right : PreparedInternalTransition)
    (leftPrepared : left.Prepared program state)
    (rightPrepared : right.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : left.Independent right) :
    right.Prepared program (left.apply program state) ∧
      left.Prepared program (right.apply program state) ∧
      right.apply program (left.apply program state) = left.apply program (right.apply program state) := by
  cases left with
  | messageTask contract message =>
      exact prepared_message_task_transition_pair program state instanceId contract message right
        programValid stateValid leftPrepared rightPrepared canonical independent
  | boundedScope contract bounded =>
      exact prepared_bounded_scope_transition_pair program state instanceId contract bounded right
        programValid stateValid leftPrepared rightPrepared canonical independent
  | timerTask contract patch =>
      exact prepared_timer_task_transition_pair program state instanceId contract patch right
        programValid stateValid leftPrepared rightPrepared canonical independent
  | arming left =>
      cases right with
      | messageTask contract message =>
          have pair := prepared_message_task_transition_pair program state instanceId contract message (.arming left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | boundedScope contract bounded =>
          have pair := prepared_bounded_scope_transition_pair program state instanceId contract bounded (.arming left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | timerTask contract patch =>
          have pair := prepared_timer_task_transition_pair program state instanceId contract patch (.arming left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | arming right =>
          exact prepared_arming_pair program state left right leftPrepared rightPrepared
            canonical independent
      | localControl right =>
          have pair := prepared_local_control_arming_pair program state right.operation right
            left rightPrepared leftPrepared canonical
            (localControlStateFootprintsNonInterfering_symm _ _ independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | scopeCreation right =>
          have pair := prepared_scope_creation_arming_pair program state right.selection.operation
            right left rightPrepared leftPrepared canonical
            (localControlStateFootprintsNonInterfering_symm _ _ independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | regional right =>
          have pair := prepared_regional_transition_pair program state instanceId right (.arming left)
            programValid stateValid rightPrepared leftPrepared (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | ordinaryEnd right =>
          have pair := prepared_end_transition_pair program state instanceId right (.arming left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | mergeInput right =>
          have pair := prepared_merge_transition_pair program state instanceId right (.arming left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | localControl left =>
      cases right with
      | messageTask contract message =>
          have pair := prepared_message_task_transition_pair program state instanceId contract message (.localControl left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | boundedScope contract bounded =>
          have pair := prepared_bounded_scope_transition_pair program state instanceId contract bounded (.localControl left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | timerTask contract patch =>
          have pair := prepared_timer_task_transition_pair program state instanceId contract patch (.localControl left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | arming right =>
          exact prepared_local_control_arming_pair program state left.operation left right
            leftPrepared rightPrepared canonical independent
      | localControl right =>
          have pair := prepared_local_control_pair_commutes program state left.operation
            right.operation left right leftPrepared rightPrepared canonical independent
          exact ⟨pair.2.1, pair.1, pair.2.2⟩
      | scopeCreation right =>
          have pair := prepared_scope_creation_local_control_pair program state
            right.selection.operation left.operation right left rightPrepared leftPrepared
            canonical (localControlStateFootprintsNonInterfering_symm _ _ independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | regional right =>
          have pair := prepared_regional_transition_pair program state instanceId right (.localControl left)
            programValid stateValid rightPrepared leftPrepared (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | ordinaryEnd right =>
          have pair := prepared_end_transition_pair program state instanceId right (.localControl left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | mergeInput right =>
          have pair := prepared_merge_transition_pair program state instanceId right (.localControl left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | scopeCreation left =>
      cases right with
      | messageTask contract message =>
          have pair := prepared_message_task_transition_pair program state instanceId contract message (.scopeCreation left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | boundedScope contract bounded =>
          have pair := prepared_bounded_scope_transition_pair program state instanceId contract bounded (.scopeCreation left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | timerTask contract patch =>
          have pair := prepared_timer_task_transition_pair program state instanceId contract patch (.scopeCreation left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | arming right =>
          exact prepared_scope_creation_arming_pair program state left.selection.operation
            left right leftPrepared rightPrepared canonical independent
      | localControl right =>
          exact prepared_scope_creation_local_control_pair program state left.selection.operation
            right.operation left right leftPrepared rightPrepared canonical independent
      | scopeCreation right =>
          have pair := prepared_scope_creation_pair_complete program instanceId state
            left.selection.operation right.selection.operation left right programValid stateValid
            leftPrepared rightPrepared independent
          exact ⟨pair.2.1, pair.1, pair.2.2.2.2.2.2⟩
      | regional right =>
          have pair := prepared_regional_transition_pair program state instanceId right (.scopeCreation left)
            programValid stateValid rightPrepared leftPrepared (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | ordinaryEnd right =>
          have pair := prepared_end_transition_pair program state instanceId right (.scopeCreation left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
      | mergeInput right =>
          have pair := prepared_merge_transition_pair program state instanceId right (.scopeCreation left)
            programValid stateValid rightPrepared leftPrepared canonical (PreparedInternalTransition.independent_symm independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | regional left =>
      exact prepared_regional_transition_pair program state instanceId left right programValid stateValid
        leftPrepared rightPrepared independent
  | ordinaryEnd left =>
      exact prepared_end_transition_pair program state instanceId left right programValid stateValid
        leftPrepared rightPrepared canonical independent
  | mergeInput left =>
      exact prepared_merge_transition_pair program state instanceId left right programValid stateValid
        leftPrepared rightPrepared canonical independent

theorem prepared_transition_pair_control_read_only (program : Program) (state : RuntimeState)
    (left right : PreparedInternalTransition) (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (rightFound : right.Prepared program state)
    (independent : left.Independent right) : left.ControlReadOnly instanceId := by
  have instanceEq (hosting : SemanticId) (selectedRunning : state.control = .running hosting) : hosting = instanceId :=
    runtimePositionValid_running_instance program instanceId hosting state
      (runtimeStateWellFormed_position program instanceId state valid) selectedRunning
  cases left with
  | messageTask _ _ | boundedScope _ _ | timerTask _ _ | arming _ | localControl _
  | scopeCreation _ | ordinaryEnd _ | mergeInput _ => trivial
  | regional regional =>
      change .ordinary (.runtimeControl instanceId) ∉ regional.footprint.writes
      cases right with
      | messageTask contract patch =>
          obtain ⟨_, owner, hosting, inputOrigin, processId, _, selectedRunning, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
            prepareInternalMessageTaskContract_facts program state contract patch rightFound.2
          have same : hosting = instanceId := by
            simpa only [runningInstance?, running, Option.some.injEq] using selectedRunning.symm
          subst hosting
          intro written
          have read : .ordinary (.runtimeControl instanceId) ∈
              (messageTaskStateFootprint
                (makeInternalMessageTaskPatch program state contract owner instanceId processId inputOrigin)).reads := by
            simp [messageTaskStateFootprint, makeInternalMessageTaskPatch, canonicalRegionalStateAtoms_mem]
          have conflict := regional_independent_read_write _ _ independent _ _ written read
          simp [regionalStateAtomsConflict] at conflict
      | boundedScope contract scope =>
          obtain ⟨selection, hosting, ownerRecord, _, start, delta, _, selectedRunning,
            _, _, _, _, _, _, _, _, rfl⟩ :=
            prepareInternalBoundedScope_facts program state contract scope rightFound.2
          have same : hosting = instanceId := by
            simpa only [runningInstance?, running, Option.some.injEq] using selectedRunning.symm
          subst hosting
          have read : .ordinary (.runtimeControl instanceId) ∈
              (boundedScopeStateFootprint selection instanceId ownerRecord).reads := by
            apply (canonicalRegionalStateAtoms_mem _ _).mpr
            apply List.mem_append_left
            apply List.mem_map.mpr
            exact ⟨.runtimeControl instanceId,
              by simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy], rfl⟩
          intro written
          have conflict := regional_independent_read_write _ _ independent _ _ written read
          simp [regionalStateAtomsConflict] at conflict
      | timerTask contract patch =>
          have same := instanceEq _ (preparedTimerTask_owner_facts program state contract patch rightFound).2.2
          intro written
          have read : .ordinary (.runtimeControl instanceId) ∈ (timerTaskStateFootprint patch).reads := by
            simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem, same]
          have conflict := regional_independent_read_write _ _ independent _ _ written read
          simp [regionalStateAtomsConflict] at conflict
      | arming arm =>
          have same := instanceEq _ (preparedArming_owner_facts program state arm rightFound).2.2
          simpa only [same] using arming_regional_control_not_written regional.footprint arm independent
      | localControl control =>
          obtain ⟨selection, origin, hosting, identity, delta, _, _, selectedRunning,
            _, _, _, _, _, _, _, rfl⟩ :=
            prepareInternalLocalControl_facts program state control.operation control rightFound
          have same := instanceEq hosting selectedRunning
          subst hosting
          exact localControl_regional_control_not_written state regional.footprint selection instanceId independent
      | scopeCreation creation =>
          obtain ⟨selection, hosting, ownerRecord, origin, definition, start, delta,
            _, selectedRunning, _, _, _, _, _, _, _, _, rfl⟩ :=
            prepareInternalScopeCreation_facts program state creation.selection.operation creation rightFound
          have same := instanceEq hosting selectedRunning
          subst hosting
          have read : liftRegionalStateAtom selection.owner (.runtimeControl instanceId) ∈
              (liftRegionalStateFootprint selection.owner
                (internalScopeCreationStateFootprint selection instanceId ownerRecord)).reads := by
            apply List.mem_map.mpr
            exact ⟨_, by simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy], rfl⟩
          intro written
          have conflict := regional_independent_read_write _ _ independent _ _ written read
          simp [liftRegionalStateAtom, regionalStateAtomsConflict] at conflict
      | regional other =>
          exact regional_pair_read_key_not_written _ _ independent _
            (regionalStateFootprint_control_read state other.selection other.region other.footprint instanceId running
              (prepareInternalRegional_facts program state _ other rightFound).2.2.2.2.2.1)
      | ordinaryEnd ending =>
          obtain ⟨_, selection, _, hosting, _, _, _, _, selectedRunning, _, _, _, _, _, rfl⟩ :=
            prepareInternalEnd_facts program state ending.operation ending rightFound
          have same := instanceEq hosting selectedRunning
          subst hosting
          exact regional_pair_read_key_not_written _ _ independent _
            (by simp [PreparedInternalTransition.stateFootprint, makeInternalEndPreparation,
              internalEndStateFootprint, canonicalRegionalStateAtoms_mem])
      | mergeInput merge =>
          have view := prepareInternalMerge_patch_footprint program state merge.selection.operation merge.selection.alternative merge rightFound
          have runningMerge : state.control = .running merge.runtimeInstanceId := by
            obtain ⟨_, _, _, _, _, _, selectedRunning, _, _, _, _, _, _, rfl⟩ :=
              prepareInternalMerge_facts program state merge.selection.operation merge.selection.alternative merge rightFound
            exact selectedRunning
          have separated : regionalStateFootprintsIndependent regional.footprint
              (liftRegionalStateFootprint merge.selection.localControlPatch.owner
                (internalLocalControlStateFootprint state merge.selection.localControlPatch merge.runtimeInstanceId)) = true := by
            rw [view]
            exact independent
          simpa only [instanceEq _ runningMerge] using
            localControl_regional_control_not_written state regional.footprint merge.selection.localControlPatch
              merge.runtimeInstanceId separated

def PreparedTransitionList (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) : Prop :=
  ∀ member ∈ prepared, member.Prepared program state

/-- Every member has an independent partner in a real batch. Its protected control read
excludes terminal root completion without adding an executor restriction or a successor premise. -/
theorem prepared_transition_batch_control_read_only (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (selected : PreparedTransitionList program state prepared)
    (independent : prepared.Pairwise PreparedInternalTransition.Independent)
    (nontrivial : 2 ≤ prepared.length) :
    ∀ member ∈ prepared, member.ControlReadOnly instanceId := by
  cases prepared with
  | nil => simp at nontrivial
  | cons head tail =>
      cases tail with
      | nil => simp at nontrivial
      | cons second rest =>
          intro member present
          rcases List.mem_cons.mp present with rfl | inTail
          · exact prepared_transition_pair_control_read_only program state member second instanceId valid running
              (selected second (by simp)) ((List.pairwise_cons.mp independent).1 second (by simp))
          · exact prepared_transition_pair_control_read_only program state member head instanceId valid running
              (selected head (by simp)) (PreparedInternalTransition.independent_symm
                ((List.pairwise_cons.mp independent).1 member inTail))

theorem prepared_transition_tail (program : Program) (state : RuntimeState)
    (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (head : PreparedInternalTransition) (tail : List PreparedInternalTransition)
    (selected : PreparedTransitionList program state (head :: tail))
    (canonical : canonicalCollectionOrder state = true)
    (independent : (head :: tail).Pairwise PreparedInternalTransition.Independent) :
    PreparedTransitionList program (head.apply program state) tail := by
  intro member present
  exact (prepared_transition_pair program state instanceId programValid stateValid head member (selected head (by simp))
    (selected member (by simp [present])) canonical
    ((List.pairwise_cons.mp independent).1 member present)).1

/-- Each recursive step derives validity, running identity, projectability, and the complete
remaining preparations from its predecessor; no successor fact is supplied by the caller. -/
theorem prepared_transition_batch_preserves (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedTransitionList program state prepared)
    (readOnly : ∀ member ∈ prepared, member.ControlReadOnly instanceId)
    (independent : prepared.Pairwise PreparedInternalTransition.Independent) :
    runtimeStateWellFormed program instanceId (applyInternalTransitionBatch program state prepared) = true ∧
      (applyInternalTransitionBatch program state prepared).control = .running instanceId ∧
      (projectOpenFlowNodeOccurrences? program
        (applyInternalTransitionBatch program state prepared)).isSome = true := by
  induction prepared generalizing state with
  | nil => exact ⟨stateValid, running, openBefore⟩
  | cons head tail ih =>
      have valid := prepared_transition_preserves program state head instanceId programValid
        stateValid running openBefore (selected head (by simp)) (readOnly head (by simp))
      exact ih (head.apply program state) valid.1 valid.2.1 valid.2.2
        (prepared_transition_tail program state instanceId programValid stateValid head tail selected
          (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
          independent)
        (fun member present => readOnly member (by simp [present]))
        (List.pairwise_cons.mp independent).2

theorem prepared_transition_batch_frame (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (query : PreparedInternalTransition)
    (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedTransitionList program state prepared)
    (readOnly : ∀ member ∈ prepared, member.ControlReadOnly instanceId)
    (queryPrepared : query.Prepared program state)
    (independent : prepared.Pairwise PreparedInternalTransition.Independent)
    (separated : ∀ member ∈ prepared, member.Independent query) :
    query.Prepared program (applyInternalTransitionBatch program state prepared) := by
  induction prepared generalizing state with
  | nil => exact queryPrepared
  | cons head tail ih =>
      have canonical := runtimeStateWellFormed_canonicalCollectionOrder program instanceId state
        stateValid
      have valid := prepared_transition_preserves program state head instanceId programValid
        stateValid running openBefore (selected head (by simp)) (readOnly head (by simp))
      have frame := (prepared_transition_pair program state instanceId programValid stateValid head query (selected head (by simp))
        queryPrepared canonical (separated head (by simp))).1
      exact ih (head.apply program state) valid.1 valid.2.1 valid.2.2
        (prepared_transition_tail program state instanceId programValid stateValid head tail selected canonical independent) (fun member present => readOnly member (by simp [present])) frame
        (List.pairwise_cons.mp independent).2
        (fun member present => separated member (by simp [present]))

/-- List permutation preserves multiplicity, and each adjacent swap uses the actual predecessor's
canonical state. This covers arbitrary finite mixed lists without a bound on their length. -/
theorem prepared_transition_batch_perm (program : Program) (state : RuntimeState)
    (left right : List PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedTransitionList program state left)
    (readOnly : ∀ member ∈ left, member.ControlReadOnly instanceId)
    (independent : left.Pairwise PreparedInternalTransition.Independent)
    (permutation : left.Perm right) :
    applyInternalTransitionBatch program state left = applyInternalTransitionBatch program state right := by
  induction permutation generalizing state with
  | nil => rfl
  | cons head permutation ih =>
      have valid := prepared_transition_preserves program state head instanceId programValid
        stateValid running openBefore (selected head (by simp)) (readOnly head (by simp))
      exact ih (head.apply program state) valid.1 valid.2.1 valid.2.2
        (prepared_transition_tail program state instanceId programValid stateValid head _ selected
          (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
          independent)
        (fun member present => readOnly member (by simp [present]))
        (List.pairwise_cons.mp independent).2
  | swap first second tail =>
      have pair := prepared_transition_pair program state instanceId programValid stateValid second first
        (selected second (by simp)) (selected first (by simp))
        (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
        ((List.pairwise_cons.mp independent).1 first (by simp))
      simp only [applyInternalTransitionBatch, List.foldl_cons]
      rw [pair.2.2]
  | trans first second ihFirst ihSecond =>
      exact (ihFirst state stateValid running openBefore selected readOnly independent).trans
        (ihSecond state stateValid running openBefore
          (fun member present => selected member (first.mem_iff.mpr present))
          (fun member present => readOnly member (first.mem_iff.mpr present))
          (independent.perm first PreparedInternalTransition.independent_symm))

theorem prepared_transition_batch_perm_preserves (program : Program) (state : RuntimeState)
    (left right : List PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedTransitionList program state left)
    (readOnly : ∀ member ∈ left, member.ControlReadOnly instanceId)
    (independent : left.Pairwise PreparedInternalTransition.Independent)
    (permutation : left.Perm right) :
    applyInternalTransitionBatch program state left = applyInternalTransitionBatch program state right ∧
      runtimeStateWellFormed program instanceId (applyInternalTransitionBatch program state right) = true ∧
      (applyInternalTransitionBatch program state right).control = .running instanceId ∧
      (projectOpenFlowNodeOccurrences? program
        (applyInternalTransitionBatch program state right)).isSome = true := by
  have same := prepared_transition_batch_perm program state left right instanceId programValid
    stateValid running openBefore selected readOnly independent permutation
  refine ⟨same, ?_⟩
  rw [← same]
  exact prepared_transition_batch_preserves program state left instanceId programValid
    stateValid running openBefore selected readOnly independent

def runPreparedTransitionBatch? (program : Program) (state : RuntimeState) :
    List PreparedInternalTransition → Option RuntimeState
  | [] => some state
  | head :: tail => do
      let next ← applyPreparedInternalTransition? program state head
      runPreparedTransitionBatch? program next tail

def fireInternalTransitionBatch? (program : Program) (state : RuntimeState) :
    List SemanticOperation → Option RuntimeState
  | [] => some state
  | head :: tail => do
      let next ← fire? program head state
      fireInternalTransitionBatch? program next tail

def fireInternalAlternativeBatch? (program : Program) (state : RuntimeState) :
    List (SemanticOperation × InternalAlternative) → Option RuntimeState
  | [] => some state
  | (operation, alternative) :: tail => do
      let next ← fireInternalAlternative? program state operation alternative
      fireInternalAlternativeBatch? program next tail

theorem fireInternalAlternativeBatch_operations (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) :
    fireInternalAlternativeBatch? program state (operations.map (fun operation => (operation, .operation operation.id))) =
      fireInternalTransitionBatch? program state operations := by
  induction operations generalizing state with
  | nil => rfl
  | cons operation rest ih =>
      simp only [List.map_cons, fireInternalAlternativeBatch?, fireInternalAlternative_operation, fireInternalTransitionBatch?]
      cases fired : fire? program operation state <;> simp [ih]

/-- Existing operation-only batches retain their original evaluator guarantee. -/
theorem fireInternalAlternativeBatch_ordinary_preparations (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition)
    (ordinary : ∀ member ∈ prepared, member.alternative = .operation member.operation.id) :
    fireInternalAlternativeBatch? program state (prepared.map (fun member => (member.operation, member.alternative))) =
      fireInternalTransitionBatch? program state (prepared.map PreparedInternalTransition.operation) := by
  rw [← fireInternalAlternativeBatch_operations]
  congr 1
  simp only [List.map_map]
  apply List.map_congr_left
  intro member present
  exact Prod.ext rfl (ordinary member present)

/-- The real evaluator and checked prepared fold both succeed at every derived prefix. Snapshot
exclusion is needed for these execution paths, not for the raw-state permutation law. -/
theorem prepared_transition_batch_applies (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (selected : PreparedTransitionList program state prepared)
    (readOnly : ∀ member ∈ prepared, member.ControlReadOnly instanceId)
    (independent : prepared.Pairwise PreparedInternalTransition.Independent) :
    runPreparedTransitionBatch? program state prepared =
        some (applyInternalTransitionBatch program state prepared) ∧
      fireInternalAlternativeBatch? program state
        (prepared.map (fun member => (member.operation, member.alternative))) =
        some (applyInternalTransitionBatch program state prepared) := by
  induction prepared generalizing state with
  | nil => exact ⟨rfl, rfl⟩
  | cons head tail ih =>
      have applied := prepared_transition_applies program state head snapshots (selected head (by simp))
      have valid := prepared_transition_preserves program state head instanceId programValid
        stateValid running openBefore (selected head (by simp)) (readOnly head (by simp))
      have rest := ih (head.apply program state) valid.1 valid.2.1 valid.2.2
        (prepared_transition_tail program state instanceId programValid stateValid head tail selected
          (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
          independent)
        (fun member present => readOnly member (by simp [present]))
        (List.pairwise_cons.mp independent).2
      simpa only [runPreparedTransitionBatch?, fireInternalAlternativeBatch?, List.map_cons,
        applied.1, applied.2, Bind.bind, Option.bind, applyInternalTransitionBatch, List.foldl_cons]
        using rest

end BpmnSemantics.SemanticProcess.InternalCommutation
