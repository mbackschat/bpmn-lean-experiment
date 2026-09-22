import BpmnSemantics.SemanticProcess.InternalBoundedScopePreparationFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationRegionalFrame
import BpmnSemantics.SemanticProcess.InternalRegionalArmingFrames

/-! Regional retirement preserves the full bounded-entry artifact through the existing child
read populations and removal-only resource law. No intermediate state is assumed valid.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalBoundedScope_after_independent_regional
    (program : Program) (before after : RuntimeState)
    (contract : InternalBoundedScopeContract) (bounded : PreparedInternalBoundedScope)
    (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program bounded.runtimeInstanceId before = true)
    (found : prepareInternalBoundedScope? program before contract = some bounded)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (independent : regionalStateFootprintsIndependent regional.footprint bounded.footprint = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    prepareInternalBoundedScope? program after contract = some bounded := by
  obtain ⟨selected, hosting, owner, _, _, _, selection, running, _, _, _, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program before contract bounded found
  have runningControl : before.control = .running hosting := by
    cases control : before.control <;> simp_all [runningInstance?]
  have separated := boundedScope_other_child_independent regional.footprint selected hosting owner independent
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts before contract selected selection
  obtain ⟨entryAfter, control, time, ownerFrame, input, output, counter⟩ :=
    scopeCreation_after_regional_reads program before after operation contract.entryOperation regional entry
      hosting owner valid regionalFound entryFound runningControl separated applied
  have retirement := preparedRegional_arming_retirement program before after operation regional regionalFound applied
  have selectedAfter := selectInternalBoundedScope_read_frame before after contract _ selection
    (entryAfter.trans entryFound.symm) time
    (by simp only [timerActivationCount, retirement.timers])
    (by simp only [activityActivationCount, retirement.activities])
  apply prepareInternalBoundedScope_read_frame program before after contract _ found selectedAfter
    control time ownerFrame input output counter
  dsimp only [makeInternalBoundedScopePreparation]
  rw [joint]
  simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true, Bool.not_eq_true'] at joint ⊢
  refine ⟨⟨joint.1.1, retirement.anchor_absent _ joint.1.2⟩, ?_⟩
  apply List.any_eq_false.mpr
  intro record member
  exact List.any_eq_false.mp joint.2 record (retirement.records member)

end BpmnSemantics.SemanticProcess.InternalCommutation
