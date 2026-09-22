import BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.ControlPositionDeltaProofs

/-! # Data-arming execution and transition record

The complete predecessor preparation supplies the actual evaluator and committed record. The
legacy evaluator retains its existing snapshot-declaration boundary.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepareInternalDataArmingContract_applies
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    fire? program contract.operation state = some (applyInternalDataArmingPatch state patch) := by
  have activated := prepareInternalDataArmingContract_refines_activation
    program state contract patch prepared
  unfold fire?
  rw [snapshotAbsent]
  cases contract with
  | mk id origin input output taskId taskName data =>
      cases data <;> exact activated

theorem internalTransitionRecord_prepared_data
    (program : Program) (state : RuntimeState) (contract : InternalDataArmingContract)
    (patch : InternalDataArmingPatch)
    (programValid : programWellFormed program = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    internalTransitionRecord? program state contract.operation = some
      { operationId := contract.operation.id
        operationKind := contract.operation.kind
        origin := contract.operation.origin
        owner := patch.arm.owner } := by
  obtain ⟨owner, inputOrigin, source, owned, _, selected, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  have member : contract.operation ∈ program.operations := by
    simp only [exactProgramSelection, Bool.and_eq_true, decide_eq_true_eq] at selected
    have positive : 0 < (program.operations.filter
        fun candidate => decide (candidate = contract.operation)).length := by omega
    obtain ⟨candidate, filtered⟩ :=
      List.exists_mem_of_ne_nil _ (List.length_pos_iff.mp positive)
    obtain ⟨member, same⟩ := List.mem_filter.mp filtered
    simpa only [of_decide_eq_true same] using member
  have idsNodup := strictlySortedStrings_nodup _
    (programWellFormed_operationIdsSorted program programValid)
  have selectedById : program.operations.filter
      (fun candidate => decide (candidate.id = contract.operation.id)) = [contract.operation] :=
    filter_eq_singleton_of_key_nodup program.operations (fun candidate => candidate.id.value)
      (fun candidate => decide (candidate.id = contract.operation.id)) contract.operation idsNodup
      member (by simp) (by
        intro candidate _ accepted
        exact congrArg OperationId.value (of_decide_eq_true accepted))
  apply internalTransitionRecord_of_selection program state contract.operation owner selectedById
  cases dataEq : contract.data <;>
    simpa [selectedOperationOwner?, flowNodeSelectedOperationOwner?,
      InternalDataArmingContract.operation, dataEq] using owned

theorem controlPositionDelta_prepared_data_arm
    (program : Program) (expectedInstanceId : SemanticId) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (position : runtimePositionValid program expectedInstanceId state = true)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    controlPositionDelta? program expectedInstanceId state (applyInternalDataArmingPatch state patch) =
      some
        { consumedTokens :=
            [PublicControlTokenPosition.mk patch.arm.inputOrigin.elementId patch.arm.owner 1]
          producedTokens := []
          enteredScopes := []
          exitedScopes := [] } := by
  obtain ⟨owner, inputOrigin, source, owned, _, _, _, originFound, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  exact controlPositionDelta_consumed_token program expectedInstanceId state _ _ position
    owned originFound rfl rfl rfl rfl

end BpmnSemantics.SemanticProcess.InternalCommutation
