import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlPairPublication
import BpmnSemantics.SemanticProcess.InternalMessageTaskAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalBoundedScopePublication
import BpmnSemantics.SemanticProcess.InternalTimerTaskAcceptedPublication

/-! The existing finite-prefix contract derives single-step validity, projectability, control,
and evaluator correspondence from complete preparation; no successor certificate is assumed. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Root completion writes hosting control. A genuinely independent batch supplies another
member's protected control read, deriving this condition before prefix induction. -/
def PreparedInternalTransition.ControlReadOnly (instanceId : SemanticId) : PreparedInternalTransition → Prop
  | .regional prepared => .ordinary (.runtimeControl instanceId) ∉ prepared.footprint.writes
  | _ => True

theorem prepared_transition_control_frame (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (found : prepared.Prepared program state)
    (readOnly : prepared.ControlReadOnly instanceId) :
    (prepared.apply program state).control = state.control := by
  cases prepared with
  | messageTask _ patch => exact armingControlRead_frame state patch.arm
  | boundedScope contract scope =>
      obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
        prepareInternalBoundedScope_facts program state contract scope found.2
      obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
      have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
      simp only [PreparedInternalTransition.apply, makeInternalBoundedScopePreparation,
        InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, child]
  | timerTask _ patch => exact armingControlRead_frame state patch.arm
  | arming arm =>
      cases arm with
      | ordinary operation patch => exact armingControlRead_frame state patch
      | data contract patch => exact armingControlRead_frame state patch.arm
  | localControl localPrepared => rfl
  | ordinaryEnd _ => rfl
  | mergeInput _ => rfl
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
  | messageTask contract patch =>
      obtain ⟨task, message, _, _, accepted⟩ := prepared_message_task_lifecycle_pair program state contract
        patch instanceId instanceId 0 selected.1.2.2 programValid stateValid openBefore selected.2
      obtain ⟨_, opened, _, afterProjected, _⟩ := accepted_operation_delta_equals_independent_open_projection
        program state (applyInternalMessageTaskPatch state patch) contract.operation instanceId 0 _ accepted
      exact ⟨prepared_message_task_preserves_runtime program state contract patch instanceId selected.2 stateValid,
        control, by simp only [PreparedInternalTransition.apply, afterProjected, Option.isSome_some]⟩
  | boundedScope contract scope =>
      obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp openBefore
      obtain ⟨start, _, afterProjected⟩ := prepared_bounded_scope_open_projection program state contract scope
        instanceId current selected.2 programValid stateValid projected
      exact ⟨prepared_bounded_scope_preserves_runtime program state contract scope instanceId selected.2 stateValid,
        control, by simp only [PreparedInternalTransition.apply, afterProjected, Option.isSome_some]⟩
  | timerTask contract patch =>
      have preserved := prepared_timer_task_preserves_runtime_and_open_set program state contract patch instanceId
        programValid stateValid openBefore selected
      exact ⟨preserved.1, control, preserved.2⟩
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
  | mergeInput merge =>
      refine ⟨prepareInternalMerge_preserves_runtimeStateWellFormed program state merge.selection.operation
        merge.selection.alternative merge instanceId stateValid selected, control, ?_⟩
      change (projectOpenFlowNodeOccurrences? program (merge.selection.apply state)).isSome = true
      rw [merge.selection.open_occurrences_frame program state instanceId running]
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
    fireInternalAlternative? program state prepared.operation prepared.alternative = some (prepared.apply program state) ∧
      applyPreparedInternalTransition? program state prepared = some (prepared.apply program state) := by
  constructor
  · cases prepared <;> simp only [PreparedInternalTransition.operation, PreparedInternalTransition.alternative,
      fireInternalAlternative_operation, PreparedInternalTransition.apply]
    case arming arm => exact (prepared_arming_applies program state arm snapshots selected).1
    case timerTask contract patch =>
        exact prepareInternalTimerTaskContract_refines_operation program state contract patch selected
    case messageTask contract patch =>
        exact prepareInternalMessageTaskContract_refines_operation program state contract patch selected.2
    case boundedScope contract scope =>
        exact prepareInternalBoundedScope_refines program state contract scope selected.2
    case localControl localPrepared =>
        exact prepareInternalLocalControl_refines program state localPrepared.operation
          localPrepared snapshots selected
    case scopeCreation scope =>
        exact prepareInternalScopeCreation_refines program state scope.selection.operation scope selected
    case ordinaryEnd ending =>
        exact prepareInternalEnd_refines program state ending.operation ending selected
    case regional regional =>
        obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program state _ regional selected
        simpa only [PreparedInternalTransition.operation, PreparedInternalTransition.apply, applied, Option.getD_some] using fired
    case mergeInput merge =>
        exact prepareInternalMerge_refines program state merge.selection.operation merge.selection.alternative merge selected
  · simp [applyPreparedInternalTransition?, snapshots, selected]

end BpmnSemantics.SemanticProcess.InternalCommutation
