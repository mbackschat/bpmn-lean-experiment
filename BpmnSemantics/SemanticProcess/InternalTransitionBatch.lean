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
  | regional regional =>
      have pair := prepared_regional_transition_pair program state instanceId regional (.ordinaryEnd ending)
        programValid stateValid otherFound endFound (PreparedInternalTransition.independent_symm independent)
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
  | arming left =>
      cases right with
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
  | localControl left =>
      cases right with
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
  | scopeCreation left =>
      cases right with
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
  | regional left =>
      exact prepared_regional_transition_pair program state instanceId left right programValid stateValid
        leftPrepared rightPrepared independent
  | ordinaryEnd left =>
      exact prepared_end_transition_pair program state instanceId left right programValid stateValid
        leftPrepared rightPrepared canonical independent

/-- Root completion writes hosting control. A genuinely independent batch supplies another
member's protected control read, deriving this condition before prefix induction. -/
def PreparedInternalTransition.ControlReadOnly (instanceId : SemanticId) : PreparedInternalTransition → Prop
  | .regional prepared => .ordinary (.runtimeControl instanceId) ∉ prepared.footprint.writes
  | _ => True

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
  | arming _ | localControl _ | scopeCreation _ | ordinaryEnd _ => trivial
  | regional regional =>
      change .ordinary (.runtimeControl instanceId) ∉ regional.footprint.writes
      cases right with
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

theorem prepared_transition_control_frame (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (found : prepared.Prepared program state)
    (readOnly : prepared.ControlReadOnly instanceId) :
    (prepared.apply program state).control = state.control := by
  cases prepared with
  | arming arm =>
      cases arm with
      | ordinary operation patch => exact armingControlRead_frame state patch
      | data contract patch => exact armingControlRead_frame state patch.arm
  | localControl localPrepared => rfl
  | ordinaryEnd _ => rfl
  | scopeCreation scope => exact scopeCreation_apply_control state scope.selection
  | regional regional =>
      obtain ⟨after, _, applied⟩ := prepareInternalRegional_executes program state _ regional found
      have frame := preparedRegional_control_filters program state after instanceId _ regional valid running
        found applied (fun _ => false) (fun _ => false) (fun _ => false)
        (by simp) (by simp) (by simp) (by simp) readOnly
      simpa only [PreparedInternalTransition.apply, applied, Option.getD_some] using frame.1

theorem prepared_transition_preserves (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : prepared.Prepared program state)
    (readOnly : prepared.ControlReadOnly instanceId) :
    runtimeStateWellFormed program instanceId (prepared.apply program state) = true ∧
      (prepared.apply program state).control = .running instanceId ∧
      (projectOpenFlowNodeOccurrences? program (prepared.apply program state)).isSome = true := by
  have control := (prepared_transition_control_frame program state prepared instanceId stateValid running selected readOnly).trans running
  cases prepared with
  | arming arm =>
      have preserved := prepared_arming_preserves program state arm instanceId
        programValid stateValid openBefore selected
      exact ⟨preserved.1, control, preserved.2⟩
  | localControl localPrepared =>
      refine ⟨prepareInternalLocalControl_preserves_runtimeStateWellFormed program state
        localPrepared.operation localPrepared instanceId programValid stateValid running selected,
        control, ?_⟩
      change (projectOpenFlowNodeOccurrences? program
        (localPrepared.selection.apply state)).isSome = true
      rw [prepareInternalLocalControl_open_occurrences_frame program state
        localPrepared.operation localPrepared instanceId stateValid running selected]
      exact openBefore
  | ordinaryEnd ending =>
      refine ⟨prepareInternalEnd_preserves_runtimeStateWellFormed program state ending.operation ending
        instanceId stateValid selected, control, ?_⟩
      change (projectOpenFlowNodeOccurrences? program (ending.selection.apply state)).isSome = true
      rw [ending.selection.open_occurrences_frame program state instanceId running]
      exact openBefore
  | scopeCreation scope =>
      refine ⟨prepareInternalScopeCreation_preserves_runtimeStateWellFormed program instanceId state
        scope.selection.operation scope programValid stateValid selected, control, ?_⟩
      cases projected : projectOpenFlowNodeOccurrences? program state with
      | none => simp [projected] at openBefore
      | some current =>
          obtain ⟨start, _, afterProjected⟩ := prepared_scope_creation_open_projection program state
            scope.selection.operation scope instanceId current programValid stateValid projected selected
          change (projectOpenFlowNodeOccurrences? program (scope.selection.apply state)).isSome = true
          simp only [afterProjected, Option.isSome_some]
  | regional regional =>
      obtain ⟨after, applied, published⟩ := prepareInternalRegional_execution_publication program state _ regional
        instanceId instanceId 0 programValid stateValid selected
      obtain ⟨_, opened, _, projected, _⟩ := accepted_operation_delta_equals_independent_open_projection
        program state after regional.selection.operation instanceId 0 _ published.lifecycle
      refine ⟨?_, control, ?_⟩
      · simpa only [PreparedInternalTransition.apply, applied, Option.getD_some] using published.wellFormed
      · simp only [PreparedInternalTransition.apply, applied, Option.getD_some, projected, Option.isSome_some]

theorem prepared_transition_applies (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (selected : prepared.Prepared program state) :
    fire? program prepared.operation state = some (prepared.apply program state) ∧
      applyPreparedInternalTransition? program state prepared = some (prepared.apply program state) := by
  constructor
  · cases prepared with
    | arming arm => exact (prepared_arming_applies program state arm snapshots selected).1
    | localControl localPrepared =>
        exact prepareInternalLocalControl_refines program state localPrepared.operation
          localPrepared snapshots selected
    | scopeCreation scope =>
        exact prepareInternalScopeCreation_refines program state scope.selection.operation scope selected
    | ordinaryEnd ending =>
        exact prepareInternalEnd_refines program state ending.operation ending selected
    | regional regional =>
        obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program state _ regional selected
        simpa only [PreparedInternalTransition.operation, PreparedInternalTransition.apply, applied, Option.getD_some] using fired
  · simp [applyPreparedInternalTransition?, snapshots, selected]

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
      fireInternalTransitionBatch? program state
        (prepared.map PreparedInternalTransition.operation) =
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
      simpa only [runPreparedTransitionBatch?, fireInternalTransitionBatch?, List.map_cons,
        applied.1, applied.2, Bind.bind, Option.bind, applyInternalTransitionBatch, List.foldl_cons]
        using rest

end BpmnSemantics.SemanticProcess.InternalCommutation
